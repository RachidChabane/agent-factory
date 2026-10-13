import { mkdtemp, readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PathOutsideWorktreeError } from '../git/errors.ts';
import { NodeWorkspaceFiles } from './nodeWorkspaceFiles.ts';

describe('NodeWorkspaceFiles', () => {
  let root: string;
  let other: string;
  const files = new NodeWorkspaceFiles();

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'factory-files-'));
    other = await mkdtemp(join(tmpdir(), 'factory-files-other-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
  });

  it('writes, reads and tells whether a file or directory exists', async () => {
    await files.writeText(root, 'a/b/c.txt', 'content');
    expect(await files.readText(root, 'a/b/c.txt')).toBe('content');
    expect(await files.exists(root, 'a/b/c.txt')).toBe(true);
    expect(await files.exists(root, 'a')).toBe(true);
    expect(await files.exists(root, 'a/missing.txt')).toBe(false);
    expect(await files.readText(root, 'a/missing.txt')).toBeNull();
  });

  it('copies a file between roots and reports a missing source', async () => {
    await mkdir(join(root, 'shots'), { recursive: true });
    await writeFile(join(root, 'shots/header.png'), 'png');
    expect(await files.copyFile(root, 'shots/header.png', other, 'after/shots/header.png')).toBe(true);
    expect(await readFile(join(other, 'after/shots/header.png'), 'utf8')).toBe('png');
    expect(await files.copyFile(root, 'shots/none.png', other, 'after/none.png')).toBe(false);
  });

  it('tells the size of a file in bytes, and nothing of what is no file inside the root', async () => {
    await files.writeText(root, 'shots/header.png', 'twelve bytes');
    await files.writeText(root, 'shots/empty.png', '');
    await writeFile(join(other, 'credentials.db'), 'operator secret');
    await symlink(join(other, 'credentials.db'), join(root, 'shots/linked.png'));
    expect(await files.sizeOf(root, 'shots/header.png')).toBe(12);
    expect(await files.sizeOf(root, 'shots/empty.png')).toBe(0);
    expect(await files.sizeOf(root, 'shots')).toBeNull();
    expect(await files.sizeOf(root, 'shots/missing.png')).toBeNull();
    expect(await files.sizeOf(root, 'shots/linked.png')).toBeNull();
  });

  it('removes files and directories and tolerates missing ones', async () => {
    await files.writeText(root, '.factory/acceptance.json', '{}');
    await files.remove(root, '.factory');
    expect(await files.exists(root, '.factory')).toBe(false);
    await expect(files.remove(root, '.factory')).resolves.toBeUndefined();
  });

  it('never follows a link out of the root when reading, copying or writing', async () => {
    await writeFile(join(other, 'credentials.db'), 'operator secret');
    await mkdir(join(root, 'shots'), { recursive: true });
    await symlink(join(other, 'credentials.db'), join(root, 'shots/header.png'));
    await symlink(other, join(root, 'linked-directory'));
    expect(await files.readText(root, 'shots/header.png')).toBeNull();
    expect(await files.exists(root, 'shots/header.png')).toBe(false);
    expect(await files.copyFile(root, 'shots/header.png', root, 'copy.png')).toBe(false);
    expect(await files.readText(root, 'linked-directory/credentials.db')).toBeNull();
    await files.writeText(root, 'shots/header.png', 'replaced');
    expect(await readFile(join(other, 'credentials.db'), 'utf8')).toBe('operator secret');
    expect(await readFile(join(root, 'shots/header.png'), 'utf8')).toBe('replaced');
    await expect(files.writeText(root, 'linked-directory/planted.txt', 'x')).rejects.toBeInstanceOf(PathOutsideWorktreeError);
  });

  it('refuses paths outside the root', async () => {
    await expect(files.writeText(root, '../escape.txt', 'x')).rejects.toBeInstanceOf(PathOutsideWorktreeError);
    await expect(files.remove(root, '.')).rejects.toBeInstanceOf(PathOutsideWorktreeError);
    await expect(files.readText(root, '/etc/hosts')).rejects.toBeInstanceOf(PathOutsideWorktreeError);
  });
});
