import type { IssueState } from '@agent-factory/domain';
import { FEEDBACK_STATES } from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import type { ChangedFile, CheckConclusion, CheckRunView, PullRequestDiff, PullRequestView, ReviewRound } from '../../contract/index.ts';
import type { PullRequestDiffState } from '../../data/pull-request-diffs.ts';
import { pullRequestView } from '../../test/fixtures/seeds.ts';
import type { FilePatch } from './pull-request-model.ts';
import {
  checkMark,
  digestChecks,
  feedbackAvailability,
  fileTotals,
  findingLocation,
  groupPullRequests,
  hasDurations,
  hasHunks,
  keptDiff,
  latestRoundFirst,
  mergeAvailability,
  offersFileAtCommit,
  orderedPullRequests,
  patchOf,
  pullRequestActivityAt,
  toggledPath,
  unresolvedCount,
} from './pull-request-model.ts';

const OPENED = '2026-10-08T09:00:00.000Z';
const MERGED = '2026-10-09T09:00:00.000Z';

function pullRequest(number: number, overrides: Partial<PullRequestView> = {}): PullRequestView {
  return pullRequestView({
    number,
    title: `Pull request ${number}`,
    issueNumber: number + 100,
    type: 'fix',
    branch: `factory/${number}`,
    url: `https://forge.example.com/pull/${number}`,
    headSha: `head-${number}`,
    state: 'open',
    openedAt: OPENED,
    ...overrides,
  });
}

function check(name: string, conclusion: CheckConclusion, durationMs: number | null = null, failsOnBase = false): CheckRunView {
  return { name, conclusion, url: `https://forge.example.com/checks/${name}`, durationMs, failsOnBase };
}

describe('mergeAvailability', () => {
  it('offers the merge of an open pull request that is mergeable and has no blocker', () => {
    expect(mergeAvailability({ state: 'open', mergeable: true, mergeBlockers: [] })).toEqual({ kind: 'ready' });
  });

  it('blocks an open pull request that has blockers, and names them', () => {
    expect(mergeAvailability({ state: 'open', mergeable: false, mergeBlockers: ['check lint failed'] })).toEqual({ kind: 'blocked', blockers: ['check lint failed'] });
  });

  it('blocks a pull request that is flagged mergeable while blockers are named', () => {
    expect(mergeAvailability({ state: 'open', mergeable: true, mergeBlockers: ['the issue is blocked'] })).toEqual({ kind: 'blocked', blockers: ['the issue is blocked'] });
  });

  it('blocks an open pull request that is not mergeable even though no blocker is named', () => {
    expect(mergeAvailability({ state: 'open', mergeable: false, mergeBlockers: [] })).toEqual({ kind: 'blocked', blockers: [] });
  });

  it('offers no merge for a pull request that is merged or closed, whatever its flags say', () => {
    expect(mergeAvailability({ state: 'merged', mergeable: true, mergeBlockers: [] })).toEqual({ kind: 'unavailable' });
    expect(mergeAvailability({ state: 'closed', mergeable: true, mergeBlockers: [] })).toEqual({ kind: 'unavailable' });
  });
});

describe('groupPullRequests', () => {
  const ready = pullRequest(1, { mergeable: true, openedAt: '2026-10-01T00:00:00.000Z' });
  const newerBlocked = pullRequest(2, { openedAt: '2026-10-10T00:00:00.000Z', mergeBlockers: ['check lint failed'] });
  const olderBlocked = pullRequest(3, { openedAt: '2026-10-05T00:00:00.000Z', mergeBlockers: ['check lint failed'] });
  const mergedEarly = pullRequest(4, { state: 'merged', mergedAt: '2026-10-02T00:00:00.000Z' });
  const mergedLate = pullRequest(5, { state: 'merged', openedAt: '2026-09-01T00:00:00.000Z', mergedAt: '2026-10-09T00:00:00.000Z' });
  const closedOld = pullRequest(6, { state: 'closed', openedAt: '2026-09-01T00:00:00.000Z' });
  const closedNew = pullRequest(7, { state: 'closed', openedAt: '2026-10-03T00:00:00.000Z' });

  it('puts the pull requests that can be merged first, then the other open ones by recency', () => {
    const groups = groupPullRequests([olderBlocked, newerBlocked, mergedEarly, ready, closedOld]);
    expect(groups.open.map((entry) => entry.number)).toEqual([1, 2, 3]);
  });

  it('orders the merged ones by merge time and the closed ones by the time they were opened, most recent first', () => {
    const groups = groupPullRequests([mergedEarly, mergedLate, closedOld, closedNew]);
    expect(groups.merged.map((entry) => entry.number)).toEqual([5, 4]);
    expect(groups.closed.map((entry) => entry.number)).toEqual([7, 6]);
  });

  it('lists the open pull requests, then the merged ones, then the closed ones', () => {
    const groups = groupPullRequests([closedNew, mergedLate, olderBlocked, ready]);
    expect(orderedPullRequests(groups).map((entry) => entry.number)).toEqual([1, 3, 5, 7]);
  });

  it('dates a merged pull request by its merge and an open one by the time it was opened', () => {
    expect(pullRequestActivityAt({ mergedAt: MERGED, openedAt: OPENED })).toBe(MERGED);
    expect(pullRequestActivityAt({ mergedAt: null, openedAt: OPENED })).toBe(OPENED);
  });
});

describe('digestChecks', () => {
  it('says the checks are unread while the reading holds no value, whether or not it failed', () => {
    expect(digestChecks({ value: null, readAt: null, error: null })).toEqual({ kind: 'unread' });
    expect(digestChecks({ value: null, readAt: null, error: 'forge unreachable' })).toEqual({ kind: 'unread' });
  });

  it('says the forge reports no check when it was read and holds none', () => {
    expect(digestChecks({ value: [], readAt: OPENED, error: null })).toEqual({ kind: 'none' });
  });

  it('counts the checks that passed and marks success when nothing failed or is pending', () => {
    const digest = digestChecks({ value: [check('build', 'success'), check('deploy', 'neutral'), check('docs', 'skipped')], readAt: OPENED, error: null });
    expect(digest).toEqual({ kind: 'counted', mark: 'success', passed: 1, total: 3, failingOnBase: 0 });
  });

  it('marks a failure over a pending check, and a pending check over success', () => {
    expect(digestChecks({ value: [check('a', 'success'), check('b', 'failure'), check('c', 'pending')], readAt: OPENED, error: null })).toMatchObject({ mark: 'failed', passed: 1, total: 3, failingOnBase: 0 });
    expect(digestChecks({ value: [check('a', 'success'), check('c', 'pending')], readAt: OPENED, error: null })).toMatchObject({ mark: 'running' });
  });

  it('keeps counting the value a failed read left in place', () => {
    expect(digestChecks({ value: [check('a', 'success')], readAt: OPENED, error: 'rate limited' })).toMatchObject({ kind: 'counted', passed: 1, total: 1 });
  });

  it('does not hold against the change a failure the base branch shares', () => {
    const shared = check('e2e', 'failure', null, true);
    expect(digestChecks({ value: [check('build', 'success'), shared], readAt: OPENED, error: null })).toEqual({ kind: 'counted', mark: 'success', passed: 1, total: 2, failingOnBase: 1 });
  });

  it('still marks a failure the base branch does not share', () => {
    const value = [check('build', 'success'), check('e2e', 'failure', null, true), check('lint', 'failure')];
    expect(digestChecks({ value, readAt: OPENED, error: null })).toMatchObject({ mark: 'failed', passed: 1, total: 3 });
  });

  it('keeps a pending check pending beside a failure the base shares', () => {
    expect(digestChecks({ value: [check('e2e', 'failure', null, true), check('deploy', 'pending')], readAt: OPENED, error: null })).toMatchObject({ mark: 'running' });
  });

  it('marks a failure the base shares as neutral, and a failure the change caused as failed', () => {
    expect(checkMark({ conclusion: 'failure', failsOnBase: true })).toBe('idle');
    expect(checkMark({ conclusion: 'failure', failsOnBase: false })).toBe('failed');
  });

  it('marks the other conclusions as they are, whatever the base says', () => {
    expect(checkMark({ conclusion: 'success', failsOnBase: false })).toBe('success');
    expect(checkMark({ conclusion: 'success', failsOnBase: true })).toBe('success');
    expect(checkMark({ conclusion: 'pending', failsOnBase: false })).toBe('running');
    expect(checkMark({ conclusion: 'cancelled', failsOnBase: true })).toBe('blocked');
  });

  it('knows whether any check carries a duration', () => {
    expect(hasDurations([check('a', 'success'), check('b', 'success', 1500)])).toBe(true);
    expect(hasDurations([check('a', 'success'), check('b', 'pending')])).toBe(false);
  });
});

describe('feedbackAvailability', () => {
  const open = { state: 'open', issueNumber: 52 } as const;

  it.each(FEEDBACK_STATES)('takes feedback on an open pull request whose issue is %s', (state) => {
    expect(feedbackAvailability(open, [{ number: 52, state }])).toEqual({ kind: 'open' });
  });

  it.each<IssueState>(['ready-to-merge', 'implementing', 'needs-human', 'merged'])('explains that an issue that is %s takes no feedback', (state) => {
    expect(feedbackAvailability(open, [{ number: 52, state }])).toEqual({ kind: 'issue-not-awaiting-review', issueNumber: 52, issueState: state });
  });

  it('answers for the issue of this pull request, not for another that shares a number in another project', () => {
    expect(feedbackAvailability(open, [{ number: 53, state: 'ready-to-merge' }, { number: 52, state: 'ci' }])).toEqual({ kind: 'open' });
  });

  it('leaves the decision to the factory when the issue is not in the snapshot', () => {
    expect(feedbackAvailability(open, [])).toEqual({ kind: 'open' });
  });

  it('takes no feedback on a pull request that is merged or closed', () => {
    expect(feedbackAvailability({ state: 'merged', issueNumber: 52 }, [{ number: 52, state: 'ci' }])).toEqual({ kind: 'pull-request-settled', state: 'merged' });
    expect(feedbackAvailability({ state: 'closed', issueNumber: 52 }, [])).toEqual({ kind: 'pull-request-settled', state: 'closed' });
  });
});

describe('review rounds', () => {
  const finding = (resolved: boolean) => ({ severity: 'blocking', category: 'correctness', file: 'src/a.ts', line: 3, summary: 'A finding', resolved }) as const;
  const round = (number: number, resolved: readonly boolean[]): ReviewRound => ({ round: number, runId: `run_${number}`, completedAt: OPENED, findings: resolved.map(finding) });

  it('puts the latest round first without touching the order it was given', () => {
    const rounds = [round(1, []), round(3, []), round(2, [])];
    expect(latestRoundFirst(rounds).map((entry) => entry.round)).toEqual([3, 2, 1]);
    expect(rounds.map((entry) => entry.round)).toEqual([1, 3, 2]);
  });

  it('counts the findings nobody has resolved', () => {
    expect(unresolvedCount(round(1, [true, false, false]))).toBe(2);
    expect(unresolvedCount(round(1, []))).toBe(0);
  });

  it('locates a finding by file and line, by file alone, or not at all', () => {
    expect(findingLocation({ file: 'src/a.ts', line: 12 })).toBe('src/a.ts:12');
    expect(findingLocation({ file: 'src/a.ts', line: null })).toBe('src/a.ts');
    expect(findingLocation({ file: null, line: null })).toBeNull();
  });
});

describe('changed files', () => {
  const file = (path: string, additions: number, deletions: number): ChangedFile => ({ path, additions, deletions });

  it('adds up the files, the additions and the deletions', () => {
    expect(fileTotals([file('a.ts', 3, 1), file('b.ts', 10, 0)])).toEqual({ files: 2, additions: 13, deletions: 1 });
    expect(fileTotals([])).toEqual({ files: 0, additions: 0, deletions: 0 });
  });

  it('opens a path that is closed and closes a path that is open, leaving the set it was given alone', () => {
    const none: ReadonlySet<string> = new Set();
    const one = toggledPath(none, 'a.ts');
    expect([...one]).toEqual(['a.ts']);
    expect([...none]).toEqual([]);
    expect([...toggledPath(one, 'b.ts')]).toEqual(['a.ts', 'b.ts']);
    expect([...toggledPath(one, 'a.ts')]).toEqual([]);
  });

});

describe('files at the head commit', () => {
  const file = (additions: number, deletions: number): ChangedFile => ({ path: 'a.ts', additions, deletions });
  const patch = (text: string): FilePatch => ({ kind: 'patch', patch: text, truncated: false, hunks: hasHunks(text) });
  const TRIMMED = '@@ -10,6 +10,3 @@\n context\n-removed\n-removed\n-removed\n context';
  const DELETED = '@@ -1,48 +0,0 @@\n-first\n-second';
  const DELETED_ONE_LINE = '@@ -1 +0,0 @@\n-only';

  it('holds a file whose change adds a line or removes none, whatever the diff says', () => {
    expect(offersFileAtCommit(file(3, 1), null)).toBe(true);
    expect(offersFileAtCommit(file(3, 0), patch(DELETED))).toBe(true);
    expect(offersFileAtCommit(file(0, 0), null)).toBe(true);
  });

  it('does not know whether a file that only lost lines is still there until the diff has been read', () => {
    expect(offersFileAtCommit(file(0, 48), null)).toBe(false);
    expect(offersFileAtCommit(file(0, 48), { kind: 'missing' })).toBe(false);
    expect(offersFileAtCommit(file(0, 48), patch('Binary files a/a.ts and b/a.ts differ'))).toBe(false);
  });

  it('holds a file that only lost lines when its patch leaves lines on the side of the head commit', () => {
    expect(offersFileAtCommit(file(0, 3), patch(TRIMMED))).toBe(true);
  });

  it('does not hold a file whose patch leaves no line on the side of the head commit', () => {
    expect(offersFileAtCommit(file(0, 48), patch(DELETED))).toBe(false);
    expect(offersFileAtCommit(file(0, 1), patch(DELETED_ONE_LINE))).toBe(false);
  });
});

describe('patches', () => {
  const READ_AT = '2026-10-12T09:59:00.000Z';
  const diff = (files: PullRequestDiff['files']): PullRequestDiff => ({ pullRequestNumber: 57, baseSha: 'b'.repeat(40), headSha: 'a'.repeat(40), readAt: READ_AT, files: [...files] });
  const PATCH = '@@ -1,2 +1,2 @@\n-old\n+new';

  it('recognises a patch that has hunks to colour', () => {
    expect(hasHunks(PATCH)).toBe(true);
    expect(hasHunks('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b')).toBe(true);
  });

  it('recognises a patch that has none, such as the sentence git gives a binary file', () => {
    expect(hasHunks('Binary files a/logo.png and b/logo.png differ')).toBe(false);
    expect(hasHunks('')).toBe(false);
    expect(hasHunks('  @@ -1 +1 @@ not at the start of a line')).toBe(false);
  });

  it('gives the patch of the file the path names, with whether it is cut and whether it has hunks', () => {
    const whole = diff([{ path: 'a.ts', patch: PATCH, truncated: false }, { path: 'b.ts', patch: PATCH, truncated: true }]);
    expect(patchOf(whole, 'a.ts')).toEqual({ kind: 'patch', patch: PATCH, truncated: false, hunks: true });
    expect(patchOf(whole, 'b.ts')).toEqual({ kind: 'patch', patch: PATCH, truncated: true, hunks: true });
  });

  it('gives a patch without hunks as it is', () => {
    const binary = 'Binary files a/logo.png and b/logo.png differ';
    expect(patchOf(diff([{ path: 'logo.png', patch: binary, truncated: false }]), 'logo.png')).toEqual({ kind: 'patch', patch: binary, truncated: false, hunks: false });
  });

  it('gives nothing for a file the diff does not list, and for a file whose patch is blank', () => {
    expect(patchOf(diff([{ path: 'a.ts', patch: PATCH, truncated: false }]), 'b.ts')).toEqual({ kind: 'missing' });
    expect(patchOf(diff([{ path: 'a.ts', patch: ' \n ', truncated: false }]), 'a.ts')).toEqual({ kind: 'missing' });
  });

  it('keeps the diff a state holds, or the one an earlier read left in place', () => {
    const read = diff([]);
    const states: ReadonlyArray<readonly [PullRequestDiffState, PullRequestDiff | null]> = [
      [{ status: 'idle' }, null],
      [{ status: 'loading', previous: null }, null],
      [{ status: 'loading', previous: read }, read],
      [{ status: 'ready', diff: read }, read],
      [{ status: 'failed', error: 'the clone is not available', previous: null }, null],
      [{ status: 'failed', error: 'the clone is not available', previous: read }, read],
    ];
    for (const [state, kept] of states) expect(keptDiff(state)).toBe(kept);
  });
});
