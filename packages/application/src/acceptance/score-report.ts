import { z } from 'zod';
import type { SkillEvalCase } from '@agent-factory/domain';

export const ScoreCaseSchema = z.strictObject({
  id: z.string().min(1),
  /** What the case checks, in words, when the evaluation names it. */
  label: z.string().min(1).optional(),
  targeted: z.boolean(),
  scores: z.array(z.number().finite()).min(1),
});

export const ScoreReportSchema = z.strictObject({
  cases: z.array(ScoreCaseSchema).min(1),
});

export type ScoreReport = z.infer<typeof ScoreReportSchema>;

export type ScoreReportReading =
  | { readonly valid: true; readonly report: ScoreReport }
  | { readonly valid: false; readonly problem: string };

export function readScoreReport(path: string, raw: string | null): ScoreReportReading {
  if (raw === null) return { valid: false, problem: `score output ${path} was not written` };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return { valid: false, problem: `score output ${path} is not JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const parsed = ScoreReportSchema.safeParse(json);
  if (!parsed.success) {
    return {
      valid: false,
      problem: `score output ${path} does not match the score format: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'report'}: ${issue.message}`)
        .join('; ')}`,
    };
  }
  return { valid: true, report: parsed.data };
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function targetedScore(report: ScoreReport): number | null {
  const targeted = report.cases.filter((entry) => entry.targeted);
  return targeted.length === 0 ? null : mean(targeted.map((entry) => mean(entry.scores)));
}

export function skillEvalCases(base: ScoreReport, branch: ScoreReport): readonly SkillEvalCase[] {
  const ids = [...new Set([...base.cases, ...branch.cases].map((entry) => entry.id))];
  return ids.map((caseId) => {
    const before = base.cases.find((entry) => entry.id === caseId);
    const after = branch.cases.find((entry) => entry.id === caseId);
    return {
      caseId,
      targeted: after?.targeted ?? before?.targeted ?? false,
      baseScores: before?.scores ?? [],
      branchScores: after?.scores ?? [],
    };
  });
}
