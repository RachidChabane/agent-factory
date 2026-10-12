import type { BeforeProofKind, IssueType } from './model.ts';

export interface BeforeProofExpectation {
  readonly frozenCheck: string;
  readonly kind: BeforeProofKind;
  readonly mandatoryFailingBase: boolean;
  readonly failingBaseWhenExpressible: boolean;
}

export const BEFORE_PROOF_EXPECTATIONS: Readonly<Record<IssueType, BeforeProofExpectation>> = {
  ui: {
    frozenCheck: 'Playwright journey asserting the new behaviour',
    kind: 'fails-on-base',
    mandatoryFailingBase: true,
    failingBaseWhenExpressible: true,
  },
  'skill-prompt': {
    frozenCheck: 'evaluation cases replayed N times on the real model',
    kind: 'base-score',
    mandatoryFailingBase: false,
    failingBaseWhenExpressible: false,
  },
  'engine-api': {
    frozenCheck: 'unit or integration test',
    kind: 'fails-on-base',
    mandatoryFailingBase: true,
    failingBaseWhenExpressible: true,
  },
  security: {
    frozenCheck: 'test reproducing the attack',
    kind: 'fails-on-base',
    mandatoryFailingBase: true,
    failingBaseWhenExpressible: true,
  },
  'infra-ci': {
    frozenCheck: 'helm-unittest, kubeconform, actionlint or policy script assertion',
    kind: 'fails-on-base',
    mandatoryFailingBase: false,
    failingBaseWhenExpressible: true,
  },
  data: {
    frozenCheck: 'migration test on a database copy',
    kind: 'fails-on-base',
    mandatoryFailingBase: true,
    failingBaseWhenExpressible: true,
  },
  dependencies: { frozenCheck: 'none', kind: 'none', mandatoryFailingBase: false, failingBaseWhenExpressible: false },
  doc: { frozenCheck: 'none', kind: 'none', mandatoryFailingBase: false, failingBaseWhenExpressible: false },
  release: { frozenCheck: 'none', kind: 'none', mandatoryFailingBase: false, failingBaseWhenExpressible: false },
  refactor: {
    frozenCheck: 'existing tests',
    kind: 'none',
    mandatoryFailingBase: false,
    failingBaseWhenExpressible: false,
  },
};

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

export function beforeProofKind(type: IssueType): BeforeProofKind {
  return BEFORE_PROOF_EXPECTATIONS[type].kind;
}

export function requiresFailingBase(type: IssueType): boolean {
  return BEFORE_PROOF_EXPECTATIONS[type].mandatoryFailingBase;
}

export function evaluateBeforeProof(type: IssueType, observation: BeforeProofObservation): BeforeProofEvaluation {
  const expectation = BEFORE_PROOF_EXPECTATIONS[type];
  if (expectation.kind === 'base-score') {
    return observation.baseScore === null
      ? { valid: false, reason: REASON_BASE_SCORE_MISSING }
      : { valid: true, kind: 'base-score' };
  }
  if (expectation.mandatoryFailingBase) {
    return observation.checksFailedOnBase
      ? { valid: true, kind: 'fails-on-base' }
      : { valid: false, reason: REASON_CHECKS_PASS_ON_BASE };
  }
  if (expectation.failingBaseWhenExpressible) {
    if (!observation.checksExpressible) {
      return { valid: true, kind: 'none' };
    }
    return observation.checksFailedOnBase
      ? { valid: true, kind: 'fails-on-base' }
      : { valid: false, reason: REASON_CHECKS_PASS_ON_BASE };
  }
  return { valid: true, kind: 'none' };
}
