import type { IssueState } from '@agent-factory/domain';
import { ACTIVE_PIPELINE_STATES, findDependencyCycles, ISSUE_ABANDONED_STATE, ISSUE_ESCALATION_STATE, MERGED_OR_BEYOND_STATES, STARTABLE_STATE } from '@agent-factory/domain';
import type { AcceptanceCheck, Attempt, CockpitSnapshot, IssueView, ProjectView } from '../../contract/index.ts';
import type { StatusMark } from '../../model/status.ts';
import type { BadgeTone } from '../../ui/components/Badge.tsx';

export const ISSUE_GROUPS = ['all', 'attention', 'active', 'queued', 'delivered', 'abandoned'] as const;
export type IssueGroup = (typeof ISSUE_GROUPS)[number];

const BLOCKED_STATE: IssueState = 'blocked';
const SHORT_HASH_LENGTH = 12;
const ATTENTION_STATES: readonly IssueState[] = ['spec-draft', 'ready-to-merge', ISSUE_ESCALATION_STATE];
const QUEUED_STATES: readonly IssueState[] = [STARTABLE_STATE, BLOCKED_STATE];
const HASH_PREFIX = /^#/;

const GROUP_PREDICATES: Readonly<Record<IssueGroup, (issue: Pick<IssueView, 'state'>) => boolean>> = {
  all: () => true,
  attention: (issue) => ATTENTION_STATES.includes(issue.state),
  active: (issue) => ACTIVE_PIPELINE_STATES.includes(issue.state),
  queued: (issue) => QUEUED_STATES.includes(issue.state),
  delivered: (issue) => MERGED_OR_BEYOND_STATES.includes(issue.state),
  abandoned: (issue) => issue.state === ISSUE_ABANDONED_STATE,
};

export function issuesInGroup<Issue extends Pick<IssueView, 'state'>>(issues: readonly Issue[], group: IssueGroup): readonly Issue[] {
  return issues.filter(GROUP_PREDICATES[group]);
}

export interface IssueFilter {
  readonly group: IssueGroup;
  readonly type: string | null;
  readonly query: string;
}

export const NO_ISSUE_FILTER: IssueFilter = { group: 'all', type: null, query: '' };

export function isFiltering(filter: IssueFilter): boolean {
  return filter.group !== NO_ISSUE_FILTER.group || filter.type !== NO_ISSUE_FILTER.type || filter.query.trim() !== NO_ISSUE_FILTER.query;
}

/** Whether the text is part of the title or of the number of the issue; a leading `#` is ignored. */
export function matchesQuery(issue: Pick<IssueView, 'number' | 'title'>, query: string): boolean {
  const needle = query.trim().toLowerCase().replace(HASH_PREFIX, '');
  if (needle === '') return true;
  return issue.title.toLowerCase().includes(needle) || String(issue.number).includes(needle);
}

export function filterIssues(issues: readonly IssueView[], filter: IssueFilter): readonly IssueView[] {
  return issuesInGroup(issues, filter.group).filter((issue) => (filter.type === null || issue.type === filter.type) && matchesQuery(issue, filter.query));
}

export function sortIssues(issues: readonly IssueView[]): readonly IssueView[] {
  return issues.toSorted((left, right) => right.number - left.number);
}

export function issueTypeIds(project: Pick<ProjectView, 'issueTypes' | 'issues'>): readonly string[] {
  const declared = project.issueTypes.map((type) => type.id);
  const undeclared = project.issues.map((issue) => issue.type).filter((id) => !declared.includes(id));
  return [...declared, ...new Set(undeclared)];
}

export function isMerged(issue: Pick<IssueView, 'state'>): boolean {
  return MERGED_OR_BEYOND_STATES.includes(issue.state);
}

export function isBlocked(issue: Pick<IssueView, 'state'>): boolean {
  return issue.state === BLOCKED_STATE;
}

export interface Dependencies {
  readonly held: readonly IssueView[];
  readonly missing: readonly number[];
}

export function dependenciesOf(issue: Pick<IssueView, 'dependsOn'>, issues: readonly IssueView[]): Dependencies {
  const numbers = [...new Set(issue.dependsOn)];
  return {
    held: numbers.flatMap((number) => issues.filter((candidate) => candidate.number === number)),
    missing: numbers.filter((number) => !issues.some((candidate) => candidate.number === number)),
  };
}

export function dependentsOf(issue: Pick<IssueView, 'number'>, issues: readonly IssueView[]): readonly IssueView[] {
  return issues.filter((candidate) => candidate.dependsOn.includes(issue.number));
}

/** The dependencies of the project that are not merged yet, which is what keeps an issue from starting. */
export function unmergedDependencies(issue: Pick<IssueView, 'dependsOn'>, issues: readonly IssueView[]): readonly IssueView[] {
  return dependenciesOf(issue, issues).held.filter((dependency) => !isMerged(dependency));
}

/** A dependency blocks when the issue that waits for it is marked blocked and the dependency is not merged. */
export function isBlockingDependency(dependency: Pick<IssueView, 'state'>, dependent: Pick<IssueView, 'state'>): boolean {
  return isBlocked(dependent) && !isMerged(dependency);
}

export type StartAvailability =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'waiting'; readonly on: readonly IssueView[] };

/** Whether Start is offered: only to an issue that is queued, and then only once everything it waits for is merged. */
export function startAvailability(issue: IssueView, issues: readonly IssueView[]): StartAvailability {
  if (issue.state !== STARTABLE_STATE) return { kind: 'unavailable' };
  const on = unmergedDependencies(issue, issues);
  return on.length === 0 ? { kind: 'ready' } : { kind: 'waiting', on };
}

/** The groups of issues that wait for each other in a circle; none of them can ever start. */
export function dependencyCycles(issues: readonly IssueView[]): readonly (readonly number[])[] {
  return findDependencyCycles(issues);
}

export function cycleOf(issue: Pick<IssueView, 'number'>, cycles: readonly (readonly number[])[]): readonly number[] | null {
  return cycles.find((cycle) => cycle.includes(issue.number)) ?? null;
}

export const PIPELINE_STAGES = [
  { id: 'spec', states: ['spec-draft', 'spec-validated', 'blocked'] },
  { id: 'checks', states: ['authoring-checks', 'checks-frozen', 'rewriting-check'] },
  { id: 'implementation', states: ['implementing', 'gating'] },
  { id: 'review', states: ['reviewing'] },
  { id: 'evidence', states: ['producing-evidence'] },
  { id: 'pullRequest', states: ['pr-open', 'ci', 'ready-to-merge'] },
  { id: 'merge', states: ['merged', 'in-dev'] },
  { id: 'release', states: ['in-release', 'in-prep'] },
  { id: 'production', states: ['in-prod', 'closed'] },
] as const satisfies readonly { readonly id: string; readonly states: readonly IssueState[] }[];

export type PipelineStageId = (typeof PIPELINE_STAGES)[number]['id'];
export type StageStatus = 'done' | 'current' | 'stuck' | 'upcoming';

export interface StageProgress {
  readonly id: PipelineStageId;
  readonly status: StageStatus;
}

const CLOSED_STATE: IssueState = 'closed';

function stageIndexOf(state: IssueState | null): number {
  if (state === null) return -1;
  return PIPELINE_STAGES.findIndex((stage) => stage.states.some((candidate) => candidate === state));
}

/**
 * Where an issue stands among the stages. An escalated issue is stuck at the stage it was in when it
 * stopped; one with no recorded resume point has no position, and a closed one has passed every stage.
 */
export function pipelineProgress(issue: Pick<IssueView, 'state' | 'resumeTarget'>): readonly StageProgress[] {
  const escalated = issue.state === ISSUE_ESCALATION_STATE;
  const position = stageIndexOf(escalated ? issue.resumeTarget : issue.state);
  return PIPELINE_STAGES.map((stage, index): StageProgress => {
    if (issue.state === CLOSED_STATE || index < position) return { id: stage.id, status: 'done' };
    if (index === position) return { id: stage.id, status: escalated ? 'stuck' : 'current' };
    return { id: stage.id, status: 'upcoming' };
  });
}

const ATTEMPT_MARKS: Readonly<Record<Attempt['outcome'], StatusMark>> = {
  running: 'running',
  passed: 'success',
  'gate-failed': 'failed',
  'review-failed': 'failed',
  error: 'failed',
};

export function attemptMark(outcome: Attempt['outcome']): StatusMark {
  return ATTEMPT_MARKS[outcome];
}

const BEFORE_RESULT_TONES: Readonly<Record<AcceptanceCheck['before']['result'], BadgeTone>> = {
  failed: 'success',
  passed: 'failed',
  scored: 'accent',
  'not-run': 'idle',
};

const RESULT_EXPECTED_ON_BASE: Readonly<Record<NonNullable<AcceptanceCheck['onBase']>, AcceptanceCheck['before']['result']>> = {
  fails: 'failed',
  passes: 'passed',
};

/**
 * Whether what a check did on the base is what it should have done: a check of new behaviour must
 * fail there, a check of kept behaviour must pass, and a score or a check never run is neither right nor wrong.
 */
export function beforeResultTone(check: Pick<AcceptanceCheck, 'onBase' | 'before'>): BadgeTone {
  const { result } = check.before;
  if (check.onBase === null || result === 'scored' || result === 'not-run') return BEFORE_RESULT_TONES[result];
  return RESULT_EXPECTED_ON_BASE[check.onBase] === result ? 'success' : 'failed';
}

type IssueCostEntry = CockpitSnapshot['costs']['byIssue'][number];

export function costEntryOf(entries: readonly IssueCostEntry[], project: string, issueNumber: number): IssueCostEntry | null {
  return entries.find((entry) => entry.project === project && entry.issueNumber === issueNumber) ?? null;
}

/** The first characters of a content hash, enough to tell two apart; the full hash stays available on hover. */
export function shortHash(hash: string): string {
  return hash.slice(0, SHORT_HASH_LENGTH);
}
