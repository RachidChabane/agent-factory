import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, unlink, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { filePatches, GitObjects, MAX_FILE_PATCH_CHARACTERS, MAX_RANGE_COMMITS, UnsafeObjectRequestError } from './gitObjects.ts';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x10]);
const IDENTITY = { GIT_AUTHOR_NAME: 'Alex Morgan', GIT_AUTHOR_EMAIL: 'alex@example.com', GIT_COMMITTER_NAME: 'Alex Morgan', GIT_COMMITTER_EMAIL: 'alex@example.com' };

describe('the patches of a diff', () => {
  it('cuts a diff into one patch per file, named by its new path', () => {
    const diff = [
      'diff --git a/src/cart.js b/src/cart.js',
      'index 1111111..2222222 100644',
      '--- a/src/cart.js',
      '+++ b/src/cart.js',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      'diff --git a/docs/old.md b/docs/old.md',
      'deleted file mode 100644',
      '--- a/docs/old.md',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-gone',
      'diff --git a/img/a.png b/img/a.png',
      'new file mode 100644',
      'Binary files /dev/null and b/img/a.png differ',
      '',
    ].join('\n');
    expect(filePatches(diff).map((patch) => [patch.path, patch.truncated, patch.patch.split('\n')[0]])).toEqual([
      ['src/cart.js', false, 'diff --git a/src/cart.js b/src/cart.js'],
      ['docs/old.md', false, 'diff --git a/docs/old.md b/docs/old.md'],
      ['img/a.png', false, 'diff --git a/img/a.png b/img/a.png'],
    ]);
    expect(filePatches(diff)[0]?.patch.endsWith('+new')).toBe(true);
  });

  it('names a renamed file by where it went, and cuts a patch too large to show whole', () => {
    const renamed = 'diff --git a/src/old.js b/src/new.js\nsimilarity index 98%\nrename from src/old.js\nrename to src/new.js\n';
    expect(filePatches(renamed)[0]?.path).toBe('src/new.js');
    const huge = `diff --git a/big.txt b/big.txt\n--- a/big.txt\n+++ b/big.txt\n@@ -0,0 +1 @@\n+${'x'.repeat(MAX_FILE_PATCH_CHARACTERS)}\n`;
    const [patch] = filePatches(huge);
    expect(patch?.truncated).toBe(true);
    expect(patch?.patch).toHaveLength(MAX_FILE_PATCH_CHARACTERS);
  });

  it('finds no patch in an empty diff', () => {
    expect(filePatches('')).toEqual([]);
  });
});

describe('the objects of a repository', () => {
  let repository: string;
  let base: string;
  let head: string;
  let objects: GitObjects;
  const environment = { PATH: process.env['PATH'] ?? '', HOME: tmpdir(), GIT_CONFIG_NOSYSTEM: '1', ...IDENTITY };

  function git(...args: string[]): string {
    return execFileSync('git', ['-C', repository, ...args], { env: environment, encoding: 'utf8' }).trim();
  }

  beforeAll(async () => {
    repository = await mkdtemp(join(tmpdir(), 'factory-objects-'));
    git('init', '--quiet', '--initial-branch=main');
    await writeFile(join(repository, 'cart.js'), 'export const total = 0;\n');
    await writeFile(join(repository, 'old.md'), 'Old notes.\n');
    await writeFile(join(repository, 'moved.js'), 'export const moved = true;\n');
    git('add', '--all');
    git('commit', '--quiet', '--message', 'base');
    base = git('rev-parse', 'HEAD');
    await writeFile(join(repository, 'cart.js'), 'export const total = 36;\n');
    await unlink(join(repository, 'old.md'));
    await rename(join(repository, 'moved.js'), join(repository, 'renamed.js'));
    await writeFile(join(repository, 'header.png'), PNG_BYTES);
    git('add', '--all');
    git('commit', '--quiet', '--message', 'change');
    head = git('rev-parse', 'HEAD');
    objects = new GitObjects(repository, environment);
  });

  afterAll(async () => {
    await rm(repository, { recursive: true, force: true });
  });

  it('reads a file of a commit byte for byte, a binary one included', async () => {
    expect(Buffer.from((await objects.file(head, 'cart.js')) ?? []).toString('utf8')).toBe('export const total = 36;\n');
    expect(Buffer.from((await objects.file(base, 'cart.js')) ?? []).toString('utf8')).toBe('export const total = 0;\n');
    expect(Buffer.compare(Buffer.from((await objects.file(head, 'header.png')) ?? []), PNG_BYTES)).toBe(0);
  });

  it('answers nothing for a file the commit does not hold, or a commit the repository does not have', async () => {
    expect(await objects.file(head, 'old.md')).toBeNull();
    expect(await objects.file('0123456789abcdef0123456789abcdef01234567', 'cart.js')).toBeNull();
  });

  it('refuses a name that is not a commit and a path that leaves the tree', async () => {
    await expect(objects.file('--output=/tmp/x', 'cart.js')).rejects.toBeInstanceOf(UnsafeObjectRequestError);
    await expect(objects.file(head, '../outside')).rejects.toBeInstanceOf(UnsafeObjectRequestError);
    await expect(objects.diff(base, 'HEAD; rm -rf /')).rejects.toBeInstanceOf(UnsafeObjectRequestError);
  });

  it('lists the commits between two commits, oldest first, with who made them and what they say', async () => {
    git('commit', '--quiet', '--allow-empty', '--message', 'feat: second change\n\nWith a body.');
    const second = git('rev-parse', 'HEAD');
    const commits = await objects.commitsBetween(base, second);
    expect(commits?.map((commit) => [commit.sha, commit.authorName, commit.message.split('\n')[0]])).toEqual([
      [head, 'Alex Morgan', 'change'],
      [second, 'Alex Morgan', 'feat: second change'],
    ]);
    expect(commits?.[1]?.message).toBe('feat: second change\n\nWith a body.');
    expect(commits?.[1]?.committedAt.getTime()).not.toBeNaN();
    expect((await objects.commitsBetween(head, second))?.map((commit) => commit.sha)).toEqual([second]);
  });

  it('lists nothing for a range that is empty or runs backwards, and nothing is known when a commit is missing', async () => {
    expect(await objects.commitsBetween(head, head)).toEqual([]);
    expect(await objects.commitsBetween(head, base)).toEqual([]);
    expect(await objects.commitsBetween('0123456789abcdef0123456789abcdef01234567', head)).toBeNull();
    expect(await objects.commitsBetween(base, '0123456789abcdef0123456789abcdef01234567')).toBeNull();
  });

  it('keeps the newest commits of a long range', async () => {
    const start = git('rev-parse', 'HEAD');
    const steps = Array.from({ length: MAX_RANGE_COMMITS + 3 }, (_, index) => {
      const message = `chore: step ${index}`;
      const parent = index === 0 ? `from ${start}\n` : '';
      return `commit refs/heads/main\ncommitter Alex Morgan <alex@example.com> ${1_700_000_000 + index} +0000\ndata ${message.length}\n${message}\n${parent}`;
    });
    execFileSync('git', ['-C', repository, 'fast-import', '--quiet'], { env: environment, input: steps.join('\n') });
    git('reset', '--quiet', '--hard', 'main');
    const commits = await objects.commitsBetween(start, git('rev-parse', 'HEAD'));
    expect(commits).toHaveLength(MAX_RANGE_COMMITS);
    expect(commits?.[0]?.message).toBe('chore: step 3');
    expect(commits?.at(-1)?.message).toBe(`chore: step ${MAX_RANGE_COMMITS + 2}`);
  });

  it('resolves a branch to its commit, and a ref the repository lacks to nothing', async () => {
    expect(await objects.resolve('main')).toBe(git('rev-parse', 'main'));
    expect(await objects.resolve('origin/main')).toBeNull();
    await expect(objects.resolve('--output=/tmp/x')).rejects.toBeInstanceOf(UnsafeObjectRequestError);
  });

  it('refuses a range whose end is not a commit name', async () => {
    await expect(objects.commitsBetween(base, 'main; rm -rf /')).rejects.toBeInstanceOf(UnsafeObjectRequestError);
  });

  it('diffs two commits file by file, renames and binaries included', async () => {
    const patches = await objects.diff(base, head);
    expect(patches.map((patch) => patch.path).sort()).toEqual(['cart.js', 'header.png', 'old.md', 'renamed.js']);
    expect(patches.find((patch) => patch.path === 'cart.js')?.patch).toContain('+export const total = 36;');
  });
});
