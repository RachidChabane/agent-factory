import { planScheduling } from '@agent-factory/domain';
import type { IssueState, SchedulableIssue } from '@agent-factory/domain';
import { RUNNING_PIPELINE_STATES } from '../pipeline/pipeline-capacity.ts';
import { freeWorktrees } from './worktree-capacity.ts';

export const SCHEDULABLE_FACTORY_STATES: readonly IssueState[] = ['spec-draft', 'spec-validated', 'blocked'];
const STARTABLE: IssueState = 'spec-validated';
const NOT_STARTABLE: IssueState = 'spec-draft';
const NOTHING_COUNTS_AS_ACTIVE: readonly IssueState[] = [];

export interface ValidatedIssue {
  readonly number: number;
  readonly blockedBy: readonly number[];
}

export interface SchedulingInputs {
  readonly validated: readonly ValidatedIssue[];
  readonly states: ReadonlyMap<number, IssueState>;
  readonly dependencyStates: ReadonlyMap<number, IssueState>;
  readonly inProcess: ReadonlySet<number>;
  readonly deferred: ReadonlySet<number>;
  readonly heldWorktrees: number;
  readonly busySlots: number;
}

export interface SchedulingLimits {
  readonly concurrency: number;
  readonly poolSize: number;
}

export interface SchedulingDecision {
  readonly resume: readonly number[];
  readonly start: readonly number[];
  readonly waiting: readonly number[];
  /** The validated issues that would start now if a worktree were free: no concurrency limit holds them back. */
  readonly awaitingWorktree: readonly number[];
  readonly cycles: readonly (readonly number[])[];
}

function ascending(a: number, b: number): number {
  return a - b;
}

export function inFlightIssues(inputs: SchedulingInputs): readonly number[] {
  return [...inputs.states]
    .filter(([number, state]) => RUNNING_PIPELINE_STATES.includes(state) && !inputs.inProcess.has(number) && !inputs.deferred.has(number))
    .map(([number]) => number)
    .sort(ascending);
}

function schedulableState(inputs: SchedulingInputs, number: number): IssueState | null {
  const state = inputs.states.get(number);
  if (state !== undefined && !SCHEDULABLE_FACTORY_STATES.includes(state)) return null;
  return inputs.deferred.has(number) || inputs.inProcess.has(number) ? NOT_STARTABLE : STARTABLE;
}

export function schedulableIssues(inputs: SchedulingInputs): readonly SchedulableIssue[] {
  const listed = new Map<number, SchedulableIssue>();
  for (const [number, state] of inputs.dependencyStates) listed.set(number, { number, state, dependsOn: [] });
  for (const [number, state] of inputs.states) listed.set(number, { number, state, dependsOn: [] });
  for (const issue of inputs.validated) {
    const state = schedulableState(inputs, issue.number);
    if (state !== null) listed.set(issue.number, { number: issue.number, state, dependsOn: issue.blockedBy });
  }
  return [...listed.values()];
}

export function decideScheduling(inputs: SchedulingInputs, limits: SchedulingLimits): SchedulingDecision {
  const free = Math.max(0, limits.concurrency - inputs.busySlots);
  const resume = inFlightIssues(inputs).slice(0, free);
  const capacity = free - resume.length;
  const plan = planScheduling(schedulableIssues(inputs), Number.MAX_SAFE_INTEGER, NOTHING_COUNTS_AS_ACTIVE);
  const startable = plan.start.filter((number) => !inputs.inProcess.has(number));
  const poolRoom = freeWorktrees(limits.poolSize, inputs.heldWorktrees);
  const start = startable.slice(0, Math.min(capacity, poolRoom));
  const awaitingWorktree = poolRoom === 0 ? startable.slice(0, capacity) : [];
  return { resume, start, waiting: startable.slice(start.length), awaitingWorktree, cycles: plan.cycles };
}
