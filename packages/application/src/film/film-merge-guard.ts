import type { PipelineJournal } from '../pipeline/pipeline-journal.ts';
import type { FilmForecast, FilmLedger } from './film-ledger.ts';
import { pendingFilmScenarios } from './film-pending.ts';
import type { FilmPresentation } from './film-settings.ts';
import type { FilmToolWait, FilmToolWaitReading } from './film-tool-wait.ts';
import { formatArrival } from './film-time.ts';

export const FILMS_IN_PROGRESS_REASON = 'films in progress';

/**
 * Why a pull request cannot be merged while its films are pending, with when they are expected, or the tool they wait for
 * when one fails its check, since no arrival can be expected then; null when none is.
 */
export function filmMergeBlocker(journal: PipelineJournal, forecast: FilmForecast, projectId: string, presentation: FilmPresentation, toolWait: FilmToolWait | null): string | null {
  const pending = pendingFilmScenarios(journal);
  if (pending.length === 0) return null;
  if (toolWait !== null) return `${FILMS_IN_PROGRESS_REASON}, waiting for the tool ${toolWait.tool}`;
  const latest = forecast.latestOf(projectId, journal.issueNumber, pending);
  if (latest === null) return FILMS_IN_PROGRESS_REASON;
  return `${FILMS_IN_PROGRESS_REASON}, expected around ${formatArrival(new Date(latest.arrivalAtMs), presentation.timeZone)}`;
}

/** Holds the merge of a pull request while a film of it is queued or recording. A failed film does not hold it. */
export class FilmMergeGuard {
  private readonly ledger: FilmLedger;
  private readonly projectId: string;
  private readonly presentation: FilmPresentation;
  private readonly toolWait: FilmToolWaitReading;

  constructor(ledger: FilmLedger, projectId: string, presentation: FilmPresentation, toolWait: FilmToolWaitReading) {
    this.ledger = ledger;
    this.projectId = projectId;
    this.presentation = presentation;
    this.toolWait = toolWait;
  }

  async blockerOf(journal: PipelineJournal): Promise<string | null> {
    return filmMergeBlocker(journal, await this.ledger.forecast(), this.projectId, this.presentation, await this.toolWait.current());
  }
}
