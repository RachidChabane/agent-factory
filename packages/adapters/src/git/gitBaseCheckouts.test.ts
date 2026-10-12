import { access, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitBaseCheckouts, UnsafeCheckoutNameError, type GitBaseCheckoutsSettings } from './gitBaseCheckouts.ts';
import {
  TEST_BASE_BRANCH,
  TEST_GIT_ENVIRONMENT,
  createTestRepositories,
  git,
  testRunner,
  writeRepositoryFile,
  type TestRepositories,
} from './testSupport.ts';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('GitBaseCheckouts', () => {
  let repositories: TestRepositories;
  let checkoutsDirectory: string;

  beforeEach(async () => {
    repositories = await createTestRepositories();
    checkoutsDirectory = join(repositories.root, 'checkouts');
  });
  afterEach(async () => {
    await repositories.cleanup();
  });

  function createCheckouts(overrides: Partial<GitBaseCheckoutsSettings> = {}): GitBaseCheckouts {
    return new GitBaseCheckouts(testRunner(), {
      targetClonePath: repositories.clone,
      checkoutsDirectory,
      baseBranch: TEST_BASE_BRANCH,
      environment: TEST_GIT_ENVIRONMENT,
      ...overrides,
    });
  }

  it('checks out a detached worktree at the remote base', async () => {
    const checkout = await createCheckouts().checkout('request-req-1');

    expect(checkout.path).toBe(join(checkoutsDirectory, 'request-req-1'));
    expect(checkout.sha).toBe(git(repositories.remote, 'rev-parse', TEST_BASE_BRANCH));
    expect(git(checkout.path, 'rev-parse', 'HEAD')).toBe(checkout.sha);
    expect(git(checkout.path, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD');
    expect(await readFile(join(checkout.path, 'src/app.txt'), 'utf8')).toBe('base content\n');
  });

  it('checks out an older revision of the base instead of its head', async () => {
    const audited = git(repositories.remote, 'rev-parse', TEST_BASE_BRANCH);
    await repositories.pushToRemote('src/app.txt', 'moved upstream\n', 'upstream');

    const checkout = await createCheckouts().checkout('audit-old', audited);

    expect(checkout.sha).toBe(audited);
    expect(await readFile(join(checkout.path, 'src/app.txt'), 'utf8')).toBe('base content\n');
  });

  it('fetches the base before checking it out', async () => {
    await repositories.pushToRemote('src/app.txt', 'moved upstream\n', 'upstream');

    const checkout = await createCheckouts().checkout('fresh');

    expect(checkout.sha).toBe(git(repositories.remote, 'rev-parse', TEST_BASE_BRANCH));
    expect(await readFile(join(checkout.path, 'src/app.txt'), 'utf8')).toBe('moved upstream\n');
  });

  it('replaces a stale checkout of the same name', async () => {
    const checkouts = createCheckouts();
    const first = await checkouts.checkout('again');
    await writeRepositoryFile(first.path, 'leftover.txt', 'stale\n');
    await repositories.pushToRemote('src/app.txt', 'newer\n', 'newer');

    const second = await checkouts.checkout('again');

    expect(second.path).toBe(first.path);
    expect(await exists(join(second.path, 'leftover.txt'))).toBe(false);
    expect(await readFile(join(second.path, 'src/app.txt'), 'utf8')).toBe('newer\n');
  });

  it('replaces a leftover directory that is no longer a registered worktree', async () => {
    const path = join(checkoutsDirectory, 'orphan');
    await writeRepositoryFile(path, 'junk.txt', 'junk\n');

    const checkout = await createCheckouts().checkout('orphan');

    expect(await exists(join(checkout.path, 'junk.txt'))).toBe(false);
    expect(await readFile(join(checkout.path, 'src/app.txt'), 'utf8')).toBe('base content\n');
  });

  it('removes a checkout and unregisters it', async () => {
    const checkouts = createCheckouts();
    const checkout = await checkouts.checkout('gone');

    await checkouts.remove(checkout);

    expect(await exists(checkout.path)).toBe(false);
    expect(git(repositories.clone, 'worktree', 'list', '--porcelain')).not.toContain(checkout.path);
  });

  it('removes a checkout that has local changes', async () => {
    const checkouts = createCheckouts();
    const checkout = await checkouts.checkout('dirty');
    await writeRepositoryFile(checkout.path, 'src/app.txt', 'edited\n');

    await checkouts.remove(checkout);

    expect(await exists(checkout.path)).toBe(false);
  });

  it('tolerates removing a checkout whose directory already vanished', async () => {
    const checkouts = createCheckouts();
    const checkout = await checkouts.checkout('vanished');
    await rm(checkout.path, { recursive: true, force: true });

    await checkouts.remove(checkout);

    expect(git(repositories.clone, 'worktree', 'list', '--porcelain')).not.toContain(checkout.path);
  });

  it('serves concurrent checkouts of different names', async () => {
    const checkouts = createCheckouts();
    const created = await Promise.all(['one', 'two', 'three'].map((name) => checkouts.checkout(name)));
    expect(new Set(created.map((checkout) => checkout.path)).size).toBe(3);
  });

  it.each(['', '../escape', 'a/b', '.hidden', '-flag', 'with space', '..'])('refuses the unsafe name %j', async (name) => {
    await expect(createCheckouts().checkout(name)).rejects.toBeInstanceOf(UnsafeCheckoutNameError);
  });
});
