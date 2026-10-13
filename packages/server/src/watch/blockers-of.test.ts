import { describe, expect, it } from 'vitest';
import { BLOCKER_KINDS, DEFAULT_BLOCKER_THRESHOLDS } from './blocker.ts';
import { blockersOf } from './blockers-of.ts';
import { filmOrderView, issueView, minutesBefore, projectView, pullRequestView, READ_AT, runView, storefrontWith, watchedSnapshot } from './testing/watched-snapshots.ts';
import type { WatchedFilmOrder, WatchedPullRequest } from './watched-snapshot.ts';

const kindsOf = (snapshot = storefrontWith([])) => blockersOf(snapshot, READ_AT).map((blocker) => blocker.kind);

describe('what blocks work in a snapshot', () => {
  it('finds nothing in a factory that works', () => {
    const snapshot = storefrontWith([issueView(12), issueView(13, { state: 'pr-open' })], [runView('run-1')]);
    expect(blockersOf(snapshot, READ_AT)).toEqual([]);
  });

  describe('an issue that needs a person', () => {
    const escalated = issueView(12, {
      state: 'needs-human',
      updatedAt: minutesBefore(40),
      escalation: { reason: 'the before proof is not valid:\n  the checks do not fail on the base', diagnosis: '', since: minutesBefore(40) },
    });

    it('is reported with the reason it gave, on one line', () => {
      expect(blockersOf(storefrontWith([escalated]), READ_AT)).toEqual([
        {
          key: `needs-human|storefront|12|${minutesBefore(40)}`,
          kind: 'needs-human',
          project: 'storefront',
          issue: 12,
          detail: 'the before proof is not valid: the checks do not fail on the base',
        },
      ]);
    });

    it('is reported once as a pending decision when an agent waits for the answer to a question', () => {
      const question = { id: 'decision-run-9', text: 'Which rounding mode should discounts use?', options: [], askedAt: minutesBefore(40) };
      const snapshot = storefrontWith([escalated], [runView('run-9', { status: 'waiting', pendingQuestion: question })]);
      expect(blockersOf(snapshot, READ_AT).map((blocker) => [blocker.kind, blocker.issue, blocker.detail])).toEqual([
        ['decision-pending', 12, 'Which rounding mode should discounts use? (run run-9)'],
      ]);
    });

    it('is a new blocker when the issue is escalated again later', () => {
      const again = { ...escalated, escalation: { reason: 'the gate failed', diagnosis: '', since: minutesBefore(5) } };
      const first = blockersOf(storefrontWith([escalated]), READ_AT)[0];
      const second = blockersOf(storefrontWith([again]), READ_AT)[0];
      expect(first?.key).not.toBe(second?.key);
    });
  });

  describe('a run that failed', () => {
    const failed = (id: string, endedMinutesAgo: number, overrides = {}) =>
      runView(id, { status: 'failed', outcome: 'error', startedAt: minutesBefore(endedMinutesAgo + 4), endedAt: minutesBefore(endedMinutesAgo), lastLine: 'Bash  pnpm test', ...overrides });

    it('is reported while the issue it worked on still owes work', () => {
      const blockers = blockersOf(storefrontWith([issueView(12)], [failed('run-4', 6)]), READ_AT);
      expect(blockers).toEqual([
        { key: 'run-failed|storefront|run-4', kind: 'run-failed', project: 'storefront', issue: 12, detail: 'implementer run run-4 ended error: Bash pnpm test' },
      ]);
    });

    it('is over once the same work ran again, and a failure older than the window is forgotten', () => {
      const retried = storefrontWith([issueView(12)], [failed('run-4', 6), runView('run-5', { startedAt: minutesBefore(2) })]);
      expect(kindsOf(retried)).toEqual([]);
      const old = storefrontWith([issueView(12)], [failed('run-4', DEFAULT_BLOCKER_THRESHOLDS.failedRunWindowMs / 60_000 + 1)]);
      expect(kindsOf(old)).toEqual([]);
    });

    it('is not reported for an issue that left the pipeline: an escalation has its own report, and a closed issue none', () => {
      expect(kindsOf(storefrontWith([issueView(12, { state: 'closed' })], [failed('run-4', 6)]))).toEqual([]);
      expect(kindsOf(storefrontWith([issueView(12, { state: 'pr-open' })], [failed('run-4', 6)]))).toEqual([]);
      expect(kindsOf(storefrontWith([], [failed('run-4', 6)]))).toEqual([]);
    });

    it('is reported for work that is not an issue, such as the audit of a commit', () => {
      const audit = failed('run-8', 6, { role: 'auditor', subject: { kind: 'audit', id: '8d33a43' } });
      expect(blockersOf(storefrontWith([], [audit]), READ_AT).map((blocker) => [blocker.kind, blocker.issue])).toEqual([['run-failed', null]]);
    });
  });

  describe('an issue in flight with no run', () => {
    const silent = (minutes: number, overrides = {}) => issueView(12, { updatedAt: minutesBefore(minutes), ...overrides });

    it('is stalled once nothing was recorded for it for ten minutes', () => {
      expect(blockersOf(storefrontWith([silent(11)]), READ_AT)).toEqual([
        { key: 'stalled|storefront|12', kind: 'stalled', project: 'storefront', issue: 12, detail: 'in implementing for 11 min with no agent run' },
      ]);
      expect(kindsOf(storefrontWith([silent(9)]))).toEqual([]);
    });

    it('counts the end of its latest run as activity, and a live run as no stall at all', () => {
      const ended = runView('run-3', { status: 'succeeded', outcome: 'success', startedAt: minutesBefore(30), endedAt: minutesBefore(4) });
      expect(kindsOf(storefrontWith([silent(30)], [ended]))).toEqual([]);
      expect(kindsOf(storefrontWith([silent(30)], [runView('run-3')]))).toEqual([]);
      expect(kindsOf(storefrontWith([silent(30)], [runView('run-3', { status: 'waiting' })]))).toEqual([]);
    });

    it('is only an issue in a stage that owes an agent run: the factory runs its own commands in the others', () => {
      for (const state of ['gating', 'checks-frozen', 'producing-evidence', 'pr-open', 'ci', 'spec-validated', 'blocked'] as const) {
        expect(kindsOf(storefrontWith([silent(45, { state })])), state).toEqual([]);
      }
      for (const state of ['authoring-checks', 'rewriting-check', 'implementing', 'reviewing'] as const) {
        expect(kindsOf(storefrontWith([silent(45, { state })])), state).toEqual(['stalled']);
      }
    });

    it('is waiting, not stalled, while a film of its open pull request is queued or recording', () => {
      const withFilm = (state: WatchedFilmOrder['state'], pullRequest: Partial<WatchedPullRequest> = {}) =>
        watchedSnapshot({
          projects: [projectView('storefront', { issues: [silent(45, { state: 'rewriting-check' })], pullRequests: [pullRequestView(31, 12, { filmOrders: [filmOrderView('checkout-flow', { state })], ...pullRequest })] })],
        });
      for (const state of ['queued', 'recording-base', 'recording-head', 'committing'] as const) expect(kindsOf(withFilm(state)), state).toEqual([]);
      for (const state of ['finished', 'failed'] as const) expect(kindsOf(withFilm(state)), state).toEqual(['stalled', ...(state === 'failed' ? ['film-failed'] : [])]);
      for (const state of ['merged', 'closed'] as const) expect(kindsOf(withFilm('queued', { state })), state).toEqual(['stalled']);
    });

    it('stays stalled when the film queued belongs to the pull request of another issue', () => {
      const snapshot = watchedSnapshot({
        projects: [
          projectView('storefront', { issues: [silent(45)], pullRequests: [pullRequestView(31, 13, { filmOrders: [filmOrderView('checkout-flow', { state: 'queued' })] })] }),
        ],
      });
      expect(kindsOf(snapshot)).toEqual(['stalled']);
    });

    it('is explained by a pause of the issue, of its project or of the factory', () => {
      const pause = { scope: 'project' as const, cause: 'operator' as const, reason: 'paused by Alex Morgan', since: minutesBefore(2), resumesAt: null };
      expect(kindsOf(storefrontWith([silent(45, { paused: true })]))).toEqual([]);
      expect(kindsOf(watchedSnapshot({ projects: [projectView('storefront', { issues: [silent(45)], pauses: [pause] })] }))).toEqual([]);
      expect(kindsOf(watchedSnapshot({ installation: { pauses: [{ ...pause, scope: 'installation' }] }, projects: [projectView('storefront', { issues: [silent(45)] })] }))).toEqual([]);
    });
  });

  describe('a pause', () => {
    const pause = (cause: 'operator' | 'budget' | 'resources' | 'drain', minutes: number, resumesAt: string | null = null) => ({
      scope: 'installation' as const,
      cause,
      reason: `${cause} pause`,
      since: minutesBefore(minutes),
      resumesAt,
    });

    it('is reported once it lasts past ten minutes, with when it resumes', () => {
      const lasting = watchedSnapshot({ installation: { pauses: [pause('budget', 90, '2026-10-12T17:00:00.000Z')] } });
      expect(blockersOf(lasting, READ_AT)).toEqual([
        {
          key: `paused||budget|${minutesBefore(90)}`,
          kind: 'paused',
          project: null,
          issue: null,
          detail: `budget pause since ${minutesBefore(90)}, resumes 2026-10-12T17:00:00.000Z: budget pause`,
        },
      ]);
      expect(kindsOf(watchedSnapshot({ installation: { pauses: [pause('operator', 9)] } }))).toEqual([]);
    });

    it('is reported for a project with the project, and a drain is not a pause that blocks', () => {
      const projectPause = { ...pause('resources', 30), scope: 'project' as const };
      const snapshot = watchedSnapshot({ installation: { pauses: [pause('drain', 30)] }, projects: [projectView('ledger', { pauses: [projectPause] })] });
      expect(blockersOf(snapshot, READ_AT).map((blocker) => [blocker.kind, blocker.project])).toEqual([['paused', 'ledger']]);
    });
  });

  describe('a film that failed', () => {
    const failedFilm = (scenario: string, overrides: Partial<WatchedFilmOrder> = {}) =>
      filmOrderView(scenario, { state: 'failed', reason: 'the session expired', since: minutesBefore(12), ...overrides });
    const withPullRequest = (orders: readonly WatchedFilmOrder[], overrides: Partial<WatchedPullRequest> = {}) =>
      watchedSnapshot({ projects: [projectView('storefront', { pullRequests: [pullRequestView(31, 12, { filmOrders: [...orders], ...overrides })] })] });

    it('is reported with its scenario, its pull request and the reason it gave, on one line', () => {
      const snapshot = withPullRequest([failedFilm('checkout-flow', { reason: 'the session expired:\n  sign in again' })]);
      expect(blockersOf(snapshot, READ_AT)).toEqual([
        {
          key: `film-failed|storefront|31|checkout-flow|${minutesBefore(12)}`,
          kind: 'film-failed',
          project: 'storefront',
          issue: 12,
          detail: 'film checkout-flow of pull request #31: the session expired: sign in again',
        },
      ]);
    });

    it('is one blocker for each failed scenario, and none for a film that waits, records or finished', () => {
      const orders = [
        failedFilm('checkout-flow'),
        failedFilm('order-history', { reason: null }),
        filmOrderView('wishlist', { state: 'queued' }),
        filmOrderView('returns', { state: 'recording-head' }),
        filmOrderView('gift-cards', { state: 'finished' }),
      ];
      expect(blockersOf(withPullRequest(orders), READ_AT).map((blocker) => [blocker.kind, blocker.detail])).toEqual([
        ['film-failed', 'film checkout-flow of pull request #31: the session expired'],
        ['film-failed', 'film order-history of pull request #31: no reason recorded'],
      ]);
    });

    it('is over once the film is ordered again, and a new blocker when the new recording fails', () => {
      const first = blockersOf(withPullRequest([failedFilm('checkout-flow')]), READ_AT);
      expect(kindsOf(withPullRequest([filmOrderView('checkout-flow', { state: 'queued' })]))).toEqual([]);
      const second = blockersOf(withPullRequest([failedFilm('checkout-flow', { since: minutesBefore(2) })]), READ_AT);
      expect(second).toHaveLength(1);
      expect(second[0]?.key).not.toBe(first[0]?.key);
    });

    it('is forgotten once the pull request is merged or closed', () => {
      for (const state of ['merged', 'closed'] as const) expect(kindsOf(withPullRequest([failedFilm('checkout-flow')], { state })), state).toEqual([]);
    });
  });

  describe('a full pool of worktrees', () => {
    it('is reported with the issues that wait and the issues that hold the worktrees', () => {
      const shortage = {
        since: minutesBefore(25),
        poolSize: 3,
        waiting: [14, 15],
        holders: [
          { issueNumber: 9, state: 'needs-human' as const, pullRequestNumber: null },
          { issueNumber: 11, state: 'pr-open' as const, pullRequestNumber: 31 },
          { issueNumber: 12, state: null, pullRequestNumber: 32 },
        ],
      };
      const snapshot = watchedSnapshot({ projects: [projectView('ledger', { scheduler: { worktreeShortage: shortage } })] });
      expect(blockersOf(snapshot, READ_AT)).toEqual([
        {
          key: `no-free-worktree|ledger|${minutesBefore(25)}`,
          kind: 'no-free-worktree',
          project: 'ledger',
          issue: null,
          detail: `pool 3/3 held by #9 (needs-human), #11 with pull request #31 (pr-open), #12 with pull request #32; waiting since ${minutesBefore(25)}: #14, #15`,
        },
      ]);
    });
  });

  it('lists the kinds in the order of the report, one blocker per key', () => {
    const question = { id: 'decision-run-9', text: 'Which mode?', options: [], askedAt: minutesBefore(30) };
    const snapshot = watchedSnapshot({
      installation: { pauses: [{ scope: 'installation', cause: 'operator', reason: 'holiday', since: minutesBefore(60), resumesAt: null }] },
      projects: [
        projectView('storefront', {
          issues: [issueView(12, { state: 'needs-human', escalation: { reason: 'stop', diagnosis: '', since: minutesBefore(30) } }), issueView(13)],
          pullRequests: [pullRequestView(31, 13, { filmOrders: [filmOrderView('checkout-flow', { state: 'failed', reason: 'the session expired' })] })],
        }),
      ],
      runs: [runView('run-9', { status: 'waiting', pendingQuestion: question })],
    });
    expect(blockersOf(snapshot, READ_AT).map((blocker) => blocker.kind)).toEqual([BLOCKER_KINDS.decisionPending, BLOCKER_KINDS.paused, BLOCKER_KINDS.filmFailed]);
  });
});
