import { access, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvalidPoolLocationError, WorktreePoolExhaustedError } from './errors.ts';
import { GitWorktreePool, type GitWorktreePoolSettings } from './gitWorktreePool.ts';
import {
  TEST_BASE_BRANCH,
  TEST_GIT_ENVIRONMENT,
  TEST_REPOSITORY_NAME,
  createTestRepositories,
  git,
  testRunner,
  writeRepositoryFile,
  type TestRepositories,
} from './testSupport.ts';

describe('GitWorktreePool', () => {
  let repositories: TestRepositories;

  beforeEach(async () => {
    repositories = await createTestRepositories();
  });
  afterEach(async () => {
    await repositories.cleanup();
  });

  function createPool(overrides: Partial<GitWorktreePoolSettings> = {}): GitWorktreePool {
    return new GitWorktreePool(testRunner(), {
      targetClonePath: repositories.clone,
      poolDirectory: repositories.poolDirectory,
      repositoryName: TEST_REPOSITORY_NAME,
      baseBranch: TEST_BASE_BRANCH,
      environment: TEST_GIT_ENVIRONMENT,
      ...overrides,
    });
  }

  it('creates a missing worktree on the requested branch at the remote base', async () => {
    const pool = createPool();
    const worktree = await pool.acquire(7, 'factory/7-thing');

    expect(worktree.path.startsWith(join(repositories.poolDirectory, TEST_REPOSITORY_NAME))).toBe(true);
    expect(worktree.branch).toBe('factory/7-thing');
    expect(git(worktree.path, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('factory/7-thing');
    expect(worktree.baseSha).toBe(git(repositories.remote, 'rev-parse', TEST_BASE_BRANCH));
    expect(await readFile(join(worktree.path, 'src/app.txt'), 'utf8')).toBe('base content\n');
  });

  it('starts from the freshly fetched base', async () => {
    const pool = createPool();
    await repositories.pushToRemote('src/new.txt', 'later\n', 'later commit');
    const worktree = await pool.acquire(7, 'factory/7-thing');
    expect(worktree.baseSha).toBe(git(repositories.remote, 'rev-parse', TEST_BASE_BRANCH));
    expect(await readFile(join(worktree.path, 'src/new.txt'), 'utf8')).toBe('later\n');
  });

  it('hands out distinct slots until the pool is exhausted', async () => {
    const pool = createPool({ size: 2 });
    const first = await pool.acquire(1, 'factory/1-a');
    const second = await pool.acquire(2, 'factory/2-b');
    expect(first.path).not.toBe(second.path);
    await expect(pool.acquire(3, 'factory/3-c')).rejects.toBeInstanceOf(WorktreePoolExhaustedError);
  });

  it('frees the slot on release', async () => {
    const pool = createPool({ size: 1 });
    const first = await pool.acquire(1, 'factory/1-a');
    await pool.release(first);
    const second = await pool.acquire(2, 'factory/2-b');
    expect(second.path).toBe(first.path);
    expect(second.branch).toBe('factory/2-b');
  });

  it('keeps leases across restarts', async () => {
    const before = createPool({ size: 1 });
    await before.acquire(1, 'factory/1-a');
    const afterRestart = createPool({ size: 1 });
    await expect(afterRestart.acquire(2, 'factory/2-b')).rejects.toBeInstanceOf(WorktreePoolExhaustedError);
    const again = await afterRestart.acquire(1, 'factory/1-a');
    expect(again.branch).toBe('factory/1-a');
  });

  it('never double-leases under concurrent acquisitions', async () => {
    const pool = createPool({ size: 3 });
    const worktrees = await Promise.all([1, 2, 3].map((n) => pool.acquire(n, `factory/${n}-x`)));
    expect(new Set(worktrees.map((worktree) => worktree.path)).size).toBe(3);
  });

  it('discards leftovers but keeps preserved dependency directories', async () => {
    const pool = createPool({ size: 1 });
    const first = await pool.acquire(1, 'factory/1-a');
    await writeRepositoryFile(first.path, 'node_modules/dep/index.js', 'installed\n');
    await writeRepositoryFile(first.path, 'packages/web/node_modules/dep/index.js', 'nested\n');
    await writeRepositoryFile(first.path, 'junk.txt', 'junk\n');
    await writeRepositoryFile(first.path, 'src/app.txt', 'modified\n');
    await pool.release(first);

    const second = await pool.acquire(2, 'factory/2-b');
    expect(await readFile(join(second.path, 'node_modules/dep/index.js'), 'utf8')).toBe('installed\n');
    expect(await readFile(join(second.path, 'packages/web/node_modules/dep/index.js'), 'utf8')).toBe('nested\n');
    expect(await readFile(join(second.path, 'src/app.txt'), 'utf8')).toBe('base content\n');
    await expect(access(join(second.path, 'junk.txt'))).rejects.toThrow();
  });

  it('restarts the same slot from the base when its issue acquires it again with commits and edits left over', async () => {
    const pool = createPool();
    const first = await pool.acquire(7, 'factory/7-thing');
    await writeRepositoryFile(first.path, 'src/app.txt', 'committed change\n');
    git(first.path, 'add', '--all');
    git(first.path, 'commit', '--message', 'checks');
    await writeRepositoryFile(first.path, 'src/app.txt', 'uncommitted change\n');
    await writeRepositoryFile(first.path, 'checks/new.test.txt', 'half-written\n');
    await repositories.pushToRemote('src/app.txt', 'moved upstream\n', 'upstream');

    const again = await pool.acquire(7, 'factory/7-thing');

    expect(again.path).toBe(first.path);
    expect(again.baseSha).toBe(git(repositories.remote, 'rev-parse', TEST_BASE_BRANCH));
    expect(await readFile(join(again.path, 'src/app.txt'), 'utf8')).toBe('moved upstream\n');
    await expect(access(join(again.path, 'checks/new.test.txt'))).rejects.toThrow();
  });

  it('removes ignored directories that are not preserved', async () => {
    const pool = createPool({ size: 1, preservedDirectories: [] });
    const first = await pool.acquire(1, 'factory/1-a');
    await writeRepositoryFile(first.path, 'node_modules/dep/index.js', 'installed\n');
    await pool.release(first);
    const second = await pool.acquire(2, 'factory/2-b');
    await expect(access(join(second.path, 'node_modules'))).rejects.toThrow();
  });

  it('recreates a worktree whose directory vanished', async () => {
    const pool = createPool({ size: 1 });
    const first = await pool.acquire(1, 'factory/1-a');
    await pool.release(first);
    await rm(first.path, { recursive: true, force: true });
    const second = await pool.acquire(2, 'factory/2-b');
    expect(await readFile(join(second.path, 'src/app.txt'), 'utf8')).toBe('base content\n');
  });

  it('refuses a pool directory inside the target clone', () => {
    expect(() => createPool({ poolDirectory: join(repositories.clone, 'pool') })).toThrow(InvalidPoolLocationError);
  });

  it('releases the lease when preparation fails', async () => {
    const pool = createPool({ size: 1, baseBranch: 'missing-branch' });
    await expect(pool.acquire(1, 'factory/1-a')).rejects.toThrow();
    const healthy = createPool({ size: 1 });
    await expect(healthy.acquire(2, 'factory/2-b')).resolves.toBeDefined();
  });

  it('reattaches a leased worktree without touching its commits or files', async () => {
    const pool = createPool();
    const worktree = await pool.acquire(7, 'factory/7-thing');
    await writeRepositoryFile(worktree.path, 'src/app.txt', 'committed work\n');
    git(worktree.path, 'add', '--all');
    git(worktree.path, 'commit', '--message', 'work');
    const head = git(worktree.path, 'rev-parse', 'HEAD');
    await writeRepositoryFile(worktree.path, 'src/draft.txt', 'uncommitted\n');

    const reattached = await createPool().reattach(7, worktree, head);

    expect(reattached).toEqual(worktree);
    expect(git(worktree.path, 'rev-parse', 'HEAD')).toBe(head);
    expect(await readFile(join(worktree.path, 'src/draft.txt'), 'utf8')).toBe('uncommitted\n');
  });

  it('refuses to reattach a slot that now serves another issue or lost the known commit', async () => {
    const pool = createPool({ size: 1 });
    const first = await pool.acquire(1, 'factory/1-a');
    expect(await pool.reattach(1, first, 'f'.repeat(40))).toBeNull();
    await pool.release(first);
    const second = await pool.acquire(2, 'factory/2-b');
    expect(await pool.reattach(1, first, first.baseSha)).toBeNull();
    expect(await pool.reattach(2, { ...second, branch: 'factory/2-renamed' }, second.baseSha)).toBeNull();
    expect(await pool.reattach(2, second, second.baseSha)).toEqual(second);
  });
});
