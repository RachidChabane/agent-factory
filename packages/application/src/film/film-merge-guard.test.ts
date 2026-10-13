import { describe, expect, it } from 'vitest';
import { loadJournal } from '../pipeline/pipeline-journal.ts';
import { FilmLedger } from './film-ledger.ts';
import { FILMS_IN_PROGRESS_REASON, FilmMergeGuard } from './film-merge-guard.ts';
import { FILM_TOOLS_AVAILABLE_EVENT, FILM_TOOLS_SUBJECT, FILM_TOOLS_UNAVAILABLE_EVENT, LoggedFilmToolWait } from './film-tool-wait.ts';
import { FILM_PRESENTATION } from './testing/film-fakes.ts';
import { FilmLog } from './testing/film-log.ts';

const LISTED_TOOLS = ['vault'];

function guardOf(log: FilmLog, projectId: string, listedTools: readonly string[]): FilmMergeGuard {
  const ledger = new FilmLedger(log.logs('storefront', 'ledger'), log.clock, FILM_PRESENTATION.fallbackDurationMs);
  return new FilmMergeGuard(ledger, projectId, FILM_PRESENTATION, new LoggedFilmToolWait(log.project(projectId), listedTools));
}

async function blockerOf(log: FilmLog, projectId: string, issueNumber: number, listedTools: readonly string[] = LISTED_TOOLS): Promise<string | null> {
  return guardOf(log, projectId, listedTools).blockerOf(await loadJournal(log.project(projectId), issueNumber));
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

  describe('while the films of the project wait for a tool', () => {
    const UNAVAILABLE = { tool: 'vault', scope: 'installation', status: 'unauthenticated', detail: 'token expired', loginCommand: null, fixCommand: null };

    it('names the tool in place of an arrival that cannot be expected', async () => {
      const log = new FilmLog();
      await log.openPullRequest('storefront', 1);
      await log.queue('storefront', 1, 'checkout-flow');
      await log.project('storefront').append(FILM_TOOLS_UNAVAILABLE_EVENT, FILM_TOOLS_SUBJECT, UNAVAILABLE);
      expect(await blockerOf(log, 'storefront', 1)).toBe(`${FILMS_IN_PROGRESS_REASON}, waiting for the tool vault`);
    });

    it('names it for a declared film that is not ordered yet', async () => {
      const log = new FilmLog();
      await log.openPullRequest('storefront', 1, ['checkout-flow']);
      await log.project('storefront').append(FILM_TOOLS_UNAVAILABLE_EVENT, FILM_TOOLS_SUBJECT, UNAVAILABLE);
      expect(await blockerOf(log, 'storefront', 1)).toBe(`${FILMS_IN_PROGRESS_REASON}, waiting for the tool vault`);
    });

    it('holds nothing for a pull request none of whose films is pending', async () => {
      const log = new FilmLog();
      await log.openPullRequest('storefront', 1);
      await log.project('storefront').append(FILM_TOOLS_UNAVAILABLE_EVENT, FILM_TOOLS_SUBJECT, UNAVAILABLE);
      expect(await blockerOf(log, 'storefront', 1)).toBeNull();
    });

    it('does not name a tool the films of another project wait for', async () => {
      const log = new FilmLog();
      await log.openPullRequest('storefront', 1);
      await log.queue('storefront', 1, 'checkout-flow');
      await log.project('ledger').append(FILM_TOOLS_UNAVAILABLE_EVENT, FILM_TOOLS_SUBJECT, UNAVAILABLE);
      expect(await blockerOf(log, 'storefront', 1)).toContain('expected around');
    });

    it('expects an arrival when the films of the project do not list the tool it waited for', async () => {
      const log = new FilmLog();
      await log.openPullRequest('storefront', 1);
      await log.queue('storefront', 1, 'checkout-flow');
      await log.project('storefront').append(FILM_TOOLS_UNAVAILABLE_EVENT, FILM_TOOLS_SUBJECT, UNAVAILABLE);
      expect(await blockerOf(log, 'storefront', 1, ['registry'])).toContain('expected around');
    });

    it('expects an arrival again once the films wait for no tool', async () => {
      const log = new FilmLog();
      await log.openPullRequest('storefront', 1);
      await log.queue('storefront', 1, 'checkout-flow');
      await log.project('storefront').append(FILM_TOOLS_UNAVAILABLE_EVENT, FILM_TOOLS_SUBJECT, UNAVAILABLE);
      await log.project('storefront').append(FILM_TOOLS_AVAILABLE_EVENT, FILM_TOOLS_SUBJECT, {});
      expect(await blockerOf(log, 'storefront', 1)).toContain('expected around');
    });
  });
});
