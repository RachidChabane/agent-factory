import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ISSUE_STATES } from './model.ts';
import type { SchedulableIssue } from './scheduler.ts';
import {
  ACTIVE_PIPELINE_STATES,
  DEFAULT_CONCURRENCY_LIMIT,
  findDependencyCycles,
  MERGED_OR_BEYOND_STATES,
  planScheduling,
} from './scheduler.ts';

function issue(number: number, state: SchedulableIssue['state'], dependsOn: number[] = []): SchedulableIssue {
  return { number, state, dependsOn };
}

describe('scheduler', () => {
  it('starts validated issues by ascending number up to the default limit', () => {
    const plan = planScheduling([
      issue(5, 'spec-validated'),
      issue(2, 'spec-validated'),
      issue(9, 'spec-validated'),
      issue(3, 'spec-validated'),
    ]);
    expect(DEFAULT_CONCURRENCY_LIMIT).toBe(3);
    expect(plan.start).toEqual([2, 3, 5]);
  });

  it('counts active pipelines against the limit', () => {
    const plan = planScheduling([
      issue(1, 'implementing'),
      issue(2, 'ci'),
      issue(3, 'spec-validated'),
      issue(4, 'spec-validated'),
    ]);
    expect(plan.start).toEqual([3]);
  });

  it('counts only the states the caller treats as active', () => {
    const plan = planScheduling(
      [issue(1, 'pr-open'), issue(2, 'implementing'), issue(3, 'spec-validated'), issue(4, 'spec-validated')],
      2,
      ['implementing'],
    );
    expect(plan.start).toEqual([3]);
  });

  it('waits for every dependency to be merged or beyond', () => {
    const plan = planScheduling([
      issue(1, 'merged'),
      issue(2, 'ci'),
      issue(3, 'spec-validated', [1]),
      issue(4, 'spec-validated', [1, 2]),
      issue(5, 'spec-validated', [99]),
    ]);
    expect(plan.start).toEqual([3]);
  });

  it('ignores issues that are not spec-validated', () => {
    expect(planScheduling([issue(1, 'spec-draft'), issue(2, 'blocked'), issue(3, 'needs-human')]).start).toEqual([]);
  });

  it('reports dependency cycles and never starts their members', () => {
    const plan = planScheduling([
      issue(1, 'spec-validated', [2]),
      issue(2, 'spec-validated', [3]),
      issue(3, 'spec-validated', [1]),
      issue(4, 'spec-validated', [4]),
      issue(5, 'spec-validated'),
    ]);
    expect(plan.cycles).toEqual([[1, 2, 3], [4]]);
    expect(plan.start).toEqual([5]);
  });

  it('finds no cycle in a chain', () => {
    expect(findDependencyCycles([issue(1, 'merged'), issue(2, 'spec-validated', [1])])).toEqual([]);
  });
});

const graphArb = fc
  .integer({ min: 0, max: 8 })
  .chain((size) =>
    fc.tuple(
      ...Array.from({ length: size }, (_, i) =>
        fc.record({
          number: fc.constant(i + 1),
          state: fc.constantFrom(...ISSUE_STATES),
          dependsOn: fc.uniqueArray(fc.integer({ min: 1, max: 9 }), { maxLength: 3 }),
        }),
      ),
    ),
  );

describe('scheduler (property)', () => {
  it('never exceeds the concurrency limit', () => {
    fc.assert(
      fc.property(graphArb, fc.integer({ min: 0, max: 5 }), (issues, limit) => {
        const plan = planScheduling(issues, limit);
        const active = issues.filter((i) => ACTIVE_PIPELINE_STATES.includes(i.state)).length;
        return plan.start.length === 0 || active + plan.start.length <= limit;
      }),
    );
  });

  it('never starts an issue with an unmerged dependency', () => {
    fc.assert(
      fc.property(graphArb, (issues) => {
        const stateOf = new Map(issues.map((i) => [i.number, i.state]));
        const plan = planScheduling(issues);
        return plan.start.every((started) =>
          (issues.find((i) => i.number === started)?.dependsOn ?? []).every((dep) => {
            const state = stateOf.get(dep);
            return state !== undefined && MERGED_OR_BEYOND_STATES.includes(state);
          }),
        );
      }),
    );
  });

  it('is deterministic regardless of input order', () => {
    fc.assert(
      fc.property(graphArb, (issues) => {
        const reversed = [...issues].reverse();
        expect(planScheduling(reversed)).toEqual(planScheduling(issues));
      }),
    );
  });

  it('returns ascending numbers of validated issues only', () => {
    fc.assert(
      fc.property(graphArb, (issues) => {
        const { start } = planScheduling(issues);
        return (
          start.every((n) => issues.find((i) => i.number === n)?.state === 'spec-validated') &&
          start.every((n, i) => i === 0 || (start[i - 1] ?? 0) < n)
        );
      }),
    );
  });
});
