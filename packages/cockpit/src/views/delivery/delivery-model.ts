import type { CheckConclusion, EnvironmentName, WorkflowRun } from '../../contract/index.ts';
import { REDEPLOYABLE_ENVIRONMENTS } from '../../contract/index.ts';
import { toEpoch } from '../../format/format.ts';
import { CHECK_CONCLUSION_LABELS, WORKFLOW_STATUS_LABELS } from '../../i18n/labels.ts';

export const WORKFLOW_FILTERS = ['all', 'running', 'failed'] as const;
export type WorkflowFilter = (typeof WORKFLOW_FILTERS)[number];

export const WORKFLOW_FILTER_LABELS: Readonly<Record<WorkflowFilter, string>> = {
  all: 'Tous',
  running: 'En cours',
  failed: 'Échecs',
};

export const HISTORY_LIMIT = 4;
export const RUNNING_DURATION_LABEL = 'en cours';
export const NO_DURATION_LABEL = '—';

export type RedeployTarget = 'dev' | 'prep';

export function redeployTarget(environment: EnvironmentName): RedeployTarget | null {
  if (!REDEPLOYABLE_ENVIRONMENTS.includes(environment)) return null;
  return environment === 'prod' ? null : environment;
}

const FAILING_CONCLUSIONS: readonly CheckConclusion[] = ['failure'];

function isRunning(run: WorkflowRun): boolean {
  return run.status !== 'completed';
}

function isFailed(run: WorkflowRun): boolean {
  return run.conclusion !== null && FAILING_CONCLUSIONS.includes(run.conclusion);
}

const FILTER_PREDICATES: Readonly<Record<WorkflowFilter, (run: WorkflowRun) => boolean>> = {
  all: () => true,
  running: isRunning,
  failed: isFailed,
};

export function newestFirst(runs: readonly WorkflowRun[]): WorkflowRun[] {
  return [...runs].sort((left, right) => toEpoch(right.startedAt) - toEpoch(left.startedAt));
}

export function filterWorkflows(runs: readonly WorkflowRun[], filter: WorkflowFilter): WorkflowRun[] {
  return runs.filter(FILTER_PREDICATES[filter]);
}

export function workflowStatusLabel(run: Pick<WorkflowRun, 'status' | 'conclusion'>): string {
  if (run.status === 'completed' && run.conclusion !== null) return CHECK_CONCLUSION_LABELS[run.conclusion];
  return WORKFLOW_STATUS_LABELS[run.status];
}
