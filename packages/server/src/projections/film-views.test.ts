import { describe, expect, it } from 'vitest';
import { PullRequestViewSchema } from '@agent-factory/cockpit';
import { FilmLedger, PIPELINE_EVENTS, type EventStore, type FactoryEventRecord, type FilmPresentation } from '@agent-factory/application';
import { indexEvents } from './event-index.ts';
import { issueJournals } from './issue-views.ts';
import { projectPullRequests } from './pull-request-views.ts';
import { GENERATED_AT, PROJECT_ID, projectContext, projectHistory, type ProjectHistory } from './testing/project-history.ts';

const MINUTE_MS = 60_000;
const ISSUE_SUBJECT = 'issue/42';
/** The forecast is made from records already read, so the ledger never reads this log. */
const UNUSED_LOG: EventStore = {
  append: () => Promise.reject(new Error('not used')),
  read: () => Promise.resolve([]),
  subscribe: () => () => undefined,
};
const PRESENTATION: FilmPresentation = { fallbackDurationMs: 20 * MINUTE_MS, timeZone: 'UTC', cockpitUrl: null };
const BASE_SHA = 'base0000';
const HEAD_SHA = 'head0000';
const FILM_COMMIT = 'films000';

function phase(name: string, scenario: string, facts: readonly { label: string; value: string }[] = []) {
  return {
    video: `.evidence/42/films/${scenario}/${name}.mp4`,
    report: `.evidence/42/films/${scenario}/${name}-report.json`,
    screenshots: [`.evidence/42/films/${scenario}/${name}.svg`],
    facts,
    storeVideo: `films/${scenario}/${name}/film.mp4`,
    storeScreenshots: [`films/${scenario}/${name}/final.svg`],
  };
}

type FilmEvent = Pick<FactoryEventRecord, 'type' | 'payload'> & { readonly minutesAfterStart: number };

function queued(scenario: string, minutes = 0): FilmEvent {
  return { type: PIPELINE_EVENTS.filmQueued, payload: { scenario, operator: 'Alex Morgan' }, minutesAfterStart: minutes };
}

function started(scenario: string, minutes = 0): FilmEvent {
  return { type: PIPELINE_EVENTS.filmStarted, payload: { scenario, operator: 'Alex Morgan', baseSha: BASE_SHA, headSha: HEAD_SHA }, minutesAfterStart: minutes };
}

function stage(scenario: string, name: string, minutes: number): FilmEvent {
  return { type: PIPELINE_EVENTS.filmStageEntered, payload: { scenario, stage: name }, minutesAfterStart: minutes };
}

function finished(scenario: string, minutes: number): FilmEvent {
  const facts = [{ label: 'Items in the cart', value: '2' }];
  return {
    type: PIPELINE_EVENTS.filmFinished,
    payload: { scenario, baseSha: BASE_SHA, headSha: HEAD_SHA, commitSha: FILM_COMMIT, before: phase('before', scenario), after: phase('after', scenario, facts) },
    minutesAfterStart: minutes,
  };
}

function failed(scenario: string, reason: string, minutes: number): FilmEvent {
  return { type: PIPELINE_EVENTS.filmFailed, payload: { scenario, reason }, minutesAfterStart: minutes };
}

function withFilms(history: ProjectHistory, ...events: readonly FilmEvent[]): ProjectHistory {
  const last = Math.max(...[...history.project, ...history.installation].map((record) => record.sequence));
  const extra = events.map((event, position): FactoryEventRecord => ({
    sequence: last + position + 1,
    occurredAt: new Date(GENERATED_AT.getTime() + event.minutesAfterStart * MINUTE_MS - MINUTE_MS * 10),
    type: event.type,
    subject: ISSUE_SUBJECT,
    payload: event.payload,
  }));
  return { ...history, project: [...history.project, ...extra] };
}

function pullRequestOf(history: ProjectHistory, others: ReadonlyMap<string, readonly FactoryEventRecord[]> = new Map()) {
  const ledger = FilmLedger.ofInstallation(UNUSED_LOG, [PROJECT_ID, ...others.keys()], { now: () => GENERATED_AT }, PRESENTATION.fallbackDurationMs);
  const forecast = ledger.forecastFrom(new Map([[PROJECT_ID, history.project], ...others]));
  const context = projectContext(history, { films: { forecast, presentation: PRESENTATION } });
  const index = indexEvents(history.project);
  const [pullRequest] = projectPullRequests(issueJournals(index), index, context);
  if (pullRequest === undefined) throw new Error('the history has no pull request');
  return pullRequest;
}

describe('the films of a pull request in the cockpit', () => {
  it('show no film and hold no merge for a project that films nothing', () => {
    const history = withFilms(projectHistory(), queued('checkout-flow'));
    const index = indexEvents(history.project);
    const [pullRequest] = projectPullRequests(issueJournals(index), index, projectContext(history));
    expect(pullRequest).toMatchObject({ films: [], filmOrders: [], mergeable: true, mergeBlockers: [] });
  });

  it('show a queued scenario with its expected arrival, and hold the merge for it', () => {
    const pullRequest = pullRequestOf(withFilms(projectHistory(), queued('checkout-flow', -5)));

    expect(PullRequestViewSchema.safeParse(pullRequest).error?.issues ?? []).toEqual([]);
    expect(pullRequest.filmOrders).toEqual([
      {
        scenario: 'checkout-flow',
        operator: 'Alex Morgan',
        state: 'queued',
        expectedAt: new Date(GENERATED_AT.getTime() + 20 * MINUTE_MS).toISOString(),
        filmsAhead: 0,
        reason: null,
        since: new Date(GENERATED_AT.getTime() - 15 * MINUTE_MS).toISOString(),
      },
    ]);
    expect(pullRequest.mergeable).toBe(false);
    expect(pullRequest.mergeBlockers).toEqual(['films in progress, expected around 12:20 on 2026-10-09 (UTC)']);
  });

  it('show the stage of a scenario that records, counted from its start', () => {
    const pullRequest = pullRequestOf(withFilms(projectHistory(), queued('checkout-flow', -5), started('checkout-flow', -5), stage('checkout-flow', 'recording-head', -2)));
    expect(pullRequest.filmOrders[0]).toMatchObject({
      state: 'recording-head',
      filmsAhead: 0,
      expectedAt: new Date(GENERATED_AT.getTime() - 15 * MINUTE_MS + 20 * MINUTE_MS).toISOString(),
    });
  });

  it('put the recordings of a finished scenario on the evidence links, and let the merge go on', () => {
    const pullRequest = pullRequestOf(withFilms(projectHistory(), queued('checkout-flow', -9), started('checkout-flow', -9), finished('checkout-flow', -1)));

    expect(pullRequest.films).toEqual([
      {
        scenario: 'checkout-flow',
        recordedAt: new Date(GENERATED_AT.getTime() - 11 * MINUTE_MS).toISOString(),
        before: {
          sha: BASE_SHA,
          videoUrl: '/api/projects/widgets/evidence/42/films/checkout-flow/before/film.mp4',
          screenshotUrls: ['/api/projects/widgets/evidence/42/films/checkout-flow/before/final.svg'],
          facts: [],
        },
        after: {
          sha: HEAD_SHA,
          videoUrl: '/api/projects/widgets/evidence/42/films/checkout-flow/after/film.mp4',
          screenshotUrls: ['/api/projects/widgets/evidence/42/films/checkout-flow/after/final.svg'],
          facts: [{ label: 'Items in the cart', value: '2' }],
        },
      },
    ]);
    expect(pullRequest.filmOrders[0]).toMatchObject({ state: 'finished', expectedAt: null, filmsAhead: 0 });
    expect(pullRequest.mergeBlockers).toEqual([]);
  });

  it('show the reason a scenario failed, without holding the merge', () => {
    const pullRequest = pullRequestOf(withFilms(projectHistory(), queued('checkout-flow', -9), started('checkout-flow', -9), failed('checkout-flow', 'the session expired', -3)));
    expect(pullRequest.filmOrders[0]).toMatchObject({ state: 'failed', reason: 'the session expired', expectedAt: null });
    expect(pullRequest.films).toEqual([]);
    expect(pullRequest.mergeBlockers).toEqual([]);
  });

  it('show a scenario the spec declares as queued by the factory before anyone ordered it', () => {
    const history = projectHistory();
    const declared = {
      ...history,
      project: history.project.map((record) =>
        record.type === PIPELINE_EVENTS.specCaptured && record.subject === ISSUE_SUBJECT ? { ...record, payload: { ...(record.payload as object), spec: { ...(record.payload as { spec: object }).spec, films: ['checkout-flow'] } } } : record,
      ),
    };
    const pullRequest = pullRequestOf(declared);
    expect(pullRequest.filmOrders).toEqual([expect.objectContaining({ scenario: 'checkout-flow', operator: 'factory', state: 'queued', filmsAhead: 0 })]);
    expect(pullRequest.mergeBlockers).toEqual([expect.stringContaining('films in progress')]);
  });

  it('count the films of another project ahead in the one queue of the installation', () => {
    const other: FactoryEventRecord[] = [
      { sequence: 1, occurredAt: new Date(GENERATED_AT.getTime() - 30 * MINUTE_MS), type: 'issue.transitioned', subject: 'issue/7', payload: { from: null, to: 'pr-open', reason: 'test' } },
      {
        sequence: 2,
        occurredAt: new Date(GENERATED_AT.getTime() - 30 * MINUTE_MS),
        type: PIPELINE_EVENTS.pullRequestOpened,
        subject: 'issue/7',
        payload: { number: 70, url: 'https://forge.example.test/pull/70', headSha: 'head7' },
      },
      { sequence: 3, occurredAt: new Date(GENERATED_AT.getTime() - 30 * MINUTE_MS), type: PIPELINE_EVENTS.filmQueued, subject: 'issue/7', payload: { scenario: 'month-end', operator: 'Alex Morgan' } },
    ];
    const history = withFilms(projectHistory(), queued('checkout-flow', -5));
    const queuedAfter = { ...history, project: history.project.map((record) => (record.type === PIPELINE_EVENTS.filmQueued ? { ...record, sequence: 5000 } : record)) };

    const pullRequest = pullRequestOf(queuedAfter, new Map([['ledger', other]]));

    expect(pullRequest.filmOrders[0]).toMatchObject({ filmsAhead: 1, expectedAt: new Date(GENERATED_AT.getTime() + 40 * MINUTE_MS).toISOString() });
    expect(pullRequest.mergeBlockers).toEqual(['films in progress, expected around 12:40 on 2026-10-09 (UTC)']);
  });
});
