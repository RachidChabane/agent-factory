import { chmod, lstat, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeFilesReadOnly } from './readOnlyTree.ts';

const OWNER_WRITE_BITS = 0o200;
const PERMISSION_BITS = 0o777;

describe('makeFilesReadOnly', () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'factory-readonly-tree-'));
  });
  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('takes the write bits off every file of the tree, nested ones included, and keeps the others', async () => {
    const root = join(scratch, 'tree');
    await mkdir(join(root, 'a', 'b'), { recursive: true });
    await writeFile(join(root, 'top.txt'), 'x', { mode: 0o664 });
    await writeFile(join(root, 'a', 'b', 'run.sh'), 'x', { mode: 0o775 });

    await makeFilesReadOnly(root);

    expect((await lstat(join(root, 'top.txt'))).mode & PERMISSION_BITS).toBe(0o444);
    expect((await lstat(join(root, 'a', 'b', 'run.sh'))).mode & PERMISSION_BITS).toBe(0o555);
  });

  it('leaves directories writable to their owner, whatever mode they were extracted with', async () => {
    const root = join(scratch, 'tree');
    await mkdir(join(root, 'a'), { recursive: true });
    await chmod(join(root, 'a'), 0o500);
    await chmod(root, 0o500);

    await makeFilesReadOnly(root);

    expect((await lstat(root)).mode & PERMISSION_BITS).toBe(0o755);
    expect((await lstat(join(root, 'a'))).mode & OWNER_WRITE_BITS).not.toBe(0);
  });

  it('does not follow a link out of the tree', async () => {
    const root = join(scratch, 'tree');
    const outside = join(scratch, 'outside.txt');
    await mkdir(root);
    await writeFile(outside, 'x');
    await chmod(outside, 0o664);
    await symlink(outside, join(root, 'link'));

    await makeFilesReadOnly(root);

    expect((await lstat(outside)).mode & PERMISSION_BITS).toBe(0o664);
  });
});
