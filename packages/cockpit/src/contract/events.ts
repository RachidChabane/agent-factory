import { z } from 'zod';
import { AUDIT_REASONS, AUDIT_VERDICTS, ISSUE_STATES, ISSUE_TRANSITIONED_EVENT } from '@agent-factory/domain';
import { AmountSchema, CountSchema, IsoDateTimeSchema, IssueNumberSchema, TokenUsageSchema } from './primitives.ts';
import { AuditFindingViewSchema, RunViewSchema } from './snapshot.ts';
import { AGENT_RUN_OUTCOMES, RUN_STATUSES } from './vocabulary.ts';

export const FactoryEventRecordSchema = z.object({
  sequence: CountSchema,
  occurredAt: IsoDateTimeSchema,
  type: z.string().min(1),
  subject: z.string(),
  payload: z.unknown(),
});
export type FactoryEventRecord = z.infer<typeof FactoryEventRecordSchema>;

export { ISSUE_TRANSITIONED_EVENT };
export const AUDIT_DETECTED_EVENT = 'audit.detected';
export const AUDIT_STARTED_EVENT = 'audit.started';
export const AUDIT_FAILED_EVENT = 'audit.failed';
export const AUDIT_CONCLUDED_EVENT = 'audit.concluded';
export const AUDIT_ISSUE_DRAFTED_EVENT = 'audit.issue.drafted';
export const AUDIT_ISSUE_PUBLISHED_EVENT = 'audit.issue.published';
export const AUDIT_RESOLVED_EVENT = 'audit.resolved';
export const AUDIT_CURSOR_ADVANCED_EVENT = 'audit.cursor.advanced';
export const PULL_REQUEST_OPENED_EVENT = 'pr.opened';
export const RELEASE_EVALUATED_EVENT = 'release.evaluated';
export const RUN_STARTED_EVENT = 'run.started';
export const RUN_FINISHED_EVENT = 'run.finished';

export const ISSUE_SUBJECT_PREFIX = 'issue/';
export const AUDIT_SUBJECT_PREFIX = 'audit/';
export const PULL_REQUEST_SUBJECT_PREFIX = 'pr/';
export const RELEASE_SUBJECT_PREFIX = 'release/';
export const RUN_SUBJECT_PREFIX = 'run/';

export const IssueTransitionedPayloadSchema = z.object({
  from: z.enum(ISSUE_STATES).nullable(),
  to: z.enum(ISSUE_STATES),
  reason: z.string(),
});
export type IssueTransitionedPayload = z.infer<typeof IssueTransitionedPayloadSchema>;

export const AuditDetectedPayloadSchema = z.object({
  commitSha: z.string(),
  reason: z.enum(AUDIT_REASONS),
  commitMessage: z.string(),
  authorLogin: z.string().nullable(),
  pullRequestNumber: z.number().int().nullable(),
});
export const AuditStartedPayloadSchema = z.object({ runId: z.string() });
export const AuditFailedPayloadSchema = z.object({ runId: z.string(), reason: z.string() });
export const AuditConcludedPayloadSchema = z.object({
  runId: z.string(),
  verdict: z.enum(AUDIT_VERDICTS),
  summary: z.string().min(1),
  findings: z.array(AuditFindingViewSchema),
  proposedFix: z.string().min(1).nullable(),
});
export const AuditIssueDraftedPayloadSchema = z.object({ title: z.string(), body: z.string() });
export const AuditIssuePublishedPayloadSchema = z.object({ issueNumber: z.number().int() });
export const AuditResolvedPayloadSchema = z.object({ note: z.string() });

export const PullRequestOpenedPayloadSchema = z.object({ number: z.number().int(), evidenceComplete: z.boolean() });

export const ReleaseEvaluatedPayloadSchema = z.object({
  releaseId: z.string(),
  promotable: z.boolean(),
  blockingReasons: z.array(z.string()),
  commitShas: z.array(z.string()),
  report: z.string(),
});

export const RunStartedPayloadSchema = RunViewSchema;

export const RunFinishedPayloadSchema = z.object({
  status: z.enum(RUN_STATUSES),
  outcome: z.enum(AGENT_RUN_OUTCOMES),
  endedAt: IsoDateTimeSchema,
  usage: TokenUsageSchema,
  costUsd: AmountSchema,
  turns: CountSchema,
});

export function subjectId(subject: string, prefix: string): string | null {
  return subject.startsWith(prefix) ? subject.slice(prefix.length) : null;
}

export function subjectNumber(subject: string, prefix: string): number | null {
  const id = subjectId(subject, prefix);
  if (id === null) return null;
  const parsed = IssueNumberSchema.safeParse(Number(id));
  return parsed.success ? parsed.data : null;
}
