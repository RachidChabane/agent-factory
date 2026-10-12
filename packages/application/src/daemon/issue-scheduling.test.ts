import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ISSUE_STATES } from '@agent-factory/domain';
import type { IssueState } from '@agent-factory/domain';
import { decideScheduling, type SchedulingInputs } from './issue-scheduling.ts';

function inputs(overrides: Partial<SchedulingInputs> = {}): SchedulingInputs {
  return {
    validated: [],
    states: new Map(),
    dependencyStates: new Map(),
    inProcess: new Set(),
    deferred: new Set(),
    heldWorktrees: 0,
    busySlots: 0,
    ...overrides,
  };
}

const LIMITS = { concurrency: 1, poolSize: 3 };

describe('daemon scheduling decision', () => {
  it('starts the lowest validated issue the factory has never seen, within the concurrency limit', () => {
    const decision = decideScheduling(inputs({ validated: [{ number: 9, blockedBy: [] }, { number: 4, blockedBy: [] }] }), LIMITS);
    expect(decision).toEqual({ resume: [], start: [4], waiting: [9], cycles: [] });
  });

  it('does not count an issue waiting at an open pull request against the concurrency limit', () => {
    const decision = decideScheduling(
      inputs({ validated: [{ number: 2, blockedBy: [] }], states: new Map([[1, 'pr-open']]), heldWorktrees: 1 }),
      LIMITS,
    );
    expect(decision.start).toEqual([2]);
  });

  it('never starts more issues than free worktrees', () => {
    const decision = decideScheduling(
      inputs({ validated: [{ number: 5, blockedBy: [] }], states: new Map([[1, 'pr-open'], [2, 'pr-open'], [3, 'needs-human']]), heldWorktrees: 3 }),
      { concurrency: 2, poolSize: 3 },
    );
    expect(decision.start).toEqual([]);
    expect(decision.waiting).toEqual([5]);
  });

  it('never starts again an abandoned issue whose spec is still validated on the tracker', () => {
    const decision = decideScheduling(
      inputs({ validated: [{ number: 5, blockedBy: [] }, { number: 6, blockedBy: [] }], states: new Map([[5, 'abandoned']]) }),
      LIMITS,
    );
    expect(decision).toEqual({ resume: [], start: [6], waiting: [], cycles: [] });
  });

  it('drives an issue whose frozen check the operator ordered rewritten, even at an open pull request', () => {
    const decision = decideScheduling(inputs({ states: new Map([[7, 'rewriting-check']]), heldWorktrees: 1 }), LIMITS);
    expect(decision.resume).toEqual([7]);
  });

  it('drives an issue left mid-pipeline before starting new ones', () => {
    const decision = decideScheduling(
      inputs({ validated: [{ number: 2, blockedBy: [] }], states: new Map([[7, 'implementing']]), heldWorktrees: 1 }),
      LIMITS,
    );
    expect(decision).toMatchObject({ resume: [7], start: [] });
  });

  it('leaves a slot taken by an audit or a running pipeline alone', () => {
    expect(decideScheduling(inputs({ validated: [{ number: 2, blockedBy: [] }], busySlots: 1 }), LIMITS).start).toEqual([]);
    expect(
      decideScheduling(inputs({ states: new Map([[7, 'implementing']]), inProcess: new Set([7]), busySlots: 1 }), LIMITS).resume,
    ).toEqual([]);
  });

  it('re-drives a blocked issue once its dependency is merged, and waits on an open dependency', () => {
    const blocked = inputs({
      validated: [{ number: 3, blockedBy: [1] }],
      states: new Map<number, IssueState>([[3, 'blocked'], [1, 'pr-open']]),
    });
    expect(decideScheduling(blocked, LIMITS).start).toEqual([]);
    expect(decideScheduling({ ...blocked, states: new Map<number, IssueState>([[3, 'blocked'], [1, 'merged']]) }, LIMITS).start).toEqual([3]);
  });

  it('takes the state of a dependency the factory never ran from GitHub', () => {
    const decision = decideScheduling(
      inputs({ validated: [{ number: 3, blockedBy: [80] }], dependencyStates: new Map([[80, 'closed']]) }),
      LIMITS,
    );
    expect(decision.start).toEqual([3]);
  });

  it('skips deferred issues, escalated issues and issues already running', () => {
    const decision = decideScheduling(
      inputs({
        validated: [{ number: 1, blockedBy: [] }, { number: 2, blockedBy: [] }, { number: 3, blockedBy: [] }],
        states: new Map<number, IssueState>([[2, 'needs-human'], [3, 'implementing']]),
        deferred: new Set([1]),
        inProcess: new Set([3]),
        busySlots: 1,
      }),
      { concurrency: 3, poolSize: 3 },
    );
    expect(decision).toMatchObject({ resume: [], start: [] });
  });

  it('reports dependency cycles instead of starting them', () => {
    const decision = decideScheduling(
      inputs({ validated: [{ number: 1, blockedBy: [2] }, { number: 2, blockedBy: [1] }] }),
      { concurrency: 2, poolSize: 3 },
    );
    expect(decision.cycles).toEqual([[1, 2]]);
    expect(decision.start).toEqual([]);
  });

  it('never exceeds the concurrency limit or the free worktrees', () => {
    const state = fc.constantFrom(...ISSUE_STATES);
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 1, max: 30 }), state), { maxLength: 20 }),
        fc.array(fc.integer({ min: 1, max: 30 }), { maxLength: 20 }),
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 3 }),
        (known, validated, concurrency, held, busy) => {
          const decision = decideScheduling(
            inputs({
              validated: [...new Set(validated)].map((number) => ({ number, blockedBy: [] })),
              states: new Map(known),
              heldWorktrees: held,
              busySlots: busy,
            }),
            { concurrency, poolSize: 5 },
          );
          const launched = decision.resume.length + decision.start.length;
          return launched <= Math.max(0, concurrency - busy) && decision.start.length <= Math.max(0, 5 - held);
        },
      ),
    );
  });
});
