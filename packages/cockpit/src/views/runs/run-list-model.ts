import type { CockpitSnapshot, CostBasisView, ProjectView, RunView } from '../../contract/index.ts';
import { toEpoch } from '../../i18n/formatters.ts';
import { costBasisOfRun } from '../../model/cost-basis.ts';
import { isLiveRun } from '../../model/projects.ts';
import { paths, PROJECT_QUERY_PARAMETER } from '../../model/routes.ts';
import type { SubjectReference } from '../../model/subjects.ts';

/** How many finished runs the list shows before the operator asks for more. */
export const FINISHED_PAGE_SIZE = 50;

const TERM_SEPARATOR = /\s+/;

/** The project the list is filtered on: the requested one when the installation knows it, else none. */
export function resolveProjectFilter(projects: readonly Pick<ProjectView, 'id'>[], requested: string | null): string | null {
  return projects.some((project) => project.id === requested) ? requested : null;
}

export function searchTerms(query: string): readonly string[] {
  return query
    .trim()
    .toLowerCase()
    .split(TERM_SEPARATOR)
    .filter((term) => term.length > 0);
}

export function matchesTerms(text: string, terms: readonly string[]): boolean {
  const haystack = text.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export interface RunSearchFacts {
  /** The role in the active language. */
  readonly roleLabel: string;
  readonly subject: Pick<SubjectReference, 'reference' | 'title'>;
}

/** What the text filter looks at: the run, its role (by id and by name), its subject and its model. */
export function runSearchText(run: Pick<RunView, 'id' | 'role' | 'model'>, facts: RunSearchFacts): string {
  return [run.id, run.role, facts.roleLabel, run.model, facts.subject.reference, facts.subject.title].filter((part) => part !== null).join(' ');
}

export interface RunFilter {
  readonly project: string | null;
  readonly query: string;
}

export const NO_RUN_FILTER: RunFilter = { project: null, query: '' };

export function isFiltering(filter: RunFilter): boolean {
  return filter.project !== null || searchTerms(filter.query).length > 0;
}

export function filterRuns(runs: readonly RunView[], filter: RunFilter, searchTextOf: (run: RunView) => string): readonly RunView[] {
  const terms = searchTerms(filter.query);
  return runs.filter((run) => (filter.project === null || run.project === filter.project) && (terms.length === 0 || matchesTerms(searchTextOf(run), terms)));
}

export interface RunGroups {
  readonly live: readonly RunView[];
  readonly finished: readonly RunView[];
}

function byRecentStart(left: RunView, right: RunView): number {
  return toEpoch(right.startedAt) - toEpoch(left.startedAt);
}

/** Live runs first, each group with the most recently started run on top. */
export function groupRuns(runs: readonly RunView[]): RunGroups {
  return {
    live: runs.filter(isLiveRun).toSorted(byRecentStart),
    finished: runs.filter((run) => !isLiveRun(run)).toSorted(byRecentStart),
  };
}

export interface FinishedPage {
  readonly shown: readonly RunView[];
  readonly remaining: number;
}

/** The finished runs to list: whole pages of them, and always far enough to include the run being looked at. */
export function pageOfFinished(finished: readonly RunView[], pages: number, selectedId: string | null): FinishedPage {
  const selectedPosition = selectedId === null ? -1 : finished.findIndex((run) => run.id === selectedId);
  const count = Math.max(pages * FINISHED_PAGE_SIZE, selectedPosition + 1);
  return { shown: finished.slice(0, count), remaining: Math.max(0, finished.length - count) };
}

/** The address of a run, keeping the project the list is filtered on. */
export function runPath(runId: string, project: string | null): string {
  const path = paths.run(runId);
  return project === null ? path : `${path}?${new URLSearchParams({ [PROJECT_QUERY_PARAMETER]: project })}`;
}

/** What the dollar figures of these runs mean together: their common basis, or a mix when they differ. */
export function basisOfRuns(snapshot: Pick<CockpitSnapshot, 'usage' | 'costs'>, runs: readonly Pick<RunView, 'account'>[]): CostBasisView | null {
  const bases = [...new Set(runs.map((run) => costBasisOfRun(snapshot, run)))];
  const [only] = bases;
  if (only === undefined) return null;
  return bases.length === 1 ? only : 'mixed';
}
