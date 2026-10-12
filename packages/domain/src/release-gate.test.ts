import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AUDIT_STATES } from './audit-lifecycle.ts';
import type { ReleaseGateInput } from './release-gate.ts';
import { evaluateReleaseGate, REASON_NO_PREP_CHECKS } from './release-gate.ts';

const CLEAN: ReleaseGateInput = {
  commitShas: ['a', 'b'],
  audits: [],
  mergedPullRequests: [{ number: 1, evidenceComplete: true }],
  prepHealthChecks: [{ name: 'smoke', passed: true }],
};

describe('release gate', () => {
  it('is promotable when everything is clean', () => {
    expect(evaluateReleaseGate(CLEAN)).toEqual({ promotable: true, blockingReasons: [] });
  });

  it('blocks on unresolved challenge or rewrite audits and on unfinished audits', () => {
    for (const state of ['challenge', 'rewrite', 'detected', 'auditing'] as const) {
      const result = evaluateReleaseGate({ ...CLEAN, audits: [{ commitSha: 'a', state, resolved: false }] });
      expect(result.promotable).toBe(false);
    }
  });

  it('ignores resolved, kept and foreign-commit audits', () => {
    const result = evaluateReleaseGate({
      ...CLEAN,
      audits: [
        { commitSha: 'a', state: 'challenge', resolved: true },
        { commitSha: 'b', state: 'keep', resolved: false },
        { commitSha: 'zzz', state: 'rewrite', resolved: false },
      ],
    });
    expect(result.promotable).toBe(true);
  });

  it('blocks on incomplete evidence and failing or missing PREP checks', () => {
    expect(evaluateReleaseGate({ ...CLEAN, mergedPullRequests: [{ number: 7, evidenceComplete: false }] }).blockingReasons)
      .toEqual(['pull request #7 has incomplete evidence']);
    expect(evaluateReleaseGate({ ...CLEAN, prepHealthChecks: [{ name: 'smoke', passed: false }] }).blockingReasons)
      .toEqual(['PREP health check smoke failed']);
    expect(evaluateReleaseGate({ ...CLEAN, prepHealthChecks: [] }).blockingReasons).toEqual([REASON_NO_PREP_CHECKS]);
  });

  it('is promotable if and only if there is no blocking reason', () => {
    const inputArb = fc.record({
      commitShas: fc.uniqueArray(fc.constantFrom('a', 'b', 'c')),
      audits: fc.array(
        fc.record({
          commitSha: fc.constantFrom('a', 'b', 'c', 'd'),
          state: fc.constantFrom(...AUDIT_STATES),
          resolved: fc.boolean(),
        }),
        { maxLength: 4 },
      ),
      mergedPullRequests: fc.array(fc.record({ number: fc.nat(), evidenceComplete: fc.boolean() }), { maxLength: 4 }),
      prepHealthChecks: fc.array(fc.record({ name: fc.string(), passed: fc.boolean() }), { maxLength: 4 }),
    });
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = evaluateReleaseGate(input);
        return result.promotable === (result.blockingReasons.length === 0);
      }),
    );
  });
});
