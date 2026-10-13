import { describe, expect, it } from 'vitest';
import { PullRequestViewSchema, ReadyNoticeViewSchema, type PullRequestView } from '@agent-factory/cockpit';
import { FilmLedger, PIPELINE_EVENTS, type CheckRunSummary, type EventStore, type FactoryEventRecord, type FilmPresentation } from '@agent-factory/application';
import { indexEvents } from './event-index.ts';
import { issueJournals } from './issue-views.ts';
import { projectPullRequests } from './pull-request-views.ts';
import type { ProjectSnapshotContext } from './snapshot-context.ts';
import { GENERATED_AT, PROJECT_ID, projectContext, projectHistory, type ProjectHistory } from './testing/project-history.ts';

const MINUTE_MS = 60_000;
const ISSUE_SUBJECT = 'issue/42';
const UNUSED_LOG: EventStore = {
  append: () => Promise.reject(new Error('not used')),
  read: () => Promise.resolve([]),
  subscribe: () => () => undefined,
};
const PRESENTATION: FilmPresentation = { fallbackDurationMs: 20 * MINUTE_MS, timeZone: 'UTC', cockpitUrl: null };
const READ_AT = new Date(GENERATED_AT.getTime() - 2 * MINUTE_MS);
const run = (conclusion: CheckRunSummary['conclusion'], name = 'ci'): CheckRunSummary => ({ name, conclusion, url: `https://ci.example/${name}`, durationMs: null });
const observed = (checks: readonly CheckRunSummary[]) => ({ value: checks, readAt: READ_AT, error: null });

function withEvents(history: ProjectHistory, ...events: readonly Pick<FactoryEventRecord, 'type' | 'payload'>[]): ProjectHistory {
  const last = Math.max(...[...history.project, ...history.installation].map((record) => record.sequence));
  const extra = events.map((event, position): FactoryEventRecord => ({
    sequence: last + position + 1,
    occurredAt: new Date(GENERATED_AT.getTime() - (events.length - position) * MINUTE_MS),
    type: event.type,
    subject: ISSUE_SUBJECT,
    payload: event.payload,
  }));
  return { ...history, project: [...history.project, ...extra] };
}

function pullRequestOf(history: ProjectHistory, overrides: Partial<ProjectSnapshotContext> = {}, filming = true): PullRequestView {
  const films = filming
    ? { forecast: FilmLedger.ofInstallation(UNUSED_LOG, [PROJECT_ID], { now: () => GENERATED_AT }, PRESENTATION.fallbackDurationMs).forecastFrom(new Map([[PROJECT_ID, history.project]])), presentation: PRESENTATION, toolWait: null }
    : null;
  const context = projectContext(history, { films, ...overrides });
  const index = indexEvents(history.project);
  const [pullRequest] = projectPullRequests(issueJournals(index), index, context);
  if (pullRequest === undefined) throw new Error('the history has no pull request');
  return pullRequest;
}

function headOf(history: ProjectHistory): string {
  const index = indexEvents(history.project);
  const head = issueJournals(index).get(42)?.pushedHead;
  if (head === undefined || head === null) throw new Error('the history has no pushed head');
  return head;
}

const GREEN = { pullRequestChecks: new Map([[100, observed([run('success')])]]) };

describe('the ready notice of a pull request in the cockpit', () => {
  it('is held by the checks while they were never read, and says so', () => {
    const pullRequest = pullRequestOf(projectHistory(), { pullRequestChecks: new Map() });
    expect(PullRequestViewSchema.safeParse(pullRequest).error?.issues ?? []).toEqual([]);
    expect(pullRequest.readyNotice).toEqual({ status: 'held', holds: [{ kind: 'checks-running' }], checksReadAt: null });
  });

  it('is held while a check runs, with when the checks were read, and by a failing check', () => {
    expect(pullRequestOf(projectHistory(), { pullRequestChecks: new Map([[100, observed([run('pending')])]]) }).readyNotice).toEqual({
      status: 'held',
      holds: [{ kind: 'checks-running' }],
      checksReadAt: READ_AT.toISOString(),
    });
    expect(pullRequestOf(projectHistory(), { pullRequestChecks: new Map([[100, observed([run('failure')])]]) }).readyNotice).toMatchObject({ status: 'held', holds: [{ kind: 'checks-failed' }] });
  });

  it('does not count a failure the base branch has too', () => {
    const context = { pullRequestChecks: new Map([[100, observed([run('failure', 'lint'), run('success', 'unit')])]]), baseChecks: observed([run('failure', 'lint')]) };
    expect(pullRequestOf(projectHistory(), context).readyNotice).toEqual({ status: 'due' });
  });

  it('is due once the required checks passed and no film holds it', () => {
    expect(pullRequestOf(projectHistory(), GREEN).readyNotice).toEqual({ status: 'due' });
  });

  it('is held by a film queued or recording, and by one that failed, with the scenarios named', () => {
    const queued = withEvents(projectHistory(), { type: PIPELINE_EVENTS.filmQueued, payload: { scenario: 'checkout-flow', operator: 'Alex Morgan' } });
    expect(pullRequestOf(queued, GREEN).readyNotice).toEqual({ status: 'held', holds: [{ kind: 'films-pending', scenarios: ['checkout-flow'] }], checksReadAt: READ_AT.toISOString() });

    const failed = withEvents(
      projectHistory(),
      { type: PIPELINE_EVENTS.filmQueued, payload: { scenario: 'checkout-flow', operator: 'Alex Morgan' } },
      { type: PIPELINE_EVENTS.filmFailed, payload: { scenario: 'checkout-flow', reason: 'the session expired' } },
    );
    expect(pullRequestOf(failed, GREEN).readyNotice).toMatchObject({ status: 'held', holds: [{ kind: 'films-failed', scenarios: ['checkout-flow'] }] });
  });

  it('lists every hold at once, the checks first', () => {
    const history = withEvents(projectHistory(), { type: PIPELINE_EVENTS.filmQueued, payload: { scenario: 'checkout-flow', operator: 'Alex Morgan' } });
    expect((pullRequestOf(history, { pullRequestChecks: new Map([[100, observed([run('pending')])]]) }).readyNotice as { holds: unknown[] }).holds).toEqual([
      { kind: 'checks-running' },
      { kind: 'films-pending', scenarios: ['checkout-flow'] },
    ]);
  });

  it('leaves the films out when the project films nothing', () => {
    const history = withEvents(projectHistory(), { type: PIPELINE_EVENTS.filmQueued, payload: { scenario: 'checkout-flow', operator: 'Alex Morgan' } });
    expect(pullRequestOf(history, GREEN, false).readyNotice).toEqual({ status: 'due' });
  });

  it('is sent once announced for the head it has now, with its links and the files that failed', () => {
    const history = projectHistory();
    const announced = withEvents(history, {
      type: PIPELINE_EVENTS.pullRequestReadyAnnounced,
      payload: {
        pullRequestNumber: 100,
        headSha: headOf(history),
        links: [{ label: 'checkout-flow · after · film.mp4', url: 'https://files.example.test/after' }],
        failures: [{ label: 'checkout-flow · before · film.mp4', reason: 'the upload command exited with 3: the storage is full' }],
      },
    });
    const notice = pullRequestOf(announced, GREEN).readyNotice;
    expect(ReadyNoticeViewSchema.safeParse(notice).error?.issues ?? []).toEqual([]);
    expect(notice).toEqual({
      status: 'sent',
      sentAt: new Date(GENERATED_AT.getTime() - MINUTE_MS).toISOString(),
      headSha: headOf(history),
      links: [{ label: 'checkout-flow · after · film.mp4', url: 'https://files.example.test/after' }],
      failures: [{ label: 'checkout-flow · before · film.mp4', reason: 'the upload command exited with 3: the storage is full' }],
    });
  });

  it('is due again for a new head: the notice of an earlier head does not count', () => {
    const history = projectHistory();
    const earlier = withEvents(history, { type: PIPELINE_EVENTS.pullRequestReadyAnnounced, payload: { pullRequestNumber: 100, headSha: 'a-head-the-pull-request-had-before', links: [], failures: [] } });
    expect(pullRequestOf(earlier, GREEN).readyNotice).toEqual({ status: 'due' });
  });

  it('keeps the last notice of a pull request that was merged, and has none to show when it never got one', () => {
    const history = projectHistory();
    const merged = { pullRequestsOnForge: new Map([[100, { title: 'feat(app): link mockups', state: 'merged' as const }]]) };
    expect(pullRequestOf(history, merged).readyNotice).toEqual({ status: 'none' });
    const announced = withEvents(history, { type: PIPELINE_EVENTS.pullRequestReadyAnnounced, payload: { pullRequestNumber: 100, headSha: headOf(history), links: [], failures: [] } });
    expect(pullRequestOf(announced, merged).readyNotice).toMatchObject({ status: 'sent', headSha: headOf(history) });
  });

  it('has none for a pull request that a new cycle works on', () => {
    const cycling = withEvents(projectHistory(), { type: 'issue.transitioned', payload: { from: 'pr-open', to: 'implementing', reason: 'external feedback' } });
    expect(pullRequestOf(cycling, GREEN).readyNotice).toEqual({ status: 'none' });
  });
});
