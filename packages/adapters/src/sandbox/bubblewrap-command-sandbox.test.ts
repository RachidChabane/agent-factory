import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BUBBLEWRAP_EXECUTABLE, COMMAND_SEPARATOR, NULL_DEVICE } from './bubblewrap-arguments.ts';
import { BubblewrapCommandSandbox } from './bubblewrap-command-sandbox.ts';
import type { CommandSandboxSettings } from './command-sandbox-settings.ts';
import { LINUX_PRIVATE_RUNTIME_PATHS } from './credential-paths.ts';
import type { PathPattern } from './path-patterns.ts';
import { UnsafeSandboxPathError } from './unsafe-sandbox-path.ts';

function exact(path: string): PathPattern {
  return { path, prefix: false };
}

function sequence(args: readonly string[], ...expected: readonly string[]): boolean {
  return args.some((_argument, index) => expected.every((item, offset) => args[index + offset] === item));
}

describe('BubblewrapCommandSandbox', () => {
  let root: string;
  let worktree: string;
  let worktreeLink: string;
  let cache: string;
  let temporary: string;
  let credentials: string;
  let token: string;
  let runtime: string;
  let settings: CommandSandboxSettings;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'factory-bwrap-unit-')));
    worktree = join(root, 'worktree');
    worktreeLink = join(root, 'worktree-link');
    cache = join(root, 'cache');
    temporary = join(root, 'temporary');
    credentials = join(root, 'credentials');
    token = join(root, 'token');
    runtime = join(root, 'runtime');
    await Promise.all([worktree, cache, temporary, credentials, runtime].map((directory) => mkdir(directory)));
    await writeFile(token, 'secret');
    await symlink(worktree, worktreeLink);
    settings = {
      deniedReads: [exact(credentials), exact(token), exact(join(root, 'absent'))],
      writableDirectories: [cache, join(root, 'cache-created-later')],
      temporaryDirectories: [temporary],
      blockedPorts: () => [],
    };
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function sandbox(change: Partial<CommandSandboxSettings> = {}, privateRuntimePaths: readonly string[] = []): BubblewrapCommandSandbox {
    return new BubblewrapCommandSandbox({ ...settings, ...change }, privateRuntimePaths);
  }

  it('wraps the command in bubblewrap, after a separator, and leaves it untouched', () => {
    const command = ['/bin/sh', '-c', 'npm test -- --bind /etc'];
    const args = sandbox().confine(command, { workingDirectory: worktree, network: false });
    expect(args[0]).toBe(BUBBLEWRAP_EXECUTABLE);
    expect(args.slice(-command.length)).toEqual(command);
    expect(args[args.length - command.length - 1]).toBe(COMMAND_SEPARATOR);
  });

  it('keeps the command last, whatever it contains', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { minLength: 1 }), fc.boolean(), (command, network) => {
        const args = sandbox().confine(command, { workingDirectory: worktree, network });
        expect(args.slice(-command.length)).toEqual(command);
        expect(args[args.length - command.length - 1]).toBe(COMMAND_SEPARATOR);
      }),
      { numRuns: 50 },
    );
  });

  it('shares the host network with a command inside a stack, since its services listen on the host loopback', () => {
    expect(sandbox().confine(['true'], { workingDirectory: worktree, network: false })).toContain('--unshare-net');
    expect(sandbox().confine(['true'], { workingDirectory: worktree, network: false, hostLoopback: true })).not.toContain('--unshare-net');
  });

  it('works in the canonical worktree, whatever name the scope gives it', () => {
    const args = sandbox().confine(['true'], { workingDirectory: worktreeLink, network: false });
    expect(sequence(args, '--bind', worktree, worktree)).toBe(true);
    expect(sequence(args, '--chdir', worktree, COMMAND_SEPARATOR)).toBe(true);
    expect(args).not.toContain(worktreeLink);
  });

  it('binds the temporary and configured directories once each, without the worktree among them', () => {
    const args = sandbox({ writableDirectories: [cache, worktreeLink, cache], temporaryDirectories: [temporary, cache] }).confine(['true'], {
      workingDirectory: worktree,
      network: false,
    });
    const bound = args.flatMap((argument, index) => (argument === '--bind-try' ? [args[index + 1]] : []));
    expect(bound).toEqual([temporary, cache]);
    expect(args.filter((argument) => argument === worktree)).toHaveLength(3);
  });

  it('hides a directory and a file of the credentials and nothing that does not exist', () => {
    const args = sandbox().confine(['true'], { workingDirectory: worktree, network: false });
    expect(sequence(args, '--tmpfs', credentials)).toBe(true);
    expect(sequence(args, '--ro-bind', NULL_DEVICE, token)).toBe(true);
    expect(args.some((argument) => argument.startsWith(join(root, 'absent')))).toBe(false);
  });

  it('hides the private runtime paths of the host along with the credentials', () => {
    const args = sandbox({}, [runtime, join(root, 'run-absent')]).confine(['true'], { workingDirectory: worktree, network: false });
    expect(sequence(args, '--tmpfs', runtime)).toBe(true);
    expect(sequence(args, '--tmpfs', credentials)).toBe(true);
  });

  it('keeps confining when a command plants entries among the host runtime paths', async () => {
    const shared = join(root, 'shared-runtime');
    await mkdir(join(shared, 'ssh-agent'), { recursive: true });
    await writeFile(join(shared, 'ssh-quote"name'), 'planted');
    await symlink(worktree, join(shared, 'ssh-link-to-worktree'));
    await symlink('/', join(shared, 'ssh-link-to-root'));
    const args = sandbox({}, [`${shared}/ssh-*`]).confine(['true'], { workingDirectory: worktree, network: false });
    expect(sequence(args, '--tmpfs', join(shared, 'ssh-agent'))).toBe(true);
    expect(sequence(args, '--tmpfs', worktree)).toBe(false);
    expect(sequence(args, '--tmpfs', '/')).toBe(false);
    expect(args.some((argument) => argument.includes('"'))).toBe(false);
  });

  it('names the agent, bus and container sockets of a Linux host among its default private paths', () => {
    expect(LINUX_PRIVATE_RUNTIME_PATHS).toEqual(expect.arrayContaining(['/run/user', '/run/docker.sock', '/tmp/ssh-*']));
    expect(LINUX_PRIVATE_RUNTIME_PATHS.every((path) => path.startsWith('/'))).toBe(true);
    const args = new BubblewrapCommandSandbox(settings).confine(['true'], { workingDirectory: worktree, network: false });
    expect(sequence(args, '--tmpfs', credentials)).toBe(true);
  });

  it('closes the network of a scope that is not granted it, and shares the host network otherwise', () => {
    expect(sandbox().confine(['true'], { workingDirectory: worktree, network: false })).toContain('--unshare-net');
    expect(sandbox().confine(['true'], { workingDirectory: worktree, network: true })).not.toContain('--unshare-net');
  });

  it('renders no port rule, which bubblewrap cannot express', () => {
    const scope = { workingDirectory: worktree, network: true };
    expect(sandbox({ blockedPorts: () => [7430, 5199] }).confine(['true'], scope)).toEqual(sandbox().confine(['true'], scope));
  });

  it('reads the credentials present when the command starts', async () => {
    const later = join(root, 'created-after-construction');
    const subject = sandbox({ deniedReads: [exact(later)] });
    const scope = { workingDirectory: worktree, network: false };
    expect(subject.confine(['true'], scope)).not.toContain(later);
    await mkdir(later);
    expect(sequence(subject.confine(['true'], scope), '--tmpfs', later)).toBe(true);
  });

  it.each(['/', '/tmp/a"b', 'relative/cache'])('refuses to bind %j as a writable directory', (directory) => {
    expect(() => sandbox({ writableDirectories: [directory] }).confine(['true'], { workingDirectory: worktree, network: false })).toThrow(UnsafeSandboxPathError);
  });

  it('refuses a worktree whose name cannot be written safely', () => {
    expect(() => sandbox().confine(['true'], { workingDirectory: '/factory/work"tree', network: false })).toThrow(UnsafeSandboxPathError);
  });
});
