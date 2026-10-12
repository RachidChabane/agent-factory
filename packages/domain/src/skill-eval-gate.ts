export const DEFAULT_MINIMUM_TARGETED_DELTA = 0.1;
export const DEFAULT_REGRESSION_TOLERANCE = 0.05;

export interface SkillEvalThresholds {
  readonly minimumTargetedDelta: number;
  readonly regressionTolerance: number;
}

export const DEFAULT_SKILL_EVAL_THRESHOLDS: SkillEvalThresholds = {
  minimumTargetedDelta: DEFAULT_MINIMUM_TARGETED_DELTA,
  regressionTolerance: DEFAULT_REGRESSION_TOLERANCE,
};

export interface SkillEvalCase {
  readonly caseId: string;
  readonly targeted: boolean;
  readonly baseScores: readonly number[];
  readonly branchScores: readonly number[];
}

export interface CaseDelta {
  readonly caseId: string;
  readonly delta: number;
}

export interface SkillEvalVerdict {
  readonly passed: boolean;
  readonly targetedDelta: number | null;
  readonly regressions: readonly CaseDelta[];
  readonly reasons: readonly string[];
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function caseDelta(evalCase: SkillEvalCase): CaseDelta {
  return { caseId: evalCase.caseId, delta: mean(evalCase.branchScores) - mean(evalCase.baseScores) };
}

export function evaluateSkillEval(
  cases: readonly SkillEvalCase[],
  thresholds: SkillEvalThresholds = DEFAULT_SKILL_EVAL_THRESHOLDS,
): SkillEvalVerdict {
  const reasons: string[] = [];
  const incomplete = cases.filter((c) => c.baseScores.length === 0 || c.branchScores.length === 0);
  for (const evalCase of incomplete) {
    reasons.push(`case ${evalCase.caseId} has no scores on base or branch`);
  }
  const scored = cases.filter((c) => !incomplete.includes(c));
  const targeted = scored.filter((c) => c.targeted).map(caseDelta);
  const regressions = scored
    .filter((c) => !c.targeted)
    .map(caseDelta)
    .filter((entry) => entry.delta < -thresholds.regressionTolerance);

  const targetedDelta = targeted.length === 0 ? null : mean(targeted.map((entry) => entry.delta));
  if (targetedDelta === null) {
    reasons.push('no targeted case was scored');
  } else if (targetedDelta < thresholds.minimumTargetedDelta) {
    reasons.push(`targeted delta ${targetedDelta} is below the minimum ${thresholds.minimumTargetedDelta}`);
  }
  for (const regression of regressions) {
    reasons.push(`case ${regression.caseId} regressed by ${-regression.delta}`);
  }
  return { passed: reasons.length === 0, targetedDelta, regressions, reasons };
}
