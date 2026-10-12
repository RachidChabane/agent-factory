import { z } from 'zod';
import { AUDIT_VERDICTS } from '@agent-factory/domain';

export const AUDIT_FINDING_LEVELS = ['intent', 'idea', 'method'] as const;
export type AuditFindingLevel = (typeof AUDIT_FINDING_LEVELS)[number];

export const AuditFindingSchema = z.object({
  level: z.enum(AUDIT_FINDING_LEVELS),
  statement: z.string().min(1),
  evidence: z.string().min(1),
});
export type AuditFinding = z.infer<typeof AuditFindingSchema>;

export const AuditVerdictSchema = z.object({
  verdict: z.enum(AUDIT_VERDICTS),
  summary: z.string().min(1),
  findings: z.array(AuditFindingSchema),
  proposedFix: z.string().min(1).nullable(),
});
export type AuditVerdictReport = z.infer<typeof AuditVerdictSchema>;

const JSON_FENCE_PATTERN = /```json\s*([\s\S]*?)```/g;
const FENCE_CAPTURE_GROUP = 1;

export type AuditVerdictParse =
  | { readonly ok: true; readonly report: AuditVerdictReport }
  | { readonly ok: false; readonly reason: string };

export const REASON_NO_JSON_BLOCK = 'the answer contains no fenced json block';

export function parseAuditVerdict(finalText: string): AuditVerdictParse {
  const blocks = [...finalText.matchAll(JSON_FENCE_PATTERN)];
  const last = blocks.at(-1)?.[FENCE_CAPTURE_GROUP];
  if (last === undefined) return { ok: false, reason: REASON_NO_JSON_BLOCK };
  let json: unknown;
  try {
    json = JSON.parse(last);
  } catch (error) {
    return { ok: false, reason: `the json block is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const parsed = AuditVerdictSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: `the json block does not match the verdict schema: ${parsed.error.message}` };
  return { ok: true, report: parsed.data };
}
