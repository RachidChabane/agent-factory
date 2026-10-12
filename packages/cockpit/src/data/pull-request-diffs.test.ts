import { describe, expect, it, vi } from 'vitest';
import type { PullRequestDiff } from '../contract/index.ts';
import type { DiffTarget } from './pull-request-diffs.ts';
import { PullRequestDiffs } from './pull-request-diffs.ts';

const TARGET: DiffTarget = { project: 'storefront', pullRequestNumber: 57, headSha: 'a'.repeat(40) };
const OTHER_HEAD: DiffTarget = { ...TARGET, headSha: 'b'.repeat(40) };

function diffAt(readAt: string, patch = '@@ -1,1 +1,2 @@\n context\n+added'): PullRequestDiff {
  return { pullRequestNumber: 57, baseSha: 'c'.repeat(40), headSha: TARGET.headSha, readAt, files: [{ path: 'src/cart.ts', patch, truncated: false }] };
}

function stub(...answers: (PullRequestDiff | Error | unknown)[]) {
  const queue = [...answers];
  const loadPullRequestDiff = vi.fn(async () => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  return { diffs: new PullRequestDiffs({ loadPullRequestDiff }), loadPullRequestDiff };
}

async function settled(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('PullRequestDiffs', () => {
  it('reads nothing until a view asks for the diff', () => {
    const { diffs, loadPullRequestDiff } = stub(diffAt('2026-10-12T09:59:00.000Z'));
    expect(diffs.getState(TARGET)).toEqual({ status: 'idle' });
    expect(loadPullRequestDiff).not.toHaveBeenCalled();
  });

  it('reads the diff of the pull request of the project once, then holds it with the time it was read', async () => {
    const read = diffAt('2026-10-12T09:59:00.000Z');
    const { diffs, loadPullRequestDiff } = stub(read);
    diffs.ensure(TARGET);
    expect(diffs.getState(TARGET)).toEqual({ status: 'loading', previous: null });
    await settled();
    expect(diffs.getState(TARGET)).toEqual({ status: 'ready', diff: read });
    diffs.ensure(TARGET);
    await settled();
    expect(loadPullRequestDiff).toHaveBeenCalledTimes(1);
    expect(loadPullRequestDiff).toHaveBeenCalledWith('storefront', 57);
  });

  it('reads the diff again for a pull request that moved to another head commit, and keeps the heads apart', async () => {
    const first = diffAt('2026-10-12T09:50:00.000Z');
    const second = { ...diffAt('2026-10-12T09:58:00.000Z', '@@ -1,1 +1,3 @@\n context\n+added\n+more'), headSha: OTHER_HEAD.headSha };
    const { diffs, loadPullRequestDiff } = stub(first, second);
    diffs.ensure(TARGET);
    await settled();
    diffs.ensure(OTHER_HEAD);
    await settled();
    expect(loadPullRequestDiff).toHaveBeenCalledTimes(2);
    expect(diffs.getState(TARGET)).toEqual({ status: 'ready', diff: first });
    expect(diffs.getState(OTHER_HEAD)).toEqual({ status: 'ready', diff: second });
  });

  it('says why the diff could not be read, with nothing to show in its place', async () => {
    const { diffs } = stub(new Error('the factory knows no pull request 57 in storefront'));
    diffs.ensure(TARGET);
    await settled();
    expect(diffs.getState(TARGET)).toEqual({ status: 'failed', error: 'the factory knows no pull request 57 in storefront', previous: null });
  });

  it('refuses an answer that is not a diff and says what is wrong with it', async () => {
    const { diffs } = stub({ pullRequestNumber: 57, files: 'none' });
    diffs.ensure(TARGET);
    await settled();
    const state = diffs.getState(TARGET);
    expect(state.status).toBe('failed');
    expect(state.status === 'failed' ? state.error : '').toMatch(/baseSha|files/);
  });

  it('keeps the diff already read in view while it is read again, and when the second read fails', async () => {
    const first = diffAt('2026-10-12T09:50:00.000Z');
    const { diffs } = stub(first, new Error('connection reset'));
    diffs.ensure(TARGET);
    await settled();
    diffs.reload(TARGET);
    expect(diffs.getState(TARGET)).toEqual({ status: 'loading', previous: first });
    await settled();
    expect(diffs.getState(TARGET)).toEqual({ status: 'failed', error: 'connection reset', previous: first });
  });

  it('replaces the diff with the new one when the second read succeeds', async () => {
    const first = diffAt('2026-10-12T09:50:00.000Z');
    const second = diffAt('2026-10-12T09:58:00.000Z');
    const { diffs } = stub(first, second);
    diffs.ensure(TARGET);
    await settled();
    diffs.reload(TARGET);
    await settled();
    expect(diffs.getState(TARGET)).toEqual({ status: 'ready', diff: second });
  });

  it('does not start a second read while one is under way', async () => {
    const { diffs, loadPullRequestDiff } = stub(diffAt('2026-10-12T09:59:00.000Z'));
    diffs.ensure(TARGET);
    diffs.reload(TARGET);
    diffs.reload(TARGET);
    await settled();
    expect(loadPullRequestDiff).toHaveBeenCalledTimes(1);
  });

  it('tells the listeners of a pull request when its diff changes, and stops once they unsubscribe', async () => {
    const { diffs } = stub(diffAt('2026-10-12T09:59:00.000Z'));
    const listener = vi.fn();
    const other = vi.fn();
    const unsubscribe = diffs.subscribe(TARGET, listener);
    diffs.subscribe(OTHER_HEAD, other);
    diffs.ensure(TARGET);
    await settled();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(other).not.toHaveBeenCalled();
    unsubscribe();
    diffs.reload(TARGET);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
