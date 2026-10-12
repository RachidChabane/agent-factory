import { describe, expect, it } from 'vitest';
import { SUPPORTED_PLATFORMS, UnsupportedPlatformError } from '../platform/supported-platform.ts';
import { BUILT_IN_CREDENTIAL_PATHS } from './credential-paths.ts';
import { parsePathPattern, type PathPattern } from './path-patterns.ts';
import { defaultWritableCacheDirectories } from './writable-cache-directories.ts';

const HOME = '/home/operator';
const HOME_PREFIX = '~/';

function encloses(outer: string, inner: string): boolean {
  return inner === outer || inner.startsWith(`${outer}/`);
}

function overlaps(directory: string, credential: PathPattern): boolean {
  return encloses(directory, credential.path) || encloses(credential.path, directory) || (credential.prefix && directory.startsWith(credential.path));
}

function expanded(directories: readonly string[]): readonly string[] {
  return directories.map((directory) => parsePathPattern(directory, HOME).path);
}

const CACHES_BY_TOOL: Readonly<Record<string, RegExp>> = {
  npm: /\/\.npm$/,
  pnpm: /pnpm/,
  yarn: /[Yy]arn/,
  pip: /pip$/,
  uv: /uv$/,
  mise: /mise$/,
  'node-gyp': /node-gyp$/,
  go: /go-build$|go\/pkg\/mod$/,
  cargo: /\.cargo\/registry$/,
};

describe('defaultWritableCacheDirectories', () => {
  it.each(SUPPORTED_PLATFORMS)('writes patterns under the home directory, each once, on %s', (platform) => {
    const directories = defaultWritableCacheDirectories(platform);
    expect(directories.every((directory) => directory.startsWith(HOME_PREFIX))).toBe(true);
    expect(new Set(directories).size).toBe(directories.length);
  });

  it.each(SUPPORTED_PLATFORMS)('covers the caches of every package manager on %s', (platform) => {
    const directories = defaultWritableCacheDirectories(platform);
    for (const [tool, pattern] of Object.entries(CACHES_BY_TOOL)) {
      expect(directories.some((directory) => pattern.test(directory)), `${tool} on ${platform}`).toBe(true);
    }
  });

  it('keeps the directories macOS commands could always write', () => {
    expect(defaultWritableCacheDirectories('darwin')).toEqual(
      expect.arrayContaining(['~/.local/state/mise', '~/Library/Caches/mise', '~/.npm', '~/Library/Caches/node-gyp']),
    );
  });

  it('uses the XDG cache locations on Linux and none of the macOS library ones', () => {
    const directories = defaultWritableCacheDirectories('linux');
    expect(directories).toEqual(expect.arrayContaining(['~/.cache/pip', '~/.cache/node-gyp', '~/.cache/go-build', '~/.cache/mise']));
    expect(directories.some((directory) => directory.includes('Library'))).toBe(false);
  });

  it.each(SUPPORTED_PLATFORMS)('never reaches into, or over, a built-in credential store on %s', (platform) => {
    const credentials = BUILT_IN_CREDENTIAL_PATHS.map((pattern) => parsePathPattern(pattern, HOME));
    for (const directory of expanded(defaultWritableCacheDirectories(platform))) {
      const clashing = credentials.filter((credential) => overlaps(directory, credential));
      expect(clashing, directory).toEqual([]);
    }
  });

  it('refuses a platform it knows no caches for', () => {
    expect(() => defaultWritableCacheDirectories('win32')).toThrow(UnsupportedPlatformError);
  });
});
