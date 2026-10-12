import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { CommandSandbox } from '@agent-factory/application';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SpawnCommandRunner } from '../process/spawnCommandRunner.ts';
import { BUBBLEWRAP_EXECUTABLE } from './bubblewrap-arguments.ts';
import { createCommandSandbox } from './command-sandbox-factory.ts';
import type { CommandSandboxSettings } from './command-sandbox-settings.ts';
import { containerEngineSockets, ENGINE_HOST_VARIABLE } from './container-engine-sockets.ts';

const SECRET = 'engine-registry-credential';
const REACHED = 'reached';
const UNREACHABLE = 'unreachable';
const CONNECT_TIMEOUT_MS = 3_000;
const RUN_TIMEOUT_MS = 30_000;
const KILL_GRACE_MS = 500;
const DARWIN = 'darwin';
const LINUX = 'linux';

function onPath(executable: string): boolean {
  return (process.env['PATH'] ?? '').split(delimiter).some((directory) => directory !== '' && existsSync(join(directory, executable)));
}

const CONFINEMENT_AVAILABLE =
  (process.platform === DARWIN && process.env['AGENT_FACTORY_REAL_SANDBOX'] === '1') || (process.platform === LINUX && onPath(BUBBLEWRAP_EXECUTABLE));

function connectionProbe(path: string): string {
  return [
    `const socket = require('node:net').connect(${JSON.stringify({ path })});`,
    `socket.setTimeout(${CONNECT_TIMEOUT_MS}, () => { console.log('${UNREACHABLE}'); socket.destroy(); });`,
    `socket.once('connect', () => { console.log('${REACHED}'); socket.destroy(); });`,
    `socket.once('error', () => console.log('${UNREACHABLE}'));`,
  ].join('\n');
}

function answerWithNothing(connection: Socket): void {
  connection.on('error', () => connection.destroy());
  connection.end();
}

describe.skipIf(!CONFINEMENT_AVAILABLE)('container engine socket grant', () => {
  const runner = new SpawnCommandRunner({ killGraceMs: KILL_GRACE_MS });
  const environment = { PATH: process.env['PATH'] ?? '' };
  let root: string;
  let worktree: string;
  let engineHome: string;
  let socket: string;
  let declaredSocket: string;
  let engine: Server;

  function sandbox(granted: readonly string[]): CommandSandbox {
    const settings: CommandSandboxSettings = {
      deniedReads: [{ path: engineHome, prefix: false }],
      writableDirectories: [],
      temporaryDirectories: [],
      blockedPorts: () => [],
      engineSockets: () => granted,
    };
    return createCommandSandbox(process.platform, settings);
  }

  async function confined(subject: CommandSandbox, command: readonly string[], network: boolean): Promise<string> {
    const result = await runner.run(subject.confine(command, { workingDirectory: worktree, network }), worktree, RUN_TIMEOUT_MS, environment);
    return `${result.stdout}`.trim();
  }

  const probe = (path: string): readonly string[] => [process.execPath, '-e', connectionProbe(path)];

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'fe-')));
    worktree = join(root, 'w');
    engineHome = join(root, 'cred');
    await Promise.all([mkdir(worktree), mkdir(join(engineHome, 'run'), { recursive: true }), mkdir(join(root, 'var'))]);
    await writeFile(join(engineHome, 'config.json'), SECRET);
    socket = join(engineHome, 'run', 'e.sock');
    declaredSocket = join(root, 'var', 'e.sock');
    await symlink(socket, declaredSocket);
    engine = createServer(answerWithNothing);
    await new Promise<void>((resolve, reject) => {
      engine.once('error', reject);
      engine.listen(socket, () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => engine.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });

  it('answers an unconfined client, so what is refused below is the sandbox', async () => {
    const result = await runner.run(probe(socket), worktree, RUN_TIMEOUT_MS, environment);
    expect(result.stdout.trim()).toBe(REACHED);
  });

  it.each([false, true])('keeps the engine out of reach without the grant (network: %s)', async (network) => {
    expect(await confined(sandbox([]), probe(socket), network)).toBe(UNREACHABLE);
  });

  it.each([false, true])('reaches the granted engine socket inside a denied directory (network: %s)', async (network) => {
    expect(await confined(sandbox([socket]), probe(socket), network)).toBe(REACHED);
  });

  it('reaches the engine through the endpoint the environment declares, link and all', async () => {
    const granted = containerEngineSockets({ platform: process.platform, home: root, environment: { [ENGINE_HOST_VARIABLE]: `unix://${declaredSocket}` } });
    expect(granted).toEqual(expect.arrayContaining([declaredSocket, socket]));
    expect(await confined(sandbox(granted), probe(declaredSocket), false)).toBe(REACHED);
  });

  it('keeps the rest of the denied directory unreadable while the socket is granted', async () => {
    const read = await confined(sandbox([socket]), ['/bin/sh', '-c', `cat '${join(engineHome, 'config.json')}' 2>/dev/null || true`], false);
    expect(read).not.toContain(SECRET);
  });
});
