import type { FilmOrderView, FilmView } from '@agent-factory/cockpit';
import { FACTORY_FILM_OPERATOR, filmMergeBlocker, isFilmPending, unorderedDeclaredFilms, PIPELINE_EVENTS, FilmFinishedSchema, type FactoryEventRecord, type FilmForecast, type FilmOrderState, type FilmPhaseRecord, type FilmPresentation, type PipelineJournal } from '@agent-factory/application';
import { iso } from './event-index.ts';
import type { ProjectSnapshotContext } from './snapshot-context.ts';

/** What the projections need to tell the films of a project: the queue of the installation and how the project presents it. */
export interface ProjectFilmContext {
  readonly forecast: FilmForecast;
  readonly presentation: FilmPresentation;
}

function phaseView(journal: PipelineJournal, sha: string, phase: FilmPhaseRecord, context: ProjectSnapshotContext): FilmView['before'] {
  const url = (path: string): string => context.links.evidence(journal.issueNumber, path);
  return { sha, videoUrl: url(phase.storeVideo), screenshotUrls: phase.storeScreenshots.map(url), facts: phase.facts.map((fact) => ({ ...fact })) };
}

function recordedAt(records: readonly FactoryEventRecord[], scenario: string, fallback: Date): string {
  const finished = records.findLast((record) => record.type === PIPELINE_EVENTS.filmFinished && FilmFinishedSchema.safeParse(record.payload).data?.scenario === scenario);
  return iso(finished?.occurredAt ?? fallback);
}

/** The scenarios recorded on the pull request, each with its two recordings, ready for the cockpit to play. */
export function filmViews(journal: PipelineJournal, records: readonly FactoryEventRecord[], context: ProjectSnapshotContext): FilmView[] {
  return journal.films.map((film) => ({
    scenario: film.scenario,
    recordedAt: recordedAt(records, film.scenario, context.generatedAt),
    before: phaseView(journal, film.baseSha, film.before, context),
    after: phaseView(journal, film.headSha, film.after, context),
  }));
}

function orderView(order: FilmOrderState, journal: PipelineJournal, films: ProjectFilmContext, context: ProjectSnapshotContext): FilmOrderView {
  const pending = isFilmPending(order);
  const forecast = pending ? films.forecast.of(context.project, journal.issueNumber, order.scenario) : null;
  return {
    scenario: order.scenario,
    operator: order.operator,
    state: order.status === 'running' ? (order.stage ?? 'recording-base') : order.status,
    expectedAt: forecast === null ? null : iso(new Date(forecast.arrivalAtMs)),
    filmsAhead: forecast?.filmsAhead ?? 0,
    reason: order.reason,
    since: iso(new Date(order.status === 'running' ? (order.startedAt ?? order.queuedAt) : order.status === 'queued' ? order.queuedAt : order.updatedAt)),
  };
}

/** A scenario the spec declares that the factory is about to order stands in the queue like an ordered one. */
function declaredView(scenario: string, journal: PipelineJournal, films: ProjectFilmContext, context: ProjectSnapshotContext): FilmOrderView {
  const forecast = films.forecast.of(context.project, journal.issueNumber, scenario);
  return {
    scenario,
    operator: FACTORY_FILM_OPERATOR,
    state: 'queued',
    expectedAt: forecast === null ? null : iso(new Date(forecast.arrivalAtMs)),
    filmsAhead: forecast?.filmsAhead ?? 0,
    reason: null,
    since: iso(context.generatedAt),
  };
}

/** Every scenario ordered for the pull request, in the order they were queued, with where each stands. */
export function filmOrderViews(journal: PipelineJournal, context: ProjectSnapshotContext): FilmOrderView[] {
  const films = context.films;
  if (films === null) return [];
  const ordered = journal.filmOrders.toSorted((left, right) => left.queuedSequence - right.queuedSequence).map((order) => orderView(order, journal, films, context));
  return [...ordered, ...unorderedDeclaredFilms(journal).map((scenario) => declaredView(scenario, journal, films, context))];
}

/** Why the merge waits for the films of the pull request, or null when it does not. */
export function filmMergeReason(journal: PipelineJournal, context: ProjectSnapshotContext): string | null {
  const films = context.films;
  return films === null ? null : filmMergeBlocker(journal, films.forecast, context.project, films.presentation);
}
