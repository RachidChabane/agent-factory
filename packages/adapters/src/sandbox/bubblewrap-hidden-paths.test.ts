import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hiddenPaths } from './bubblewrap-hidden-paths.ts';
import type { PathPattern } from './path-patterns.ts';

function exact(path: string): PathPattern {
  return { path, prefix: false };
}

function startingWith(path: string): PathPattern {
  return { path, prefix: true };
}

describe('hiddenPaths', () => {
  let root: string;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'factory-hidden-')));
    await mkdir(join(root, 'ssh', 'nested'), { recursive: true });
    await writeFile(join(root, 'ssh', 'id_key'), 'private');
    await writeFile(join(root, 'ssh-extra'), 'private');
    await mkdir(join(root, 'gws-personal'));
    await mkdir(join(root, 'gws-work'));
    await mkdir(join(root, 'gh'));
    await writeFile(join(root, 'netrc'), 'machine');
    await writeFile(join(root, 'token.json'), '{}');
    await writeFile(join(root, 'token.json.backup'), '{}');
    await symlink(join(root, 'gh'), join(root, 'gh-link'));
    await symlink(join(root, 'netrc'), join(root, 'netrc-link'));
    await symlink(join(root, 'absent-target'), join(root, 'dangling-link'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('hides a directory with a memory filesystem and a file with the null device', () => {
    expect(hiddenPaths([exact(join(root, 'gh')), exact(join(root, 'netrc'))])).toEqual({
      directories: [join(root, 'gh')],
      files: [join(root, 'netrc')],
    });
  });

  it('skips a path that does not exist, as a mount over it could not be created in a read-only root', () => {
    expect(hiddenPaths([exact(join(root, 'absent')), exact(join(root, 'dangling-link')), exact(join(root, 'absent', 'deeper'))])).toEqual({
      directories: [],
      files: [],
    });
  });

  it('expands a prefix pattern to the entries present when the command starts', () => {
    expect(hiddenPaths([startingWith(join(root, 'gws'))]).directories.toSorted()).toEqual([join(root, 'gws-personal'), join(root, 'gws-work')]);
    expect(hiddenPaths([startingWith(join(root, 'token.json'))]).files.toSorted()).toEqual([join(root, 'token.json'), join(root, 'token.json.backup')]);
  });

  it('hides what a link points to, under the name of the target', () => {
    expect(hiddenPaths([exact(join(root, 'gh-link'))])).toEqual({ directories: [join(root, 'gh')], files: [] });
    expect(hiddenPaths([exact(join(root, 'netrc-link'))])).toEqual({ directories: [], files: [join(root, 'netrc')] });
  });

  it('names a path once, whichever patterns reach it', () => {
    const patterns = [exact(join(root, 'gh')), exact(join(root, 'gh-link')), startingWith(join(root, 'gh')), exact(join(root, 'gh'))];
    expect(hiddenPaths(patterns)).toEqual({ directories: [join(root, 'gh')], files: [] });
  });

  it('leaves out what a hidden directory already covers', () => {
    const patterns = [exact(join(root, 'ssh', 'id_key')), exact(join(root, 'ssh', 'nested')), exact(join(root, 'ssh'))];
    expect(hiddenPaths(patterns)).toEqual({ directories: [join(root, 'ssh')], files: [] });
  });

  it('keeps a sibling whose name merely starts like a hidden directory', () => {
    expect(hiddenPaths([exact(join(root, 'ssh')), exact(join(root, 'ssh-extra'))])).toEqual({
      directories: [join(root, 'ssh')],
      files: [join(root, 'ssh-extra')],
    });
  });
});

describe('hiddenPaths among the host runtime paths', () => {
  let root: string;
  let shared: string;
  let worktree: string;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'factory-runtime-')));
    shared = join(root, 'shared');
    worktree = join(root, 'worktree');
    await Promise.all([shared, worktree, join(shared, 'ssh-agent'), join(shared, '.X11-unix'), join(shared, 'other')].map((directory) => mkdir(directory, { recursive: true })));
    await writeFile(join(shared, 'ssh-socket-file'), 'socket');
    await writeFile(join(shared, 'ssh-quote"name'), 'planted');
    await writeFile(join(shared, 'ssh-line\nbreak'), 'planted');
    await symlink(worktree, join(shared, 'ssh-link-to-worktree'));
    await symlink('/', join(shared, 'ssh-link-to-root'));
    await symlink(join(root, 'absent'), join(shared, 'ssh-dangling-link'));
    await symlink(worktree, join(shared, 'x11-link'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('hides the entries that are there, whichever kind they are', () => {
    const hidden = hiddenPaths([], [startingWith(join(shared, 'ssh-')), exact(join(shared, '.X11-unix'))]);
    expect(hidden.directories.toSorted()).toEqual([join(shared, '.X11-unix'), join(shared, 'ssh-agent')]);
    expect(hidden.files).toEqual([join(shared, 'ssh-socket-file')]);
  });

  it('skips a link a confined command could have planted, instead of hiding what it points to', () => {
    const hidden = hiddenPaths([], [startingWith(join(shared, 'ssh-')), exact(join(shared, 'x11-link')), exact(join(shared, 'ssh-link-to-root'))]);
    const names = [...hidden.directories, ...hidden.files];
    expect(names.some((path) => basename(path).includes('link'))).toBe(false);
    expect(names).not.toContain(worktree);
    expect(names).not.toContain('/');
  });

  it('skips a name that cannot be written safely, instead of refusing the whole policy', () => {
    const hidden = hiddenPaths([], [startingWith(join(shared, 'ssh-'))]);
    expect([...hidden.directories, ...hidden.files].some((path) => path.includes('"') || path.includes('\n'))).toBe(false);
  });

  it('still follows the links of the paths the operator names', () => {
    expect(hiddenPaths([exact(join(shared, 'x11-link'))])).toEqual({ directories: [worktree], files: [] });
  });

  it('leaves out what a hidden operator directory already covers', () => {
    expect(hiddenPaths([exact(shared)], [startingWith(join(shared, 'ssh-'))])).toEqual({ directories: [shared], files: [] });
  });
});
