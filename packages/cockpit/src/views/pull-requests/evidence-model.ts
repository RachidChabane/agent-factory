import { evaluateSkillEval } from '@agent-factory/domain';
import type { AcceptanceTestRowView, EvalCaseScore, Evidence, RunOutcomeSummary } from '../../contract/index.ts';

export type EvidenceOf<Kind extends Evidence['kind']> = Extract<Evidence, { kind: Kind }>;

export type MediaEvidence = EvidenceOf<'image-compare' | 'recording'>;

export function isMediaEvidence(evidence: Evidence): evidence is MediaEvidence {
  return evidence.kind === 'image-compare' || evidence.kind === 'recording';
}

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/** The size of an image, or null when its file could not be read as one or declares an empty size. */
export function measuredSize(evidence: Pick<EvidenceOf<'image-compare'>, 'width' | 'height'>): ImageSize | null {
  const { width, height } = evidence;
  return width !== null && height !== null && width > 0 && height > 0 ? { width, height } : null;
}

export const RUN_COUNT_KINDS = ['failed', 'passed', 'skipped'] as const;
export type RunCountKind = (typeof RUN_COUNT_KINDS)[number];

export interface RunCount {
  readonly kind: RunCountKind;
  readonly count: number;
}

/** The outcomes of a run worth stating, failures first; empty when no test ran at all. */
export function runCounts(summary: Pick<RunOutcomeSummary, RunCountKind>): readonly RunCount[] {
  return RUN_COUNT_KINDS.map((kind) => ({ kind, count: summary[kind] })).filter((entry) => entry.count > 0);
}

export interface CriterionGroup {
  readonly criterion: number;
  /** The wording of the criterion; null when the pull request records none for this number. */
  readonly text: string | null;
  readonly rows: readonly AcceptanceTestRowView[];
}

/** The tests grouped under their criterion, in numeric order; a criterion no test covers still appears, with no row. */
export function criterionGroups(evidence: Pick<EvidenceOf<'acceptance-tests'>, 'criteria' | 'rows'>): readonly CriterionGroup[] {
  const numbers = [...new Set([...evidence.criteria.map((entry) => entry.criterion), ...evidence.rows.map((row) => row.criterion)])].toSorted((left, right) => left - right);
  return numbers.map((criterion) => ({
    criterion,
    text: evidence.criteria.find((entry) => entry.criterion === criterion)?.text ?? null,
    rows: evidence.rows.filter((row) => row.criterion === criterion),
  }));
}

export const SCORE_FRACTION_DIGITS = 2;
const FULL_SCORE = 1;
const PERCENT = 100;

export type ScoreDirection = 'up' | 'down' | 'flat';

/** The direction of a score change as it reads once rounded, so that a change shown as 0.00 is never signed. */
export function scoreDirection(delta: number): ScoreDirection {
  const rounded = Number(delta.toFixed(SCORE_FRACTION_DIGITS));
  if (rounded > 0) return 'up';
  return rounded < 0 ? 'down' : 'flat';
}

/** The width of a score bar, kept inside the track whatever the score the factory recorded. */
export function scoreWidthPercent(score: number): number {
  return Math.min(FULL_SCORE, Math.max(0, score)) * PERCENT;
}

export interface EvalCaseRow {
  readonly entry: EvalCaseScore;
  /** What the case checks, or its identifier when the evaluation names none. */
  readonly name: string;
  readonly delta: number;
  readonly regression: boolean;
}

export interface EvalSummary {
  readonly passed: boolean;
  /** The mean gain over the targeted cases; null when no case is targeted. */
  readonly targetedDelta: number | null;
  readonly regressions: number;
  /** The targeted cases first, then the others, each group in the order of the report. */
  readonly cases: readonly EvalCaseRow[];
}

export function summarizeEval(evidence: Pick<EvidenceOf<'eval-scores'>, 'cases' | 'minimumDelta' | 'regressionTolerance'>): EvalSummary {
  const verdict = evaluateSkillEval(
    evidence.cases.map((entry) => ({ caseId: entry.caseId, targeted: entry.targeted, baseScores: [entry.baseScore], branchScores: [entry.branchScore] })),
    { minimumTargetedDelta: evidence.minimumDelta, regressionTolerance: evidence.regressionTolerance },
  );
  const regressed = new Set(verdict.regressions.map((regression) => regression.caseId));
  const cases = evidence.cases
    .map((entry) => ({ entry, name: entry.label ?? entry.caseId, delta: entry.branchScore - entry.baseScore, regression: regressed.has(entry.caseId) }))
    .toSorted((left, right) => Number(right.entry.targeted) - Number(left.entry.targeted));
  return { passed: verdict.passed, targetedDelta: verdict.targetedDelta, regressions: verdict.regressions.length, cases };
}
