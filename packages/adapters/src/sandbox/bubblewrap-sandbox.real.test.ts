import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { CommandResult } from '@agent-factory/application';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SpawnCommandRunner } from '../process/spawnCommandRunner.ts';
import { BUBBLEWRAP_EXECUTABLE } from './bubblewrap-arguments.ts';
import { BubblewrapCommandSandbox } from './bubblewrap-command-sandbox.ts';
import type { CommandSandboxSettings } from './command-sandbox-settings.ts';
import type { PathPattern } from './path-patterns.ts';

const SECRET = 'factory-credential-canary';
const REACHED = 'reached';
const UNREACHABLE = 'unreachable';
const LOOPBACK_ADDRESS = '127.0.0.1';
const CONNECT_TIMEOUT_MS = 3_000;
const RUN_TIMEOUT_MS = 30_000;
const KILL_GRACE_MS = 500;
const MAX_VISIBLE_PROCESSES = 10;
const UNIX_SOCKET_NAME = 'agent.sock';

function onPath(executable: string): boolean {
  return (process.env['PATH'] ?? '').split(delimiter).some((directory) => directory !== '' && existsSync(join(directory, executable)));
}

function exact(path: string): PathPattern {
  return { path, prefix: false };
}

function connectionProbe(options: object): string {
  return [
    `const socket = require('node:net').connect(${JSON.stringify(options)});`,
    `socket.setTimeout(${CONNECT_TIMEOUT_MS}, () => { console.log('${UNREACHABLE}'); socket.destroy(); });`,
    `socket.once('connect', () => { console.log('${REACHED}'); socket.destroy(); });`,
    `socket.once('error', () => console.log('${UNREACHABLE}'));`,
  ].join('\n');
}

function answerWithNothing(connection: Socket): void {
  connection.on('error', () => connection.destroy());
  connection.end();
}

function listening(server: Server, listen: (ready: () => void) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    listen(() => resolve());
  });
}

function closed(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function tcpPort(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the throwaway server has no TCP address');
  return address.port;
}

describe.skipIf(process.platform !== 'linux' || !onPath(BUBBLEWRAP_EXECUTABLE))('bubblewrap confinement', () => {
  const runner = new SpawnCommandRunner({ killGraceMs: KILL_GRACE_MS });
  const environment = { PATH: process.env['PATH'] ?? '' };
  let root: string;
  let worktree: string;
  let outside: string;
  let credentials: string;
  let deniedFile: string;
  let cache: string;
  let scratch: string;
  let runtime: string;
  let tcpServer: Server;
  let unixServer: Server;
  let sandbox: BubblewrapCommandSandbox;

  function settings(change: Partial<CommandSandboxSettings> = {}): CommandSandboxSettings {
    return { deniedReads: [exact(credentials), exact(deniedFile)], writableDirectories: [], temporaryDirectories: [], blockedPorts: () => [], ...change };
  }

  function run(subject: BubblewrapCommandSandbox, command: readonly string[], network: boolean): Promise<CommandResult> {
    return runner.run(subject.confine(command, { workingDirectory: worktree, network }), worktree, RUN_TIMEOUT_MS, environment);
  }

  function shell(script: string, network = false, subject: BubblewrapCommandSandbox = sandbox): Promise<CommandResult> {
    return run(subject, ['/bin/sh', '-c', script], network);
  }

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'factory-bwrap-')));
    worktree = join(root, 'worktree');
    outside = join(root, 'outside');
    credentials = join(root, 'credentials');
    deniedFile = join(root, 'denied.token');
    cache = join(root, 'cache');
    scratch = join(root, 'scratch');
    runtime = join(root, 'runtime');
    await Promise.all([worktree, outside, credentials, cache, scratch, runtime].map((directory) => mkdir(directory)));
    await writeFile(join(credentials, 'token'), SECRET);
    await writeFile(deniedFile, SECRET);
    tcpServer = createServer(answerWithNothing);
    unixServer = createServer(answerWithNothing);
    await Promise.all([
      listening(tcpServer, (ready) => tcpServer.listen(0, LOOPBACK_ADDRESS, ready)),
      listening(unixServer, (ready) => unixServer.listen(join(runtime, UNIX_SOCKET_NAME), ready)),
    ]);
    sandbox = new BubblewrapCommandSandbox(settings(), []);
    const started = await shell('true');
    if (started.exitCode !== 0) {
      throw new Error(`bwrap cannot create a sandbox on this machine (are unprivileged user namespaces enabled?): ${started.stderr.trim()}`);
    }
  });

  afterAll(async () => {
    await Promise.all([closed(tcpServer), closed(unixServer)]);
    await rm(root, { recursive: true, force: true });
  });

  it('reads the secrets outside the sandbox, so what it hides below is the sandbox and not a missing file', async () => {
    expect(await readFile(deniedFile, 'utf8')).toBe(SECRET);
    expect(await readFile(join(credentials, 'token'), 'utf8')).toBe(SECRET);
  });

  it('hides a denied file and a denied directory from the command', async () => {
    const result = await shell(
      [
        `printf 'file=%s\\n' "$(cat '${deniedFile}' 2>&1)"`,
        `printf 'directory=%s\\n' "$(ls -A '${credentials}' 2>&1)"`,
        `if [ -e '${credentials}/token' ]; then echo token=visible; else echo token=hidden; fi`,
      ].join('\n'),
    );
    expect(result.stdout.split('\n')).toEqual(['file=', 'directory=', 'token=hidden', '']);
    expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET);
  });

  it('writes the worktree and refuses every other place on the disk', async () => {
    const result = await shell(`echo built > '${worktree}/artifact' && echo wrote-worktree; echo leaked > '${outside}/probe' 2>/dev/null && echo escaped || echo refused`);
    expect(result.stdout.split('\n')).toEqual(['wrote-worktree', 'refused', '']);
    expect(await readFile(join(worktree, 'artifact'), 'utf8')).toBe('built\n');
    await expect(readFile(join(outside, 'probe'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('writes the configured and the temporary directories as well', async () => {
    const subject = new BubblewrapCommandSandbox(settings({ writableDirectories: [cache], temporaryDirectories: [scratch] }), []);
    await shell(`echo cached > '${cache}/entry'; echo scratched > '${scratch}/entry'`, false, subject);
    expect(await readFile(join(cache, 'entry'), 'utf8')).toBe('cached\n');
    expect(await readFile(join(scratch, 'entry'), 'utf8')).toBe('scratched\n');
  });

  it('starts the command in the worktree, in a process namespace of its own', async () => {
    const result = await shell("pwd; ls /proc | grep -c '^[0-9]'");
    const [directory, visibleProcesses] = result.stdout.split('\n');
    expect(directory).toBe(worktree);
    expect(Number(visibleProcesses)).toBeLessThanOrEqual(MAX_VISIBLE_PROCESSES);
  });

  describe('network', () => {
    const probe = (port: number): readonly string[] => [process.execPath, '-e', connectionProbe({ host: LOOPBACK_ADDRESS, port })];

    it('answers an unconfined client, so what is refused below is the sandbox', async () => {
      const result = await runner.run(probe(tcpPort(tcpServer)), worktree, RUN_TIMEOUT_MS, environment);
      expect(result.stdout.trim()).toBe(REACHED);
    });

    it('cannot reach the host without the grant', async () => {
      expect((await run(sandbox, probe(tcpPort(tcpServer)), false)).stdout.trim()).toBe(UNREACHABLE);
    });

    it('shares the host network with the grant', async () => {
      expect((await run(sandbox, probe(tcpPort(tcpServer)), true)).stdout.trim()).toBe(REACHED);
    });
  });

  describe('sockets of the host', () => {
    const socketProbe = (): readonly string[] => [process.execPath, '-e', connectionProbe({ path: join(runtime, UNIX_SOCKET_NAME) })];

    it('stay reachable through the filesystem when nothing hides them, even without the network', async () => {
      expect((await run(sandbox, socketProbe(), false)).stdout.trim()).toBe(REACHED);
    });

    it('are out of reach once their directory is among the private runtime paths', async () => {
      const subject = new BubblewrapCommandSandbox(settings(), [runtime]);
      expect((await run(subject, socketProbe(), false)).stdout.trim()).toBe(UNREACHABLE);
      expect((await run(subject, socketProbe(), true)).stdout.trim()).toBe(UNREACHABLE);
    });
  });
});
