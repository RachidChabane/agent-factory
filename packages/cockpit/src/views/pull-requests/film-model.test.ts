import { describe, expect, it } from 'vitest';
import type { FilmOrderView, FilmView, ProjectView, PullRequestView } from '../../contract/index.ts';
import { createFormatters } from '../../i18n/formatters.ts';
import { canOrderFilm, expectedArrival, failedFilms, filmTimeZone, hasFilmsToShow, isPendingFilm, isRecorded, pendingFilms } from './film-model.ts';

const MOMENT = '2026-10-12T10:00:00.000Z';

function order(scenario: string, state: FilmOrderView['state'], reason: string | null = null): FilmOrderView {
  return { scenario, operator: 'Alex Morgan', state, expectedAt: null, filmsAhead: 0, reason, since: MOMENT };
}

function film(scenario: string): FilmView {
  const phase = { sha: 'a'.repeat(40), videoUrl: '/video.mp4', screenshotUrls: [], facts: [] };
  return { scenario, recordedAt: MOMENT, before: phase, after: phase };
}

function projectFilming(films: ProjectView['settings']['films']): Pick<ProjectView, 'settings'> {
  return { settings: { films } as ProjectView['settings'] };
}

const FILMING = projectFilming({ timeZone: 'UTC', timeoutMinutes: 20, tools: [] });
const NOT_FILMING = projectFilming(null);

describe('the films of a pull request', () => {
  const orders = [order('a', 'queued'), order('b', 'recording-base'), order('c', 'recording-head'), order('d', 'committing'), order('e', 'finished'), order('f', 'failed', 'the session expired')];

  it('tell the films that wait or record from the ones that ended', () => {
    expect(orders.filter(isPendingFilm).map((entry) => entry.scenario)).toEqual(['a', 'b', 'c', 'd']);
    expect(pendingFilms({ filmOrders: orders }).map((entry) => entry.scenario)).toEqual(['a', 'b', 'c', 'd']);
    expect(failedFilms({ filmOrders: orders }).map((entry) => entry.scenario)).toEqual(['f']);
  });

  it('know which scenarios are recorded', () => {
    expect(isRecorded({ films: [film('checkout-flow')] }, 'checkout-flow')).toBe(true);
    expect(isRecorded({ films: [film('checkout-flow')] }, 'other')).toBe(false);
  });

  it('can be ordered while the project films and the pull request is open', () => {
    const open: Pick<PullRequestView, 'state'> = { state: 'open' };
    expect(canOrderFilm(FILMING, open)).toBe(true);
    expect(canOrderFilm(FILMING, { state: 'merged' })).toBe(false);
    expect(canOrderFilm(FILMING, { state: 'closed' })).toBe(false);
    expect(canOrderFilm(NOT_FILMING, open)).toBe(false);
  });

  it('have a place on the page when the project films or something about them is to be told', () => {
    expect(hasFilmsToShow(FILMING, { films: [], filmOrders: [] })).toBe(true);
    expect(hasFilmsToShow(NOT_FILMING, { films: [], filmOrders: [] })).toBe(false);
    expect(hasFilmsToShow(NOT_FILMING, { films: [film('a')], filmOrders: [] })).toBe(true);
    expect(hasFilmsToShow(NOT_FILMING, { films: [], filmOrders: [order('a', 'queued')] })).toBe(true);
  });
});

describe('the time a film is expected', () => {
  const reader = createFormatters('en', { justNow: 'just now' }, 'America/Los_Angeles');
  const INSTANT = '2026-10-12T21:11:00.000Z';
  const clock = (text: string) => text.replace(/\s/g, ' ');

  it('is told in the zone of the project, whatever zone the reader is in', () => {
    expect(filmTimeZone(projectFilming({ timeZone: 'Europe/Paris', timeoutMinutes: 20, tools: [] }))).toBe('Europe/Paris');
    expect(clock(expectedArrival(reader, INSTANT, 'Europe/Paris'))).toBe('Oct 12, 2026, 11:11 PM (Europe/Paris)');
  });

  it('is told in the zone of the reader once the project no longer films', () => {
    expect(filmTimeZone(NOT_FILMING)).toBeNull();
    expect(clock(expectedArrival(reader, INSTANT, null))).toBe('Oct 12, 2026, 2:11 PM');
  });
});
