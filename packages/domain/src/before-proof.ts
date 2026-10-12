import type { ProofExpectation } from './issue-types.ts';
import type { BeforeProofKind } from './model.ts';

export const REASON_CHECKS_PASS_ON_BASE = 'checks do not fail on base';
export const REASON_BASE_SCORE_MISSING = 'base score is missing';

export interface BeforeProofObservation {
  readonly checksExpressible: boolean;
  readonly checksFailedOnBase: boolean;
  readonly baseScore: number | null;
}

export type BeforeProofEvaluation =
  | { readonly valid: true; readonly kind: BeforeProofKind }
  | { readonly valid: false; readonly reason: string };

/** Judges what the frozen checks showed on the base against what the issue type's proof strategy expects. */
export function evaluateBeforeProof(expectation: ProofExpectation, observation: BeforeProofObservation): BeforeProofEvaluation {
  if (expectation.kind === 'base-score') {
    return observation.baseScore === null ? { valid: false, reason: REASON_BASE_SCORE_MISSING } : { valid: true, kind: 'base-score' };
  }
  if (expectation.mandatoryFailingBase) {
    return observation.checksFailedOnBase ? { valid: true, kind: 'fails-on-base' } : { valid: false, reason: REASON_CHECKS_PASS_ON_BASE };
  }
  if (expectation.failingBaseWhenExpressible) {
    if (!observation.checksExpressible) return { valid: true, kind: 'none' };
    return observation.checksFailedOnBase ? { valid: true, kind: 'fails-on-base' } : { valid: false, reason: REASON_CHECKS_PASS_ON_BASE };
  }
  return { valid: true, kind: 'none' };
}
