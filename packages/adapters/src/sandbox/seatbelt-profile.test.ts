import fc from 'fast-check';
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BUILT_IN_CREDENTIAL_PATHS } from './credential-paths.ts';
import { RelativePathPatternError, concretePaths, parsePathPattern } from './path-patterns.ts';
import { SANDBOX_EXEC, SeatbeltCommandSandbox } from './seatbelt-command-sandbox.ts';
import { UnsafeSandboxPortError, renderSeatbeltProfile, type SeatbeltPolicy } from './seatbelt-profile.ts';
import { UnsafeSandboxPathError } from './unsafe-sandbox-path.ts';

const HOME = '/Users/operator';

const POLICY: SeatbeltPolicy = {
  deniedReads: [parsePathPattern('~/.ssh', HOME), parsePathPattern('~/.config/gws*', HOME)],
  writableDirectories: ['/factory/worktrees/slot-1', '/private/tmp'],
  socketDirectories: ['/factory/worktrees/slot-1'],
  engineSockets: [],
  readOnlyDirectories: [],
  deniedExecutables: ['/usr/bin/security'],
  deniedServices: ['com.apple.SecurityServer'],
  blockedPorts: [7430, 5199],
  network: false,
};

describe('renderSeatbeltProfile', () => {
  it('denies credential reads, keychain access, writes outside the allowed directories and the network', () => {
    const profile = renderSeatbeltProfile(POLICY);
    expect(profile).toContain('(deny file-read*\n  (subpath "/Users/operator/.ssh")\n  (regex #"^\\/Users\\/operator\\/\\.config\\/gws"))');
    expect(profile).toContain('(deny file-write*)\n(allow file-write*\n  (subpath "/factory/worktrees/slot-1")\n  (subpath "/private/tmp")');
    expect(profile).toContain('(deny mach-lookup\n  (global-name "com.apple.SecurityServer"))');
    expect(profile).toContain('(deny process-exec\n  (literal "/usr/bin/security"))');
    expect(profile).toContain('(deny network-outbound (require-all (require-not (remote ip "localhost:*")) (require-not (require-any (remote unix-socket (subpath "/factory/worktrees/slot-1"))))))');
    expect(profile).not.toContain('(remote ip "*:*")');
    expect(profile).not.toContain('(allow network-outbound');
  });

  it('opens the network only for a step granted it, and never the launchd sockets', () => {
    const profile = renderSeatbeltProfile({ ...POLICY, network: true });
    expect(profile).toContain(
      '(deny network-outbound (require-all (require-not (remote ip "*:*")) (require-not (require-any (remote unix-socket (subpath "/factory/worktrees/slot-1")) (remote unix-socket (literal "/private/var/run/mDNSResponder"))))))',
    );
    expect(profile.trimEnd().endsWith('(remote unix-socket (regex #"^\\/private\\/tmp\\/com\\.apple\\.launchd\\.")))')).toBe(true);
  });

  it.each([false, true])('denies the factory ports to every address, whatever the network grant (network: %s)', (network) => {
    const profile = renderSeatbeltProfile({ ...POLICY, network });
    expect(profile).toContain('(deny network-outbound\n  (remote ip "*:7430")\n  (remote ip "*:5199"))');
    expect(profile.indexOf('(remote ip "*:7430")')).toBeGreaterThan(profile.indexOf('(deny network-outbound (require-all'));
  });

  it('lets a granted engine socket through, readable even inside a denied directory, and nothing else of that directory', () => {
    const profile = renderSeatbeltProfile({ ...POLICY, deniedReads: [parsePathPattern('~/.docker', HOME)], engineSockets: ['/Users/operator/.docker/run/docker.sock'] });
    expect(profile).toContain('(deny file-read*\n  (subpath "/Users/operator/.docker"))\n(allow file-read*\n  (literal "/Users/operator/.docker/run/docker.sock"))');
    expect(profile).toContain('(require-not (require-any (remote unix-socket (subpath "/factory/worktrees/slot-1")) (remote unix-socket (literal "/Users/operator/.docker/run/docker.sock"))))');
    expect(profile.indexOf('(allow file-read*')).toBeLessThan(profile.indexOf('(deny file-write*)'));
  });

  it('grants reads of a read-only directory after the denies, and denies writes to it after the allowed ones', () => {
    const profile = renderSeatbeltProfile({
      ...POLICY,
      deniedReads: [parsePathPattern('/factory/state', HOME)],
      writableDirectories: ['/factory', '/private/tmp'],
      readOnlyDirectories: ['/factory/projects/storefront/references/tokens@v1'],
    });
    const snapshot = '(subpath "/factory/projects/storefront/references/tokens@v1")';
    expect(profile).toContain(`(allow file-read*\n  ${snapshot})`);
    expect(profile).toContain(`(deny file-write*\n  ${snapshot})`);
    expect(profile.indexOf(`(allow file-read*\n  ${snapshot})`)).toBeGreaterThan(profile.indexOf('(deny file-read*'));
    expect(profile.indexOf(`(deny file-write*\n  ${snapshot})`)).toBeGreaterThan(profile.indexOf('(allow file-write*'));
    expect(profile.trimEnd().endsWith(')')).toBe(true);
  });

  it('grants the reads of every read-only directory after the denies and ends with the denial of their writes, whatever they are', () => {
    const segment = fc.stringMatching(/^[a-z][a-z0-9._@-]{0,8}$/);
    const directory = fc.array(segment, { minLength: 1, maxLength: 4 }).map((segments) => `/${segments.join('/')}`);
    fc.assert(
      fc.property(fc.uniqueArray(directory, { minLength: 1, maxLength: 4 }), fc.boolean(), (directories, network) => {
        const profile = renderSeatbeltProfile({ ...POLICY, readOnlyDirectories: directories, network });
        const listed = directories.map((path) => `(subpath "${path}")`).join('\n  ');
        const lastWriteDenial = profile.lastIndexOf('(deny file-write*');
        expect(profile).toContain(`(allow file-read*\n  ${listed})`);
        expect(profile.indexOf('(allow file-read*')).toBeGreaterThan(profile.indexOf('(deny file-read*'));
        expect(profile.slice(lastWriteDenial)).toContain(`(deny file-write*\n  ${listed})`);
        expect(profile.lastIndexOf('(allow file-write*')).toBeLessThan(lastWriteDenial);
      }),
    );
  });

  it('refuses a read-only directory that would break out of its string literal', () => {
    expect(() => renderSeatbeltProfile({ ...POLICY, readOnlyDirectories: ['/tmp/a")(allow default'] })).toThrow(UnsafeSandboxPathError);
  });

  it('grants no engine socket unless one is given', () => {
    expect(renderSeatbeltProfile(POLICY)).not.toContain('(allow file-read*');
  });

  it('writes no port rule when no port is blocked', () => {
    expect(renderSeatbeltProfile({ ...POLICY, blockedPorts: [] })).not.toContain(':7430');
  });

  it.each([0, 65_536, 1.5, Number.NaN, -1])('refuses %s as a blocked port', (port) => {
    expect(() => renderSeatbeltProfile({ ...POLICY, blockedPorts: [port] })).toThrow(UnsafeSandboxPortError);
  });

  it('refuses a path that would break out of its string literal', () => {
    expect(() => renderSeatbeltProfile({ ...POLICY, writableDirectories: ['/tmp/a")(allow default'] })).toThrow(UnsafeSandboxPathError);
  });
});

describe('path patterns', () => {
  let root: string;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'factory-patterns-')));
    await Promise.all(['gws', 'gws-work', 'gh'].map((name) => mkdir(join(root, name))));
    await symlink(join(root, 'gh'), join(root, 'gh-link'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('expands a prefix pattern to the entries present and keeps literal paths as given', () => {
    const paths = concretePaths([parsePathPattern(`${root}/gws*`, HOME), parsePathPattern(`${root}/absent`, HOME)]);
    expect([...paths].sort()).toEqual([`${root}/absent`, `${root}/gws`, `${root}/gws-work`]);
  });

  it('denies the target of a link along with the link', () => {
    expect(concretePaths([parsePathPattern(`${root}/gh-link`, HOME)])).toEqual([`${root}/gh-link`, `${root}/gh`]);
  });

  it('resolves home-relative patterns and refuses relative ones', () => {
    expect(parsePathPattern('~/.claude*', HOME)).toEqual({ path: `${HOME}/.claude`, prefix: true });
    expect(() => parsePathPattern('.ssh', HOME)).toThrow(RelativePathPatternError);
  });

  it('covers the credential stores of the operator machine', () => {
    for (const path of ['~/.ssh', '~/.config/gcloud', '~/.config/gh', '~/.config/gws*', '~/.config/aiven', '~/.config/kcp', '~/.docker', '~/.aws', '~/.netrc', '~/.npmrc', '~/.claude*', '~/Library/Keychains']) {
      expect(BUILT_IN_CREDENTIAL_PATHS).toContain(path);
    }
  });
});

describe('SeatbeltCommandSandbox', () => {
  it('wraps a command in sandbox-exec with the worktree writable', () => {
    const sandbox = new SeatbeltCommandSandbox({ deniedReads: [], writableDirectories: ['/factory/cache'], temporaryDirectories: ['/private/tmp'], blockedPorts: () => [7430] });
    const [executable, flag, profile, ...command] = sandbox.confine(['/bin/sh', '-c', 'npm test'], { workingDirectory: '/factory/worktrees/slot-2', network: false });
    expect([executable, flag]).toEqual([SANDBOX_EXEC, '-p']);
    expect(command).toEqual(['/bin/sh', '-c', 'npm test']);
    expect(profile).toContain('(subpath "/factory/worktrees/slot-2")');
    expect(profile).toContain('(subpath "/factory/cache")');
    expect(profile).toContain('(remote ip "*:7430")');
  });

  it('names the read-only directories it is given by their canonical path, even before they exist', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'factory-seatbelt-readonly-')));
    try {
      await mkdir(join(root, 'real'));
      await symlink(join(root, 'real'), join(root, 'link'));
      const sandbox = new SeatbeltCommandSandbox({
        deniedReads: [],
        writableDirectories: [],
        temporaryDirectories: [],
        blockedPorts: () => [],
        readOnlyDirectories: [join(root, 'link', 'references', 'tokens@v1'), join(root, 'real', 'references', 'tokens@v1')],
      });
      expect(sandbox.policy({ workingDirectory: join(root, 'real'), network: false }).readOnlyDirectories).toEqual([join(root, 'real', 'references', 'tokens@v1')]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
