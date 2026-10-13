import type { IssueState } from './model.ts';

export const DEFAULT_CONCURRENCY_LIMIT = 3;

export const ACTIVE_PIPELINE_STATES: readonly IssueState[] = [
  'authoring-checks',
  'checks-frozen',
  'rewriting-check',
  'implementing',
  'gating',
  'reviewing',
  'producing-evidence',
  'pr-open',
  'ci',
];

/** The states in which the factory works on an issue by itself, with no agent: freezing the checks, the gate, the evidence. */
export const DETERMINISTIC_PIPELINE_STATES: readonly IssueState[] = ['checks-frozen', 'gating', 'producing-evidence'];

export const MERGED_OR_BEYOND_STATES: readonly IssueState[] = [
  'merged',
  'in-dev',
  'in-release',
  'in-prep',
  'in-prod',
  'closed',
];

export const STARTABLE_STATE: IssueState = 'spec-validated';

export interface SchedulableIssue {
  readonly number: number;
  readonly state: IssueState;
  readonly dependsOn: readonly number[];
}

export interface SchedulingPlan {
  readonly start: readonly number[];
  readonly cycles: readonly (readonly number[])[];
}

function byNumber(a: number, b: number): number {
  return a - b;
}

export function findDependencyCycles(issues: readonly SchedulableIssue[]): readonly (readonly number[])[] {
  const known = new Map(issues.map((issue) => [issue.number, issue]));
  const index = new Map<number, number>();
  const lowLink = new Map<number, number>();
  const onStack = new Set<number>();
  const stack: number[] = [];
  const cycles: number[][] = [];
  let counter = 0;

  const visit = (node: number): void => {
    index.set(node, counter);
    lowLink.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    const successors = known.get(node)?.dependsOn ?? [];
    for (const next of successors) {
      if (!known.has(next)) continue;
      if (!index.has(next)) {
        visit(next);
        lowLink.set(node, Math.min(lowLink.get(node) ?? 0, lowLink.get(next) ?? 0));
      } else if (onStack.has(next)) {
        lowLink.set(node, Math.min(lowLink.get(node) ?? 0, index.get(next) ?? 0));
      }
    }
    if (lowLink.get(node) === index.get(node)) {
      const component: number[] = [];
      let member: number | undefined;
      do {
        member = stack.pop();
        if (member !== undefined) {
          onStack.delete(member);
          component.push(member);
        }
      } while (member !== undefined && member !== node);
      const selfLoop = successors.includes(node);
      if (component.length > 1 || selfLoop) {
        cycles.push(component.sort(byNumber));
      }
    }
  };

  for (const issue of [...issues].sort((a, b) => a.number - b.number)) {
    if (!index.has(issue.number)) visit(issue.number);
  }
  return cycles.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
}

export function planScheduling(
  issues: readonly SchedulableIssue[],
  concurrencyLimit: number = DEFAULT_CONCURRENCY_LIMIT,
  activeStates: readonly IssueState[] = ACTIVE_PIPELINE_STATES,
): SchedulingPlan {
  const cycles = findDependencyCycles(issues);
  const inCycle = new Set(cycles.flat());
  const stateByNumber = new Map(issues.map((issue) => [issue.number, issue.state]));
  const active = issues.filter((issue) => activeStates.includes(issue.state)).length;
  const capacity = Math.max(0, concurrencyLimit - active);

  const dependenciesMerged = (issue: SchedulableIssue): boolean =>
    issue.dependsOn.every((dependency) => {
      const state = stateByNumber.get(dependency);
      return state !== undefined && MERGED_OR_BEYOND_STATES.includes(state);
    });

  const start = issues
    .filter((issue) => issue.state === STARTABLE_STATE && !inCycle.has(issue.number) && dependenciesMerged(issue))
    .map((issue) => issue.number)
    .sort(byNumber)
    .slice(0, capacity);
  return { start, cycles };
}
