import { PENDING_FILM_STATES, type FilmOrderView, type FilmOrderState, type ProjectView, type PullRequestView } from '../../contract/index.ts';
import type { Formatters } from '../../i18n/formatters.ts';

const FAILED: FilmOrderState = 'failed';

export type PendingFilmState = 'queued' | 'recording-base' | 'recording-head' | 'committing';
/** A film the factory has yet to record. */
export type PendingFilmOrder = FilmOrderView & { readonly state: PendingFilmState };

export function isPendingFilm(order: FilmOrderView): order is PendingFilmOrder {
  return PENDING_FILM_STATES.includes(order.state);
}

/** The films the factory has yet to record, in the order they were ordered. */
export function pendingFilms(pullRequest: Pick<PullRequestView, 'filmOrders'>): readonly PendingFilmOrder[] {
  return pullRequest.filmOrders.filter(isPendingFilm);
}

/** The films that failed and were not recorded since, with the reason the factory gave. */
export function failedFilms(pullRequest: Pick<PullRequestView, 'filmOrders'>): readonly FilmOrderView[] {
  return pullRequest.filmOrders.filter((order) => order.state === FAILED);
}

/** Whether the film of a scenario was recorded, so that a failure of an earlier attempt is no news. */
export function isRecorded(pullRequest: Pick<PullRequestView, 'films'>, scenario: string): boolean {
  return pullRequest.films.some((film) => film.scenario === scenario);
}

/** The operator may order a film while the project films and the pull request is open. */
export function canOrderFilm(project: Pick<ProjectView, 'settings'>, pullRequest: Pick<PullRequestView, 'state'>): boolean {
  return project.settings.films !== null && pullRequest.state === 'open';
}

/** Whether the pull request has a place for films: the project films, or something about films is already to be told. */
export function hasFilmsToShow(project: Pick<ProjectView, 'settings'>, pullRequest: Pick<PullRequestView, 'films' | 'filmOrders'>): boolean {
  return project.settings.films !== null || pullRequest.films.length > 0 || pullRequest.filmOrders.length > 0;
}

/** The zone the project's films are told in; null once the project no longer films. */
export function filmTimeZone(project: Pick<ProjectView, 'settings'>): string | null {
  return project.settings.films?.timeZone ?? null;
}

/** When a film is expected, in the zone the merge guard and the pull request body use, or in the reader's own zone without one. */
export function expectedArrival(fmt: Pick<Formatters, 'dateTime' | 'dateTimeIn'>, expectedAt: string, timeZone: string | null): string {
  return timeZone === null ? fmt.dateTime(expectedAt) : fmt.dateTimeIn(expectedAt, timeZone);
}
