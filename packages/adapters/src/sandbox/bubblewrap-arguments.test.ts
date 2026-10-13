import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COMMAND_SEPARATOR, NULL_DEVICE, renderBubblewrapArguments, type BubblewrapPolicy } from './bubblewrap-arguments.ts';
import { UnsafeSandboxPathError } from './unsafe-sandbox-path.ts';

const POLICY: BubblewrapPolicy = {
  workingDirectory: '/factory/worktrees/slot-1',
  writableDirectories: ['/tmp', '/home/operator/.npm'],
  hiddenDirectories: ['/home/operator/.ssh', '/run/user'],
  hiddenFiles: ['/home/operator/.netrc'],
  engineSockets: [],
  readOnlyDirectories: [],
  network: false,
};

interface UnsafePolicy {
  readonly name: string;
  readonly change: Partial<BubblewrapPolicy>;
}

const UNSAFE_POLICIES: readonly UnsafePolicy[] = [
  { name: 'a relative working directory', change: { workingDirectory: 'worktree' } },
  { name: 'a relative writable directory', change: { writableDirectories: ['cache'] } },
  { name: 'a relative hidden directory', change: { hiddenDirectories: ['.ssh'] } },
  { name: 'a relative hidden file', change: { hiddenFiles: ['.netrc'] } },
  { name: 'a quote', change: { writableDirectories: ['/tmp/a"b'] } },
  { name: 'a backslash', change: { hiddenDirectories: ['/tmp/a\\b'] } },
  { name: 'a line feed', change: { hiddenFiles: ['/tmp/a\nb'] } },
  { name: 'a carriage return', change: { workingDirectory: '/tmp/a\rb' } },
  { name: 'a null character', change: { writableDirectories: ['/tmp/a\u0000b'] } },
  { name: 'a relative engine socket', change: { engineSockets: [{ source: 'docker.sock', destination: 'docker.sock' }] } },
  { name: 'a relative engine socket destination', change: { engineSockets: [{ source: '/run/docker.sock', destination: 'docker.sock' }] } },
  { name: 'a relative read-only directory', change: { readOnlyDirectories: ['references/tokens@v1'] } },
  { name: 'a quote in a read-only directory', change: { readOnlyDirectories: ['/tmp/a"b'] } },
];

const OPTION_OPERAND_COUNTS: Readonly<Record<string, number>> = {
  '--die-with-parent': 0,
  '--new-session': 0,
  '--unshare-pid': 0,
  '--unshare-ipc': 0,
  '--unshare-uts': 0,
  '--unshare-net': 0,
  '--ro-bind': 2,
  '--ro-bind-try': 2,
  '--bind': 2,
  '--bind-try': 2,
  '--dev-bind': 2,
  '--dev': 1,
  '--proc': 1,
  '--tmpfs': 1,
  '--chdir': 1,
};

const ISOLATION = ['--die-with-parent', '--new-session', '--unshare-pid', '--unshare-ipc', '--unshare-uts'];
const ROOT_AND_SYSTEM_FILESYSTEMS = ['--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc'];

function safePath(): fc.Arbitrary<string> {
  return fc
    .array(fc.stringMatching(/^[a-z][a-z0-9._-]{0,8}$/), { minLength: 1, maxLength: 4 })
    .map((segments) => `/${segments.join('/')}`);
}

function indexesOf(arguments_: readonly string[], option: string): readonly number[] {
  return arguments_.flatMap((argument, index) => (argument === option ? [index] : []));
}

describe('renderBubblewrapArguments', () => {
  it('mounts a read-only root, then the writable directories, then hides the credentials, and ends at the command', () => {
    expect(renderBubblewrapArguments(POLICY)).toEqual([
      ...ISOLATION,
      '--unshare-net',
      ...ROOT_AND_SYSTEM_FILESYSTEMS,
      '--bind',
      '/factory/worktrees/slot-1',
      '/factory/worktrees/slot-1',
      '--bind-try',
      '/tmp',
      '/tmp',
      '--bind-try',
      '/home/operator/.npm',
      '/home/operator/.npm',
      '--tmpfs',
      '/home/operator/.ssh',
      '--tmpfs',
      '/run/user',
      '--dev-bind',
      NULL_DEVICE,
      '/home/operator/.netrc',
      '--chdir',
      '/factory/worktrees/slot-1',
      COMMAND_SEPARATOR,
    ]);
  });

  it('uses only options bubblewrap defines, each followed by the operands it takes, up to the separator', () => {
    for (const network of [false, true]) {
      const args = renderBubblewrapArguments({ ...POLICY, network });
      let index = 0;
      while (args[index] !== COMMAND_SEPARATOR) {
        const operands = OPTION_OPERAND_COUNTS[args[index] ?? ''];
        expect(operands, `option ${args[index]}`).toBeDefined();
        index += 1 + (operands ?? 0);
      }
      expect(index).toBe(args.length - 1);
    }
  });

  it('shares the network only for a scope that is granted it', () => {
    const closed = renderBubblewrapArguments(POLICY);
    const open = renderBubblewrapArguments({ ...POLICY, network: true });
    expect(closed).toContain('--unshare-net');
    expect(open).not.toContain('--unshare-net');
    expect(open).toEqual(closed.filter((argument) => argument !== '--unshare-net'));
  });

  it('writes nothing but the isolation, the root and the working directory for an empty policy', () => {
    const args = renderBubblewrapArguments({ workingDirectory: '/work', writableDirectories: [], hiddenDirectories: [], hiddenFiles: [], engineSockets: [], readOnlyDirectories: [], network: true });
    expect(args).toEqual([...ISOLATION, ...ROOT_AND_SYSTEM_FILESYSTEMS, '--bind', '/work', '/work', '--chdir', '/work', '--']);
  });

  it('binds each granted engine socket back in after the hidden paths, so a hidden runtime directory still lets it through', () => {
    const args = renderBubblewrapArguments({ ...POLICY, engineSockets: [{ source: '/run/user/1000/docker.sock', destination: '/run/user/1000/docker.sock' }] });
    const socket = args.indexOf('/run/user/1000/docker.sock');
    expect(args.slice(socket - 1, socket + 2)).toEqual(['--bind-try', '/run/user/1000/docker.sock', '/run/user/1000/docker.sock']);
    expect(socket).toBeGreaterThan(args.indexOf('/run/user'));
    expect(socket).toBeGreaterThan(args.indexOf('/home/operator/.netrc'));
    expect(args.slice(-3)).toEqual(['--chdir', '/factory/worktrees/slot-1', COMMAND_SEPARATOR]);
  });

  it('mounts each read-only directory on itself after everything else, so a writable parent and a hidden one leave it read-only', () => {
    const args = renderBubblewrapArguments({ ...POLICY, writableDirectories: ['/home/operator/.agent-factory'], hiddenDirectories: ['/home/operator/.agent-factory/state'], readOnlyDirectories: ['/home/operator/.agent-factory/projects/storefront/references/tokens@v1'] });
    const snapshot = args.indexOf('/home/operator/.agent-factory/projects/storefront/references/tokens@v1');
    expect(args.slice(snapshot - 1, snapshot + 2)).toEqual(['--ro-bind-try', '/home/operator/.agent-factory/projects/storefront/references/tokens@v1', '/home/operator/.agent-factory/projects/storefront/references/tokens@v1']);
    expect(snapshot).toBeGreaterThan(args.indexOf('/home/operator/.agent-factory'));
    expect(snapshot).toBeGreaterThan(args.indexOf('/home/operator/.agent-factory/state'));
    expect(args.slice(-3)).toEqual(['--chdir', '/factory/worktrees/slot-1', COMMAND_SEPARATOR]);
  });

  it.each(UNSAFE_POLICIES)('refuses $name, as the macOS profile does', ({ change }) => {
    expect(() => renderBubblewrapArguments({ ...POLICY, ...change })).toThrow(UnsafeSandboxPathError);
  });

  it.each(['/', '//', '/.', '/tmp/..', '/tmp/../'])('never makes the root %j writable', (root) => {
    expect(() => renderBubblewrapArguments({ ...POLICY, workingDirectory: root })).toThrow(UnsafeSandboxPathError);
    expect(() => renderBubblewrapArguments({ ...POLICY, writableDirectories: [root] })).toThrow(UnsafeSandboxPathError);
  });

  it('puts the read-only root before every mount that overlays it, and every hidden path after every writable one', () => {
    fc.assert(
      fc.property(safePath(), fc.array(safePath()), fc.array(safePath()), fc.array(safePath()), fc.boolean(), (working, writable, directories, files, network) => {
        const args = renderBubblewrapArguments({ workingDirectory: working, writableDirectories: writable, hiddenDirectories: directories, hiddenFiles: files, engineSockets: [], readOnlyDirectories: [], network });
        const binds = [...indexesOf(args, '--bind'), ...indexesOf(args, '--bind-try')];
        const hides = [...indexesOf(args, '--tmpfs'), ...args.flatMap((argument, index) => (argument === '--dev-bind' && args[index + 1] === NULL_DEVICE ? [index] : []))];
        const root = args.indexOf('--ro-bind');
        expect(args.slice(root, root + 3)).toEqual(['--ro-bind', '/', '/']);
        expect(binds.every((index) => index > root + 2)).toBe(true);
        expect(hides.every((index) => binds.every((bind) => index > bind))).toBe(true);
        expect(args.slice(-3)).toEqual(['--chdir', working, COMMAND_SEPARATOR]);
        expect(args.includes('--unshare-net')).toBe(!network);
        expect(binds).toHaveLength(1 + writable.length);
        expect(hides).toHaveLength(directories.length + files.length);
      }),
    );
  });

  it('binds the read-only directories on themselves, in order, after every writable, hidden and engine mount', () => {
    fc.assert(
      fc.property(safePath(), fc.array(safePath()), fc.array(safePath()), fc.uniqueArray(safePath()), (working, writable, hidden, readOnly) => {
        const args = renderBubblewrapArguments({ workingDirectory: working, writableDirectories: writable, hiddenDirectories: hidden, hiddenFiles: [], engineSockets: [], readOnlyDirectories: readOnly, network: true });
        const readOnlyBinds = indexesOf(args, '--ro-bind-try');
        const earlier = [...indexesOf(args, '--bind'), ...indexesOf(args, '--bind-try'), ...indexesOf(args, '--tmpfs')];
        expect(readOnlyBinds.map((index) => args.slice(index + 1, index + 3))).toEqual(readOnly.map((directory) => [directory, directory]));
        expect(readOnlyBinds.every((index) => earlier.every((other) => index > other))).toBe(true);
        expect(args.slice(-3)).toEqual(['--chdir', working, COMMAND_SEPARATOR]);
      }),
    );
  });

  it('mounts every directory it is given on itself and nothing else', () => {
    fc.assert(
      fc.property(safePath(), fc.array(safePath()), (working, writable) => {
        const args = renderBubblewrapArguments({ workingDirectory: working, writableDirectories: writable, hiddenDirectories: [], hiddenFiles: [], engineSockets: [], readOnlyDirectories: [], network: true });
        const mounts = indexesOf(args, '--bind').concat(indexesOf(args, '--bind-try')).map((index) => args.slice(index + 1, index + 3));
        expect(mounts.every(([source, destination]) => source === destination)).toBe(true);
        expect(mounts.map(([source]) => source).sort()).toEqual([working, ...writable].sort());
      }),
    );
  });
});
