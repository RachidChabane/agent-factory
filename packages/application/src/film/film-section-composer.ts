import { isFilmPending, type FilmOrderState, type PipelineJournal } from '../pipeline/pipeline-journal.ts';
import type { ForgeFileLinks } from '../pipeline/pipeline-settings.ts';
import type { FilmForecast } from './film-ledger.ts';
import { unorderedDeclaredFilms } from './film-pending.ts';
import { renderFilmFailure, renderFilmPlaceholder } from './film-placeholder.ts';
import { renderFilmSection, renderFinishedFilm } from './film-section.ts';
import type { FilmPresentation } from './film-settings.ts';

export interface FilmSectionContext {
  readonly projectId: string;
  readonly fileLinks: ForgeFileLinks;
  readonly presentation: FilmPresentation;
  readonly forecast: FilmForecast;
}

/** Every scenario the pull request shows: the declared ones, then the ordered ones, then the recorded ones. */
function scenariosOf(journal: PipelineJournal): readonly string[] {
  const declared = journal.spec?.films ?? [];
  const ordered = journal.filmOrders.toSorted((left, right) => left.queuedSequence - right.queuedSequence).map((order) => order.scenario);
  const filmed = journal.films.map((film) => film.scenario);
  return [...new Set([...declared, ...ordered, ...filmed])];
}

function blockOf(journal: PipelineJournal, scenario: string, context: FilmSectionContext): string | null {
  const order: FilmOrderState | undefined = journal.filmOrders.find((candidate) => candidate.scenario === scenario);
  const placeholder = (stage: FilmOrderState['stage']): string =>
    renderFilmPlaceholder({
      scenario,
      pullRequestNumber: journal.pullRequest?.number ?? null,
      stage,
      forecast: context.forecast.of(context.projectId, journal.issueNumber, scenario),
      presentation: context.presentation,
    });
  if (order !== undefined && isFilmPending(order)) return placeholder(order.stage);
  if (order?.status === 'failed') return renderFilmFailure(context.projectId, journal.issueNumber, order);
  const finished = journal.films.find((film) => film.scenario === scenario);
  if (finished !== undefined) return renderFinishedFilm(context.fileLinks, finished);
  return unorderedDeclaredFilms(journal).includes(scenario) ? placeholder(null) : null;
}

/** The `Behaviour on video` section of a pull request body, or null when no scenario concerns it. */
export function composeFilmSection(journal: PipelineJournal, context: FilmSectionContext): string | null {
  const blocks = scenariosOf(journal).flatMap((scenario) => blockOf(journal, scenario, context) ?? []);
  return blocks.length === 0 ? null : renderFilmSection(blocks);
}
