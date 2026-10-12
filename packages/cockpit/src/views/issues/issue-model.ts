import type { IssueState } from '@agent-factory/domain';
import { ACTIVE_PIPELINE_STATES, MERGED_OR_BEYOND_STATES } from '@agent-factory/domain';
import type { IssueView } from '../../contract/index.ts';

export const ISSUE_GROUPS = ['all', 'attention', 'active', 'queued', 'done'] as const;
export type IssueGroup = (typeof ISSUE_GROUPS)[number];

export const ISSUE_GROUP_LABELS: Readonly<Record<IssueGroup, string>> = {
  all: 'Toutes',
  attention: 'À traiter',
  active: 'En cours',
  queued: 'En attente',
  done: 'Livrées',
};

const ATTENTION_STATES: readonly IssueState[] = ['spec-draft', 'ready-to-merge', 'needs-human'];
const QUEUED_STATES: readonly IssueState[] = ['spec-validated', 'blocked'];

const GROUP_PREDICATES: Readonly<Record<IssueGroup, (issue: IssueView) => boolean>> = {
  all: () => true,
  attention: (issue) => ATTENTION_STATES.includes(issue.state),
  active: (issue) => ACTIVE_PIPELINE_STATES.includes(issue.state),
  queued: (issue) => QUEUED_STATES.includes(issue.state),
  done: (issue) => MERGED_OR_BEYOND_STATES.includes(issue.state),
};

export function issuesInGroup(issues: readonly IssueView[], group: IssueGroup): readonly IssueView[] {
  return issues.filter(GROUP_PREDICATES[group]);
}

export function dependenciesMerged(issue: IssueView, issues: readonly IssueView[]): boolean {
  return issue.dependsOn.every((number) => {
    const dependency = issues.find((entry) => entry.number === number);
    return dependency === undefined || MERGED_OR_BEYOND_STATES.includes(dependency.state);
  });
}

export function dependents(issue: IssueView, issues: readonly IssueView[]): readonly IssueView[] {
  return issues.filter((entry) => entry.dependsOn.includes(issue.number));
}

export const PIPELINE_STAGES = [
  { label: 'Spec', states: ['spec-draft', 'spec-validated', 'blocked'] },
  { label: 'Checks', states: ['authoring-checks', 'checks-frozen', 'rewriting-check'] },
  { label: 'Implémentation', states: ['implementing', 'gating'] },
  { label: 'Revue', states: ['reviewing'] },
  { label: 'Preuves', states: ['producing-evidence'] },
  { label: 'PR & CI', states: ['pr-open', 'ci', 'ready-to-merge'] },
  { label: 'Merge', states: ['merged', 'in-dev'] },
  { label: 'Release', states: ['in-release', 'in-prep'] },
  { label: 'Production', states: ['in-prod', 'closed'] },
] as const satisfies readonly { readonly label: string; readonly states: readonly IssueState[] }[];

export function pipelineStageIndex(state: IssueState): number {
  return PIPELINE_STAGES.findIndex((stage) => stage.states.some((candidate) => candidate === state));
}
