import type { IssueState } from '@agent-factory/domain';
import { MERGEABLE_STATES } from '../pipeline/mergeable-states.ts';
import { isFilmPending, type PipelineJournal } from '../pipeline/pipeline-journal.ts';
import type { PullRequestRef, Worktree } from '../ports.ts';
import { FilmRefusedError } from './film-errors.ts';

/** A pull request is filmed while it awaits its merge, and its declared films are announced as it opens. */
const FILMABLE_STATES: readonly IssueState[] = [...MERGEABLE_STATES, 'producing-evidence'];

export interface FilmSubject {
  readonly pullRequest: PullRequestRef;
  readonly worktree: Worktree;
}

/** The pull request and worktree a film records, or why the issue cannot be filmed. */
export function filmSubjectOf(journal: PipelineJournal): FilmSubject | string {
  if (journal.mergeSha !== null) return 'its pull request is already merged';
  if (journal.evidenceRemoval !== null) return 'its merge is being prepared and the evidence is removed';
  if (journal.state === null || !MERGEABLE_STATES.includes(journal.state)) return `it is ${journal.state ?? 'unknown to the factory'}, not awaiting a merge`;
  if (journal.pullRequest === null || journal.worktree === null) return 'it has no open pull request with a leased worktree';
  return { pullRequest: journal.pullRequest, worktree: journal.worktree };
}

export function awaitingMergeRefusal(journal: PipelineJournal): string | null {
  const subject = filmSubjectOf(journal);
  return typeof subject === 'string' ? subject : null;
}

export function requireFilmSubject(journal: PipelineJournal): FilmSubject {
  const subject = filmSubjectOf(journal);
  if (typeof subject === 'string') throw new FilmRefusedError(journal.issueNumber, subject);
  return subject;
}

export function isFilmable(journal: PipelineJournal): boolean {
  return journal.mergeSha === null && journal.state !== null && FILMABLE_STATES.includes(journal.state);
}

/** Whether the film orders of the issue can still be recorded: its pull request is open. */
export function isQueueable(journal: PipelineJournal): boolean {
  return journal.mergeSha === null && journal.pullRequest !== null;
}

export function hasFilmRecord(journal: PipelineJournal, scenario: string): boolean {
  return journal.filmOrders.some((order) => order.scenario === scenario) || journal.films.some((film) => film.scenario === scenario);
}

/** The scenarios the spec declares that nobody has ordered yet, for a pull request that can be filmed. */
export function unorderedDeclaredFilms(journal: PipelineJournal): readonly string[] {
  if (!isFilmable(journal) || journal.spec === null) return [];
  return journal.spec.films.filter((scenario) => !hasFilmRecord(journal, scenario));
}

/** The scenarios whose film is queued or recording, and the declared ones about to be ordered. */
export function pendingFilmScenarios(journal: PipelineJournal): readonly string[] {
  return [...journal.filmOrders.filter(isFilmPending).map((order) => order.scenario), ...unorderedDeclaredFilms(journal)];
}
