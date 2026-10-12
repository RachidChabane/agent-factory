import { describe, expect, it } from 'vitest';
import { issueSubject } from '@agent-factory/domain';
import { PIPELINE_EVENTS } from './journal-events.ts';
import { loadJournal } from './pipeline-journal.ts';
import { FilmLog } from '../film/testing/film-log.ts';

const ISSUE = 3;

describe('the film orders of the journal', () => {
  it('follow a film from the queue through its stages to its end', async () => {
    const log = new FilmLog();
    const events = log.project('storefront');
    await log.openPullRequest('storefront', ISSUE);
    await log.queue('storefront', ISSUE, 'checkout-flow');
    const queued = (await loadJournal(events, ISSUE)).filmOrders[0];
    expect(queued).toMatchObject({ scenario: 'checkout-flow', operator: 'operator', status: 'queued', stage: null, startedAt: null, reason: null });

    log.advance(2);
    await log.start('storefront', ISSUE, 'checkout-flow', 'Alex Morgan');
    const running = (await loadJournal(events, ISSUE)).filmOrders[0];
    expect(running).toMatchObject({ operator: 'Alex Morgan', status: 'running', stage: 'recording-base', queuedSequence: queued?.queuedSequence });
    expect(running?.startedAt).toBe('2026-10-12T12:02:00.000Z');

    await log.stage('storefront', ISSUE, 'checkout-flow', 'recording-head');
    expect((await loadJournal(events, ISSUE)).filmOrders[0]?.stage).toBe('recording-head');

    await log.finish('storefront', ISSUE, 'checkout-flow');
    const journal = await loadJournal(events, ISSUE);
    expect(journal.filmOrders[0]).toMatchObject({ status: 'finished', stage: null });
    expect(journal.films.map((film) => film.scenario)).toEqual(['checkout-flow']);
  });

  it('keep the reason a film failed with, and queue it again when it is ordered again', async () => {
    const log = new FilmLog();
    const events = log.project('storefront');
    await log.openPullRequest('storefront', ISSUE);
    await log.queue('storefront', ISSUE, 'checkout-flow');
    await log.fail('storefront', ISSUE, 'checkout-flow', 'the session expired');
    expect((await loadJournal(events, ISSUE)).filmOrders[0]).toMatchObject({ status: 'failed', reason: 'the session expired' });

    await log.queue('storefront', ISSUE, 'checkout-flow');
    const again = (await loadJournal(events, ISSUE)).filmOrders;
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ status: 'queued', reason: null });
  });

  it('move the heads of the branch with the film commits', async () => {
    const log = new FilmLog();
    const events = log.project('storefront');
    await log.openPullRequest('storefront', ISSUE);
    await events.append(PIPELINE_EVENTS.filmCommitted, issueSubject(ISSUE), { scenario: 'checkout-flow', sha: 'films001' });
    await events.append(PIPELINE_EVENTS.filmPushed, issueSubject(ISSUE), { headSha: 'films001' });
    const journal = await loadJournal(events, ISSUE);
    expect(journal.lastCommitSha).toBe('films001');
    expect(journal.pushedHead).toBe('films001');
  });

  it('keep the recorded film of a scenario once, the latest', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', ISSUE);
    await log.finish('storefront', ISSUE, 'checkout-flow');
    await log.finish('storefront', ISSUE, 'checkout-flow');
    expect((await loadJournal(log.project('storefront'), ISSUE)).films).toHaveLength(1);
  });
});
