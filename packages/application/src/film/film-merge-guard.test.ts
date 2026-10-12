import { describe, expect, it } from 'vitest';
import { loadJournal } from '../pipeline/pipeline-journal.ts';
import { FilmLedger } from './film-ledger.ts';
import { FILMS_IN_PROGRESS_REASON, FilmMergeGuard } from './film-merge-guard.ts';
import { FILM_PRESENTATION } from './testing/film-fakes.ts';
import { FilmLog } from './testing/film-log.ts';

function guardOf(log: FilmLog, projectId: string): FilmMergeGuard {
  const ledger = new FilmLedger(log.logs('storefront', 'ledger'), log.clock, FILM_PRESENTATION.fallbackDurationMs);
  return new FilmMergeGuard(ledger, projectId, FILM_PRESENTATION);
}

async function blockerOf(log: FilmLog, projectId: string, issueNumber: number): Promise<string | null> {
  return guardOf(log, projectId).blockerOf(await loadJournal(log.project(projectId), issueNumber));
}

describe('FilmMergeGuard', () => {
  it('holds nothing while no film of the pull request is pending', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1);
    expect(await blockerOf(log, 'storefront', 1)).toBeNull();
  });

  it('holds the merge of a queued film, with when it is expected, in the zone of the project', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1);
    await log.queue('storefront', 1, 'checkout-flow');
    expect(await blockerOf(log, 'storefront', 1)).toBe(`${FILMS_IN_PROGRESS_REASON}, expected around 12:20 on 2026-10-12 (UTC)`);
  });

  it('holds the merge of a declared film that is not ordered yet', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1, ['checkout-flow']);
    expect(await blockerOf(log, 'storefront', 1)).toContain(FILMS_IN_PROGRESS_REASON);
  });

  it('counts the films of other projects ahead in the expected arrival', async () => {
    const log = new FilmLog();
    await log.openPullRequest('ledger', 2);
    await log.queue('ledger', 2, 'month-end');
    await log.openPullRequest('storefront', 1);
    await log.queue('storefront', 1, 'checkout-flow');
    expect(await blockerOf(log, 'storefront', 1)).toContain('expected around 12:40 on 2026-10-12 (UTC)');
  });

  it('expects the last of the pull request films', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1);
    await log.queue('storefront', 1, 'first');
    await log.queue('storefront', 1, 'second');
    expect(await blockerOf(log, 'storefront', 1)).toContain('12:40');
  });

  it('does not hold the merge for a recorded film or a failed one', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1, ['a', 'b']);
    await log.queue('storefront', 1, 'a');
    await log.start('storefront', 1, 'a');
    await log.finish('storefront', 1, 'a');
    await log.queue('storefront', 1, 'b');
    await log.fail('storefront', 1, 'b');
    expect(await blockerOf(log, 'storefront', 1)).toBeNull();
  });

  it('holds the merge while the film records', async () => {
    const log = new FilmLog();
    await log.openPullRequest('storefront', 1);
    await log.queue('storefront', 1, 'a');
    await log.start('storefront', 1, 'a');
    await log.stage('storefront', 1, 'a', 'committing');
    expect(await blockerOf(log, 'storefront', 1)).toContain(FILMS_IN_PROGRESS_REASON);
  });
});
