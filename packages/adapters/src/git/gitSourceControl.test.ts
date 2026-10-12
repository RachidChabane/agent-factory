import { createHash } from 'node:crypto';
import { access, chmod, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Worktree } from '@agent-factory/application';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BranchNotPushableError, NothingToCommitError, PathOutsideWorktreeError, WorktreeBranchMismatchError } from './errors.ts';
import { GitSourceControl } from './gitSourceControl.ts';
import { GitWorktreePool } from './gitWorktreePool.ts';
import {
  TEST_BASE_BRANCH,
  TEST_GIT_ENVIRONMENT,
  TEST_IDENTITY,
  TEST_REPOSITORY_NAME,
  createTestRepositories,
  git,
  testRunner,
  writeRepositoryFile,
  type TestRepositories,
} from './testSupport.ts';

const FACTORY_BRANCH = 'factory/12-feature';

describe('GitSourceControl', () => {
  let repositories: TestRepositories;
  let sourceControl: GitSourceControl;
  let worktree: Worktree;

  beforeEach(async () => {
    repositories = await createTestRepositories();
    const pool = new GitWorktreePool(testRunner(), {
      targetClonePath: repositories.clone,
      poolDirectory: repositories.poolDirectory,
      repositoryName: TEST_REPOSITORY_NAME,
      baseBranch: TEST_BASE_BRANCH,
      environment: TEST_GIT_ENVIRONMENT,
    });
    sourceControl = new GitSourceControl(testRunner(), {
      environment: TEST_GIT_ENVIRONMENT,
      identity: TEST_IDENTITY,
      scratchDirectory: repositories.scratch,
    });
    worktree = await pool.acquire(12, FACTORY_BRANCH);
  });
  afterEach(async () => {
    await repositories.cleanup();
  });

  it('never runs a hook of the repository, even when its configuration points at tracked hooks', async () => {
    const marker = join(repositories.root, 'hook-ran');
    git(worktree.path, 'config', 'core.hooksPath', 'hooks');
    await writeRepositoryFile(worktree.path, 'hooks/post-commit', `#!/bin/sh\ntouch '${marker}'\n`);
    await writeRepositoryFile(worktree.path, 'hooks/pre-push', `#!/bin/sh\ntouch '${marker}'\n`);
    await chmod(join(worktree.path, 'hooks/post-commit'), 0o755);
    await chmod(join(worktree.path, 'hooks/pre-push'), 0o755);
    await sourceControl.commitAll(worktree, 'feat: add hooks');
    await sourceControl.push(worktree);
    await expect(access(marker)).rejects.toThrow();
  });

  it('reports head sha equal to the base sha on a fresh worktree', async () => {
    expect(await sourceControl.headSha(worktree)).toBe(worktree.baseSha);
  });

  it('lists modified, added and untracked files against the base, including committed ones', async () => {
    await writeRepositoryFile(worktree.path, 'src/app.txt', 'changed\n');
    await writeRepositoryFile(worktree.path, 'src/untracked.txt', 'new\n');
    expect(await sourceControl.changedFiles(worktree)).toEqual(['src/app.txt', 'src/untracked.txt']);
    await sourceControl.commitAll(worktree, 'feat: change');
    await writeRepositoryFile(worktree.path, 'other.txt', 'later\n');
    expect(await sourceControl.changedFiles(worktree)).toEqual(['other.txt', 'src/app.txt', 'src/untracked.txt']);
  });

  it('ignores ignored files such as node_modules', async () => {
    await writeRepositoryFile(worktree.path, 'node_modules/dep/index.js', 'x\n');
    expect(await sourceControl.changedFiles(worktree)).toEqual([]);
  });

  it('produces a diff that covers modifications and untracked files', async () => {
    await writeRepositoryFile(worktree.path, 'src/app.txt', 'changed\n');
    await writeRepositoryFile(worktree.path, 'src/untracked.txt', 'brand new\n');
    const diff = await sourceControl.diff(worktree);
    expect(diff).toContain('-base content');
    expect(diff).toContain('+changed');
    expect(diff).toContain('+brand new');
  });

  it('commits everything with the configured identity and returns the new head', async () => {
    await writeRepositoryFile(worktree.path, 'src/app.txt', 'changed\n');
    const sha = await sourceControl.commitAll(worktree, 'feat: change app');
    expect(sha).toBe(await sourceControl.headSha(worktree));
    expect(sha).not.toBe(worktree.baseSha);
    expect(git(worktree.path, 'log', '-1', '--format=%an <%ae> | %cn <%ce> | %s')).toBe(
      `${TEST_IDENTITY.name} <${TEST_IDENTITY.email}> | ${TEST_IDENTITY.name} <${TEST_IDENTITY.email}> | feat: change app`,
    );
  });

  it('reports a clean worktree only when nothing is left to commit', async () => {
    expect(await sourceControl.isClean(worktree)).toBe(true);
    await writeRepositoryFile(worktree.path, 'src/untracked.txt', 'new\n');
    expect(await sourceControl.isClean(worktree)).toBe(false);
    await sourceControl.commitAll(worktree, 'feat: add file');
    expect(await sourceControl.isClean(worktree)).toBe(true);
    await writeRepositoryFile(worktree.path, 'node_modules/dep/index.js', 'x\n');
    expect(await sourceControl.isClean(worktree)).toBe(true);
  });

  it('refuses to commit when nothing changed', async () => {
    await expect(sourceControl.commitAll(worktree, 'feat: nothing')).rejects.toBeInstanceOf(NothingToCommitError);
  });

  it('hashes files with sha256 and normalised relative paths', async () => {
    await writeRepositoryFile(worktree.path, 'checks/new.test.ts', 'expect(1)\n');
    const checks = await sourceControl.hashFiles(worktree, ['checks/new.test.ts', join(worktree.path, 'src/app.txt')]);
    expect(checks).toEqual([
      { path: 'checks/new.test.ts', sha256: createHash('sha256').update('expect(1)\n').digest('hex') },
      { path: 'src/app.txt', sha256: createHash('sha256').update('base content\n').digest('hex') },
    ]);
  });

  it('refuses to hash a path outside the worktree', async () => {
    await expect(sourceControl.hashFiles(worktree, ['../escape.txt'])).rejects.toBeInstanceOf(PathOutsideWorktreeError);
    await expect(sourceControl.hashFiles(worktree, ['/etc/hosts'])).rejects.toBeInstanceOf(PathOutsideWorktreeError);
  });

  it('pushes a factory branch with upstream tracking', async () => {
    await writeRepositoryFile(worktree.path, 'src/app.txt', 'changed\n');
    const sha = await sourceControl.commitAll(worktree, 'feat: change');
    await sourceControl.push(worktree);
    expect(git(repositories.remote, 'rev-parse', FACTORY_BRANCH)).toBe(sha);
    expect(git(worktree.path, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe(`origin/${FACTORY_BRANCH}`);
  });

  it('refuses to push a branch outside factory/*', async () => {
    for (const branch of ['main', 'feature/x', 'factory/', 'factoryx/y']) {
      await expect(sourceControl.push({ ...worktree, branch })).rejects.toBeInstanceOf(BranchNotPushableError);
    }
    expect(git(repositories.remote, 'branch', '--list').includes('feature')).toBe(false);
  });

  it('refuses to push when the worktree is on another branch than the lease', async () => {
    await expect(sourceControl.push({ ...worktree, branch: 'factory/99-other' })).rejects.toBeInstanceOf(
      WorktreeBranchMismatchError,
    );
  });

  it('never rewrites a diverged remote branch', async () => {
    await writeRepositoryFile(worktree.path, 'src/app.txt', 'first\n');
    await sourceControl.commitAll(worktree, 'feat: first');
    await sourceControl.push(worktree);
    const remoteSha = git(repositories.remote, 'rev-parse', FACTORY_BRANCH);
    git(worktree.path, 'reset', '--hard', worktree.baseSha);
    await writeRepositoryFile(worktree.path, 'src/app.txt', 'rewritten\n');
    await sourceControl.commitAll(worktree, 'feat: rewritten');
    await expect(sourceControl.push(worktree)).rejects.toThrow();
    expect(git(repositories.remote, 'rev-parse', FACTORY_BRANCH)).toBe(remoteSha);
  });

  it('materialises the base version of the requested paths in a temporary directory', async () => {
    await writeRepositoryFile(worktree.path, 'src/app.txt', 'changed\n');
    await writeRepositoryFile(worktree.path, 'checks/new.test.txt', 'authored\n');
    await sourceControl.commitAll(worktree, 'feat: change');
    const indexBefore = git(worktree.path, 'status', '--porcelain');

    const copy = await sourceControl.checkoutBaseCopy(worktree, ['src/app.txt', 'checks']);

    expect(copy.startsWith(repositories.scratch)).toBe(true);
    expect(await readFile(join(copy, 'src/app.txt'), 'utf8')).toBe('base content\n');
    expect(await readFile(join(copy, 'checks/existing.test.txt'), 'utf8')).toBe('existing check\n');
    await expect(access(join(copy, 'checks/new.test.txt'))).rejects.toThrow();
    expect(await readFile(join(worktree.path, 'src/app.txt'), 'utf8')).toBe('changed\n');
    expect(git(worktree.path, 'status', '--porcelain')).toBe(indexBefore);
  });

  it('returns an empty directory when no requested path exists at the base', async () => {
    const copy = await sourceControl.checkoutBaseCopy(worktree, ['nothing/here.txt']);
    await expect(access(join(copy, 'nothing'))).rejects.toThrow();
  });
});
