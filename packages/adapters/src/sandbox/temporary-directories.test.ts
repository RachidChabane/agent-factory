import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { UnsupportedPlatformError } from '../platform/supported-platform.ts';
import { userTemporaryDirectories } from './temporary-directories.ts';

const ROOT_DIRECTORY = '/';

describe('userTemporaryDirectories', () => {
  let root: string;
  let own: string;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'factory-temporary-')));
    own = join(root, 'T');
    await mkdir(own);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists the directory of the user, the one that holds it and the shared ones on macOS', () => {
    vi.stubEnv('TMPDIR', own);
    expect(userTemporaryDirectories('darwin')).toEqual([own, dirname(own), '/private/tmp', '/private/var/tmp']);
  });

  it('lists the directory of the user and the shared ones on Linux, never the one that holds it', () => {
    vi.stubEnv('TMPDIR', own);
    expect(userTemporaryDirectories('linux')).toEqual([own, '/tmp', '/var/tmp']);
  });

  it.each(['darwin', 'linux'])('never offers the root of the filesystem as a temporary directory on %s', (platform) => {
    vi.stubEnv('TMPDIR', own);
    expect(userTemporaryDirectories(platform)).not.toContain(ROOT_DIRECTORY);
  });

  it('names each directory once', () => {
    vi.stubEnv('TMPDIR', '/var/tmp');
    const directories = userTemporaryDirectories('linux');
    expect(new Set(directories).size).toBe(directories.length);
  });

  it('follows the platform it runs on by default', () => {
    expect(userTemporaryDirectories()).toEqual(userTemporaryDirectories(process.platform));
  });

  it('refuses a platform it knows no layout for', () => {
    expect(() => userTemporaryDirectories('win32')).toThrow(UnsupportedPlatformError);
  });
});
