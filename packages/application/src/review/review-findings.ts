import { z } from 'zod';
import { REVIEW_CATEGORIES, REVIEW_SEVERITIES } from '@agent-factory/domain';
import type { ReviewFinding } from '@agent-factory/domain';

const JSON_FENCE = /```json[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/g;
export const BLOCKING_SEVERITY = 'blocking';

export const ReviewFindingSchema = z.strictObject({
  severity: z.enum(REVIEW_SEVERITIES),
  category: z.enum(REVIEW_CATEGORIES),
  file: z.string().min(1).nullable(),
  line: z.number().int().positive().nullable(),
  summary: z.string().trim().min(1),
});

export const ReviewFindingListSchema = z.array(ReviewFindingSchema);
export const ReviewReportSchema = z.strictObject({ findings: ReviewFindingListSchema });

type FindingsParse = { readonly success: true; readonly data: readonly ReviewFinding[] } | { readonly success: false; readonly error: z.ZodError };

function findingsOf(json: unknown): FindingsParse {
  if (Array.isArray(json)) return ReviewFindingListSchema.safeParse(json);
  const report = ReviewReportSchema.safeParse(json);
  return report.success ? { success: true, data: report.data.findings } : { success: false, error: report.error };
}

export type ReviewReading =
  | { readonly valid: true; readonly findings: readonly ReviewFinding[] }
  | { readonly valid: false; readonly problem: string };

export function readReviewFindings(finalText: string): ReviewReading {
  const blocks = [...finalText.matchAll(JSON_FENCE)].map((match) => match[1] ?? '');
  const last = blocks.at(-1);
  if (last === undefined) return { valid: false, problem: 'the review has no ```json block of findings' };
  let json: unknown;
  try {
    json = JSON.parse(last);
  } catch (error) {
    return { valid: false, problem: `the findings block is not JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const parsed = findingsOf(json);
  if (!parsed.success) {
    return {
      valid: false,
      problem: `the findings block does not match the finding format: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'report'}: ${issue.message}`)
        .join('; ')}`,
    };
  }
  return { valid: true, findings: parsed.data };
}

export function blockingFindings(findings: readonly ReviewFinding[]): readonly ReviewFinding[] {
  return findings.filter((finding) => finding.severity === BLOCKING_SEVERITY);
}

export function describeFinding(finding: ReviewFinding): string {
  const location = finding.file === null ? '' : ` (${finding.file}${finding.line === null ? '' : `:${finding.line}`})`;
  return `[${finding.category}]${location} ${finding.summary}`;
}
