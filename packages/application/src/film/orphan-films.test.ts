import { describe, expect, it } from 'vitest';
import { loadJournal } from '../pipeline/pipeline-journal.ts';
import { closeOrphanFilms, ORPHAN_FILM_REASON } from './orphan-films.ts';
import { FilmLog } from './testing/film-log.ts';

describe('closeOrphanFilms', () => {
  it('fails the films a stopped factory left recording and leaves the others as they are', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1);
    await log.queue('storefront', 1, 'recording');
    await log.start('storefront', 1, 'recording');
    await log.queue('storefront', 1, 'waiting');
    await log.openPullRequest('storefront', 2);
    await log.queue('storefront', 2, 'done');
    await log.start('storefront', 2, 'done');
    await log.finish('storefront', 2, 'done');

    const closed = await closeOrphanFilms(log.project('storefront'));

    expect(closed).toEqual([1]);
    const first = await loadJournal(log.project('storefront'), 1);
    expect(first.filmOrders.map((order) => [order.scenario, order.status, order.reason])).toEqual([
      ['recording', 'failed', ORPHAN_FILM_REASON],
      ['waiting', 'queued', null],
    ]);
    expect((await loadJournal(log.project('storefront'), 2)).filmOrders[0]?.status).toBe('finished');
  });

  it('says in the reason that the factory stopped before the film ended', () => {
    expect(ORPHAN_FILM_REASON).toBe('the factory stopped before the film ended');
  });

  it('keeps a film that waits in its place in the queue, behind the one it fails', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1);
    await log.queue('storefront', 1, 'recording');
    await log.start('storefront', 1, 'recording');
    await log.queue('storefront', 1, 'waiting');
    const before = (await loadJournal(log.project('storefront'), 1)).filmOrders.find((order) => order.scenario === 'waiting');

    await closeOrphanFilms(log.project('storefront'));

    const after = (await loadJournal(log.project('storefront'), 1)).filmOrders.find((order) => order.scenario === 'waiting');
    expect(after).toMatchObject({ status: 'queued', queuedSequence: before?.queuedSequence, queuedAt: before?.queuedAt });
  });

  it('closes only the films of the project it is given', async () => {
    const log = new FilmLog();
    await log.openPullRequest('ledger', 1);
    await log.queue('ledger', 1, 'month-end');
    await log.start('ledger', 1, 'month-end');

    expect(await closeOrphanFilms(log.project('storefront'))).toEqual([]);
    expect((await loadJournal(log.project('ledger'), 1)).filmOrders[0]?.status).toBe('running');
  });

  it('has nothing to close in a log without films', async () => {
    expect(await closeOrphanFilms(new FilmLog().project('storefront'))).toEqual([]);
  });
});
