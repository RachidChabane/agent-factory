import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluateBeforeProof, REASON_BASE_SCORE_MISSING, REASON_CHECKS_PASS_ON_BASE } from './before-proof.ts';
import { proofExpectation } from './issue-types.ts';

const PASSING_ON_BASE = { checksExpressible: true, checksFailedOnBase: false, baseScore: null };
const FAILING_ON_BASE = { checksExpressible: true, checksFailedOnBase: true, baseScore: null };

describe('before-proof', () => {
  it('rejects checks of a fails-on-base type that pass on base', () => {
    const expectation = proofExpectation('fails-on-base');
    expect(evaluateBeforeProof(expectation, PASSING_ON_BASE)).toEqual({ valid: false, reason: REASON_CHECKS_PASS_ON_BASE });
    expect(evaluateBeforeProof(expectation, FAILING_ON_BASE)).toEqual({ valid: true, kind: 'fails-on-base' });
  });

  it('requires a base score for a base-score type', () => {
    const expectation = proofExpectation('base-score');
    expect(evaluateBeforeProof(expectation, PASSING_ON_BASE)).toEqual({ valid: false, reason: REASON_BASE_SCORE_MISSING });
    expect(evaluateBeforeProof(expectation, { ...PASSING_ON_BASE, baseScore: 0.4 })).toEqual({ valid: true, kind: 'base-score' });
  });

  it('accepts no failing base for a when-expressible type only when the checks are not expressible', () => {
    const expectation = proofExpectation('fails-on-base-when-expressible');
    expect(evaluateBeforeProof(expectation, { ...PASSING_ON_BASE, checksExpressible: false })).toEqual({ valid: true, kind: 'none' });
    expect(evaluateBeforeProof(expectation, PASSING_ON_BASE).valid).toBe(false);
    expect(evaluateBeforeProof(expectation, FAILING_ON_BASE)).toEqual({ valid: true, kind: 'fails-on-base' });
  });

  it('never demands a before proof of a type without one', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (checksExpressible, checksFailedOnBase) =>
        evaluateBeforeProof(proofExpectation('none'), { checksExpressible, checksFailedOnBase, baseScore: null }).valid,
      ),
    );
  });
});
