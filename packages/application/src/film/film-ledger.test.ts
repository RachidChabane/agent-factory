import { describe, expect, it } from 'vitest';
import { FilmLedger, filmDurations } from './film-ledger.ts';
import { FILM_PRESENTATION, MINUTE_MS } from './testing/film-fakes.ts';
import { FilmLog, LOG_START } from './testing/film-log.ts';

const FALLBACK_MS = FILM_PRESENTATION.fallbackDurationMs;

function ledgerOf(log: FilmLog, ...projects: readonly string[]): FilmLedger {
  return new FilmLedger(log.logs(...projects), log.clock, FALLBACK_MS);
}

describe('film ledger forecast', () => {
  it('queues the films of every project in the order the log queued them', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1);
    await log.openPullRequest('ledger', 2);
    await log.queue('ledger', 2, 'month-end');
    await log.queue('storefront', 1, 'checkout-flow');

    const forecast = await ledgerOf(log, 'storefront', 'ledger').forecast();

    expect(forecast.of('ledger', 2, 'month-end')).toEqual({ arrivalAtMs: LOG_START.getTime() + FALLBACK_MS, filmsAhead: 0 });
    expect(forecast.of('storefront', 1, 'checkout-flow')).toEqual({ arrivalAtMs: LOG_START.getTime() + 2 * FALLBACK_MS, filmsAhead: 1 });
  });

  it('counts the running film of another project from its start', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1);
    await log.openPullRequest('ledger', 2);
    await log.queue('ledger', 2, 'month-end');
    await log.start('ledger', 2, 'month-end');
    await log.queue('storefront', 1, 'checkout-flow');
    log.advance(5);

    const forecast = await ledgerOf(log, 'storefront', 'ledger').forecast();

    expect(forecast.of('ledger', 2, 'month-end')).toEqual({ arrivalAtMs: LOG_START.getTime() + FALLBACK_MS, filmsAhead: 0 });
    expect(forecast.of('storefront', 1, 'checkout-flow')).toEqual({ arrivalAtMs: LOG_START.getTime() + 2 * FALLBACK_MS, filmsAhead: 1 });
  });

  it('takes the typical duration from the latest successful films of all projects, a failed film leaving none', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1);
    await log.openPullRequest('ledger', 2);
    for (const [project, issue, minutes] of [['storefront', 1, 10], ['ledger', 2, 30], ['storefront', 1, 20]] as const) {
      const scenario = `film-${minutes}`;
      await log.queue(project, issue, scenario);
      await log.start(project, issue, scenario);
      log.advance(minutes);
      await log.finish(project, issue, scenario);
    }
    await log.queue('ledger', 2, 'broken');
    await log.start('ledger', 2, 'broken');
    log.advance(90);
    await log.fail('ledger', 2, 'broken');
    await log.queue('storefront', 1, 'next');

    const forecast = await ledgerOf(log, 'storefront', 'ledger').forecast();

    expect(forecast.typicalDurationMs).toBe(20 * MINUTE_MS);
    expect(forecast.of('storefront', 1, 'next')?.arrivalAtMs).toBe(log.clock.now().getTime() + 20 * MINUTE_MS);
  });

  it('forecasts the declared films nobody ordered yet after the queue, by project and issue', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 8, ['cart-badge']);
    await log.openPullRequest('ledger', 3, ['month-end']);
    await log.openPullRequest('storefront', 4, ['checkout-flow']);
    await log.openPullRequest('ledger', 5);
    await log.queue('ledger', 5, 'manual');

    const forecast = await ledgerOf(log, 'storefront', 'ledger').forecast();

    expect(forecast.of('ledger', 5, 'manual')?.filmsAhead).toBe(0);
    expect(forecast.of('storefront', 4, 'checkout-flow')?.filmsAhead).toBe(1);
    expect(forecast.of('storefront', 8, 'cart-badge')?.filmsAhead).toBe(2);
    expect(forecast.of('ledger', 3, 'month-end')?.filmsAhead).toBe(3);
  });

  it('forecasts nothing for a film already ordered, recorded or failed', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1, ['a', 'b', 'c']);
    await log.queue('storefront', 1, 'a');
    await log.start('storefront', 1, 'a');
    await log.finish('storefront', 1, 'a');
    await log.queue('storefront', 1, 'b');
    await log.fail('storefront', 1, 'b');

    const forecast = await ledgerOf(log, 'storefront').forecast();

    expect(forecast.of('storefront', 1, 'a')).toBeNull();
    expect(forecast.of('storefront', 1, 'b')).toBeNull();
    expect(forecast.of('storefront', 1, 'c')?.filmsAhead).toBe(0);
  });

  it('gives the arrival of the last of a pull request films', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1);
    await log.queue('storefront', 1, 'a');
    await log.queue('storefront', 1, 'b');

    const forecast = await ledgerOf(log, 'storefront').forecast();

    expect(forecast.latestOf('storefront', 1, ['a', 'b'])?.arrivalAtMs).toBe(LOG_START.getTime() + 2 * FALLBACK_MS);
    expect(forecast.latestOf('storefront', 1, ['other'])).toBeNull();
  });

  it('ignores the films of a project it was not given', async () => {
    const log = new FilmLog();
    await log.openPullRequest('docs', 1);
    await log.queue('docs', 1, 'a');
    await log.openPullRequest('storefront', 2);
    await log.queue('storefront', 2, 'b');

    const forecast = await ledgerOf(log, 'storefront').forecast();

    expect(forecast.of('storefront', 2, 'b')?.filmsAhead).toBe(0);
    expect(forecast.of('docs', 1, 'a')).toBeNull();
  });
});

describe('film durations', () => {
  it('measures a film from its start to its end, once, and forgets a film that failed', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1);
    await log.queue('storefront', 1, 'a');
    await log.start('storefront', 1, 'a');
    log.advance(7);
    await log.finish('storefront', 1, 'a');
    await log.start('storefront', 1, 'b');
    log.advance(3);
    await log.fail('storefront', 1, 'b');
    await log.finish('storefront', 1, 'b');

    const [state] = await ledgerOf(log, 'storefront').read();

    expect(filmDurations(state?.records ?? []).map((duration) => duration.durationMs)).toEqual([7 * MINUTE_MS]);
  });
});
