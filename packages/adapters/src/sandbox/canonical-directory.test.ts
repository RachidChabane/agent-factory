import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalDirectory, canonicalFutureDirectory } from './canonical-directory.ts';

describe('canonical directories', () => {
  let root: string;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'factory-canonical-')));
    await mkdir(join(root, 'real'));
    await symlink(join(root, 'real'), join(root, 'link'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('resolves a link to the directory it leads to, and keeps a path that is not there', () => {
    expect(canonicalDirectory(join(root, 'link'))).toBe(join(root, 'real'));
    expect(canonicalDirectory(join(root, 'link', 'absent'))).toBe(join(root, 'link', 'absent'));
  });

  it('resolves the part of a path that exists and appends the rest, however deep the rest is', () => {
    expect(canonicalFutureDirectory(join(root, 'link'))).toBe(join(root, 'real'));
    expect(canonicalFutureDirectory(join(root, 'link', 'references', 'tokens@v1'))).toBe(join(root, 'real', 'references', 'tokens@v1'));
  });

  it('leaves a relative path as given, so that nothing reads it against the working directory', () => {
    expect(canonicalFutureDirectory('relative/references')).toBe('relative/references');
  });

  it('stops at the root', () => {
    expect(canonicalFutureDirectory('/')).toBe('/');
  });
});
