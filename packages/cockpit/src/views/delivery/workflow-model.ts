import type { WorkflowRun } from '../../contract/index.ts';
import type { MessageKey } from '../../i18n/catalog/index.ts';
import type { Translate } from '../../i18n/create-i18n.ts';
import { toEpoch } from '../../i18n/formatters.ts';
import type { Vocabulary } from '../../i18n/vocabulary.ts';

export const WORKFLOW_FILTERS = ['all', 'running', 'failed'] as const;
export type WorkflowFilter = (typeof WORKFLOW_FILTERS)[number];

/** A run that has not finished: waiting for a runner, or executing. */
export function isRunning(run: Pick<WorkflowRun, 'status'>): boolean {
  return run.status !== 'completed';
}

export function isFailed(run: Pick<WorkflowRun, 'conclusion'>): boolean {
  return run.conclusion === 'failure';
}

const FILTER_PREDICATES: Readonly<Record<WorkflowFilter, (run: WorkflowRun) => boolean>> = {
  all: () => true,
  running: isRunning,
  failed: isFailed,
};

export function filterWorkflows(runs: readonly WorkflowRun[], filter: WorkflowFilter): readonly WorkflowRun[] {
  return runs.filter(FILTER_PREDICATES[filter]);
}

export function workflowCounts(runs: readonly WorkflowRun[]): Readonly<Record<WorkflowFilter, number>> {
  return { all: runs.length, running: filterWorkflows(runs, 'running').length, failed: filterWorkflows(runs, 'failed').length };
}

export function newestFirst(runs: readonly WorkflowRun[]): readonly WorkflowRun[] {
  return runs.toSorted((left, right) => toEpoch(right.startedAt) - toEpoch(left.startedAt));
}

/** What a run's duration is: measured, not available yet because the run goes on, or not reported for a finished run. */
export type RunDuration = { readonly kind: 'measured'; readonly milliseconds: number } | { readonly kind: 'running' } | { readonly kind: 'unreported' };

export function durationOf(run: Pick<WorkflowRun, 'status' | 'durationMs'>): RunDuration {
  if (run.durationMs !== null) return { kind: 'measured', milliseconds: run.durationMs };
  return isRunning(run) ? { kind: 'running' } : { kind: 'unreported' };
}

/** A finished run is named by its conclusion; a run still going, by where it is. */
export function workflowStatusLabel(run: Pick<WorkflowRun, 'status' | 'conclusion'>, vocabulary: Vocabulary): string {
  return run.status === 'completed' && run.conclusion !== null ? vocabulary.checkConclusion(run.conclusion) : vocabulary.workflowStatus(run.status);
}

const TRIGGER_MESSAGES = {
  push: 'delivery.trigger.push',
  pull_request: 'delivery.trigger.pullRequest',
  schedule: 'delivery.trigger.schedule',
  workflow_dispatch: 'delivery.trigger.workflowDispatch',
  workflow_run: 'delivery.trigger.workflowRun',
  release: 'delivery.trigger.release',
} as const satisfies Readonly<Record<string, MessageKey>>;

function isKnownTrigger(trigger: string): trigger is keyof typeof TRIGGER_MESSAGES {
  return Object.hasOwn(TRIGGER_MESSAGES, trigger);
}

/** The event that started a run in words; an event the cockpit has no words for is shown as the forge names it. */
export function triggerLabel(trigger: string, t: Translate): string {
  return isKnownTrigger(trigger) ? t(TRIGGER_MESSAGES[trigger]) : trigger;
}
