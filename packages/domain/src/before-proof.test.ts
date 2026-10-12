import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BEFORE_PROOF_EXPECTATIONS,
  beforeProofKind,
  evaluateBeforeProof,
  REASON_BASE_SCORE_MISSING,
  REASON_CHECKS_PASS_ON_BASE,
  requiresFailingBase,
} from './before-proof.ts';
import { ISSUE_TYPES } from './model.ts';

const PASSING_ON_BASE = { checksExpressible: true, checksFailedOnBase: false, baseScore: null };
const FAILING_ON_BASE = { checksExpressible: true, checksFailedOnBase: true, baseScore: null };

describe('before-proof', () => {
  it('matches the architecture table', () => {
    expect(ISSUE_TYPES.map((type) => [type, beforeProofKind(type)])).toEqual([
      ['ui', 'fails-on-base'],
      ['skill-prompt', 'base-score'],
      ['engine-api', 'fails-on-base'],
      ['security', 'fails-on-base'],
      ['infra-ci', 'fails-on-base'],
      ['data', 'fails-on-base'],
      ['dependencies', 'none'],
      ['doc', 'none'],
      ['release', 'none'],
      ['refactor', 'none'],
    ]);
  });

  it('requires a failing base for ui, engine-api, security and data', () => {
    expect(ISSUE_TYPES.filter(requiresFailingBase)).toEqual(['ui', 'engine-api', 'security', 'data']);
  });

  it('rejects a ui issue whose checks pass on base', () => {
    expect(evaluateBeforeProof('ui', PASSING_ON_BASE)).toEqual({ valid: false, reason: REASON_CHECKS_PASS_ON_BASE });
    expect(evaluateBeforeProof('ui', FAILING_ON_BASE)).toEqual({ valid: true, kind: 'fails-on-base' });
  });

  it('requires a base score for skill-prompt issues', () => {
    expect(evaluateBeforeProof('skill-prompt', PASSING_ON_BASE)).toEqual({
      valid: false,
      reason: REASON_BASE_SCORE_MISSING,
    });
    expect(evaluateBeforeProof('skill-prompt', { ...PASSING_ON_BASE, baseScore: 0.4 })).toEqual({
      valid: true,
      kind: 'base-score',
    });
  });

  it('accepts infra-ci without a failing base only when the checks are not expressible', () => {
    expect(evaluateBeforeProof('infra-ci', { ...PASSING_ON_BASE, checksExpressible: false })).toEqual({
      valid: true,
      kind: 'none',
    });
    expect(evaluateBeforeProof('infra-ci', PASSING_ON_BASE).valid).toBe(false);
    expect(evaluateBeforeProof('infra-ci', FAILING_ON_BASE)).toEqual({ valid: true, kind: 'fails-on-base' });
  });

  it('never demands a before proof for types without one', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ISSUE_TYPES.filter((type) => BEFORE_PROOF_EXPECTATIONS[type].kind === 'none')),
        fc.boolean(),
        fc.boolean(),
        (type, checksExpressible, checksFailedOnBase) =>
          evaluateBeforeProof(type, { checksExpressible, checksFailedOnBase, baseScore: null }).valid,
      ),
    );
  });
});
