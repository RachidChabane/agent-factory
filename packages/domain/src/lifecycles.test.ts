import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { auditLifecycle } from './audit-lifecycle.ts';
import { InvalidTransitionError } from './lifecycle.ts';
import type { Lifecycle } from './lifecycle.ts';
import {
  assertResumeTarget,
  assertTransition,
  canTransition,
  CHECK_REWRITABLE_STATES,
  ISSUE_ABANDONED_STATE,
  ISSUE_CHECK_REWRITE_STATE,
  ISSUE_ESCALATION_STATE,
  ISSUE_FINAL_STATES,
  ISSUE_TERMINAL_STATE,
  issueLifecycle,
} from './issue-lifecycle.ts';
import { releaseLifecycle } from './release-lifecycle.ts';
import { requestLifecycle } from './request-lifecycle.ts';

const LIFECYCLES: readonly Lifecycle<string>[] = [issueLifecycle, requestLifecycle, releaseLifecycle, auditLifecycle];

function reachableFrom(lifecycle: Lifecycle<string>, start: string): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  for (let state = queue.shift(); state !== undefined; state = queue.shift()) {
    for (const next of lifecycle.nextStates(state)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

describe('issue lifecycle', () => {
  it('follows the happy path to closed', () => {
    const path = ['spec-draft', 'spec-validated', 'authoring-checks', 'checks-frozen', 'implementing', 'gating',
      'reviewing', 'producing-evidence', 'pr-open', 'ci', 'ready-to-merge', 'merged', 'in-dev', 'in-release',
      'in-prep', 'in-prod', 'closed'] as const;
    path.slice(0, -1).forEach((from, index) => {
      expect(canTransition(from, path[index + 1] ?? from)).toBe(true);
    });
  });

  it('rejects skipping states', () => {
    expect(canTransition('spec-draft', 'implementing')).toBe(false);
    expect(() => assertTransition('spec-draft', 'implementing')).toThrow(InvalidTransitionError);
  });

  it('allows correction loops after gate, review and CI failures', () => {
    expect(canTransition('gating', 'implementing')).toBe(true);
    expect(canTransition('reviewing', 'implementing')).toBe(true);
    expect(canTransition('ci', 'implementing')).toBe(true);
  });

  it('leaves needs-human only to the state recorded before it, or to abandoned', () => {
    expect(() => assertResumeTarget('gating', 'gating')).not.toThrow();
    expect(() => assertResumeTarget('gating', 'implementing')).toThrow(InvalidTransitionError);
    expect(() => assertResumeTarget('gating', ISSUE_ABANDONED_STATE)).not.toThrow();
  });

  it('enters a check rewrite from every frozen, unmerged state and leaves it only to re-freeze', () => {
    for (const state of CHECK_REWRITABLE_STATES) expect(canTransition(state, ISSUE_CHECK_REWRITE_STATE)).toBe(true);
    expect(issueLifecycle.nextStates(ISSUE_CHECK_REWRITE_STATE)).toEqual(['checks-frozen', ISSUE_ESCALATION_STATE]);
    expect(canTransition('authoring-checks', ISSUE_CHECK_REWRITE_STATE)).toBe(false);
    expect(canTransition('merged', ISSUE_CHECK_REWRITE_STATE)).toBe(false);
  });

  it('leaves needs-human for a check rewrite only when the checks were frozen and not merged', () => {
    for (const state of CHECK_REWRITABLE_STATES) expect(() => assertResumeTarget(state, ISSUE_CHECK_REWRITE_STATE)).not.toThrow();
    expect(() => assertResumeTarget(ISSUE_CHECK_REWRITE_STATE, ISSUE_CHECK_REWRITE_STATE)).not.toThrow();
    expect(() => assertResumeTarget('authoring-checks', ISSUE_CHECK_REWRITE_STATE)).toThrow(InvalidTransitionError);
    expect(() => assertResumeTarget('spec-validated', ISSUE_CHECK_REWRITE_STATE)).toThrow(InvalidTransitionError);
  });

  it('carries typed error details', () => {
    try {
      assertTransition('closed', 'in-dev');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTransitionError);
      if (error instanceof InvalidTransitionError) {
        expect([error.lifecycle, error.from, error.to]).toEqual(['issue', 'closed', 'in-dev']);
      }
    }
  });

  it('keeps closed terminal even towards needs-human', () => {
    expect(issueLifecycle.nextStates(ISSUE_TERMINAL_STATE)).toEqual([]);
    expect(canTransition(ISSUE_TERMINAL_STATE, ISSUE_ESCALATION_STATE)).toBe(false);
  });

  it('abandons an issue only from needs-human, and keeps it abandoned', () => {
    expect(canTransition(ISSUE_ESCALATION_STATE, ISSUE_ABANDONED_STATE)).toBe(true);
    expect(canTransition('implementing', ISSUE_ABANDONED_STATE)).toBe(false);
    expect(issueLifecycle.isTerminal(ISSUE_ABANDONED_STATE)).toBe(true);
    expect(canTransition(ISSUE_ESCALATION_STATE, ISSUE_TERMINAL_STATE)).toBe(false);
  });
});

describe('request, release and audit lifecycles', () => {
  it('declares the documented transitions', () => {
    expect(requestLifecycle.canTransition('challenged', 'waiting-requester')).toBe(true);
    expect(requestLifecycle.canTransition('received', 'accepted')).toBe(false);
    expect(releaseLifecycle.canTransition('auditing', 'promotable')).toBe(true);
    expect(releaseLifecycle.canTransition('open', 'promoted')).toBe(false);
    expect(auditLifecycle.canTransition('auditing', 'rewrite')).toBe(true);
    expect(() => auditLifecycle.assertTransition('keep', 'auditing')).toThrow(InvalidTransitionError);
  });
});

describe('transition tables (property)', () => {
  const lifecycleArb = fc.constantFrom(...LIFECYCLES);

  it('offers no transition out of a terminal state', () => {
    fc.assert(
      fc.property(lifecycleArb, fc.nat(), (lifecycle, pick) => {
        const terminals = lifecycle.states.filter((state) => lifecycle.isTerminal(state));
        expect(terminals.length).toBeGreaterThan(0);
        const terminal = terminals[pick % terminals.length] ?? lifecycle.initial;
        return lifecycle.states.every((to) => !lifecycle.canTransition(terminal, to));
      }),
    );
  });

  it('reaches every state from the initial state', () => {
    fc.assert(
      fc.property(lifecycleArb, (lifecycle) => reachableFrom(lifecycle, lifecycle.initial).size === lifecycle.states.length),
    );
  });

  it('only declares transitions between known states', () => {
    fc.assert(
      fc.property(lifecycleArb, (lifecycle) =>
        lifecycle.states.every((from) => lifecycle.nextStates(from).every((to) => lifecycle.states.includes(to))),
      ),
    );
  });

  it('reaches needs-human from every non-terminal issue state', () => {
    const nonTerminal = issueLifecycle.states.filter(
      (state) => !ISSUE_FINAL_STATES.includes(state) && state !== ISSUE_ESCALATION_STATE,
    );
    fc.assert(
      fc.property(fc.constantFrom(...nonTerminal), (state) => canTransition(state, ISSUE_ESCALATION_STATE)),
    );
  });

  it('reaches abandoned from every in-flight issue state through needs-human only', () => {
    const inFlight = issueLifecycle.states.filter((state) => !ISSUE_FINAL_STATES.includes(state));
    fc.assert(
      fc.property(fc.constantFrom(...inFlight), (state) =>
        canTransition(state, ISSUE_ABANDONED_STATE) === (state === ISSUE_ESCALATION_STATE) &&
        reachableFrom(issueLifecycle, state).has(ISSUE_ABANDONED_STATE),
      ),
    );
  });

  it('reaches a check rewrite from an issue state exactly when its checks are frozen and its pull request is not merged', () => {
    const inFlight = issueLifecycle.states.filter((state) => !ISSUE_FINAL_STATES.includes(state) && state !== ISSUE_ESCALATION_STATE);
    fc.assert(
      fc.property(fc.constantFrom(...inFlight), (state) =>
        canTransition(state, ISSUE_CHECK_REWRITE_STATE) === CHECK_REWRITABLE_STATES.includes(state),
      ),
    );
  });

  it('agrees between canTransition and assertTransition', () => {
    fc.assert(
      fc.property(lifecycleArb, fc.nat(), fc.nat(), (lifecycle, a, b) => {
        const from = lifecycle.states[a % lifecycle.states.length] ?? lifecycle.initial;
        const to = lifecycle.states[b % lifecycle.states.length] ?? lifecycle.initial;
        const allowed = lifecycle.canTransition(from, to);
        let threw = false;
        try {
          lifecycle.assertTransition(from, to);
        } catch {
          threw = true;
        }
        return allowed !== threw;
      }),
    );
  });
});
