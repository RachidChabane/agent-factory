import { z } from 'zod';
import { AUDIT_REASONS } from '@agent-factory/domain';
import { AuditVerdictSchema } from './audit-verdict.ts';

export const AUDIT_CURSOR_ADVANCED_EVENT = 'audit.cursor.advanced';
export const AUDIT_DETECTED_EVENT = 'audit.detected';
export const AUDIT_STARTED_EVENT = 'audit.started';
export const AUDIT_FAILED_EVENT = 'audit.failed';
export const AUDIT_CONCLUDED_EVENT = 'audit.concluded';
export const AUDIT_ISSUE_DRAFTED_EVENT = 'audit.issue.drafted';
export const AUDIT_ISSUE_PUBLISHED_EVENT = 'audit.issue.published';
export const AUDIT_RESOLVED_EVENT = 'audit.resolved';

export const AUDIT_SUBJECT_PREFIX = 'audit/';
export const WATCHER_SUBJECT_PREFIX = 'watcher/';

export function auditSubject(auditId: string): string {
  return `${AUDIT_SUBJECT_PREFIX}${auditId}`;
}

export function watcherSubject(branch: string): string {
  return `${WATCHER_SUBJECT_PREFIX}${branch}`;
}

export const CursorAdvancedPayloadSchema = z.object({ branch: z.string(), sha: z.string() });
export type CursorAdvancedPayload = z.infer<typeof CursorAdvancedPayloadSchema>;

export const AuditDetectedPayloadSchema = z.object({
  commitSha: z.string(),
  reason: z.enum(AUDIT_REASONS),
  commitMessage: z.string(),
  authorLogin: z.string().nullable(),
  pullRequestNumber: z.number().int().nullable(),
});
export type AuditDetectedPayload = z.infer<typeof AuditDetectedPayloadSchema>;

export const AuditStartedPayloadSchema = z.object({ runId: z.string() });
export type AuditStartedPayload = z.infer<typeof AuditStartedPayloadSchema>;

export const AuditFailedPayloadSchema = z.object({ runId: z.string(), reason: z.string() });
export type AuditFailedPayload = z.infer<typeof AuditFailedPayloadSchema>;

export const AuditConcludedPayloadSchema = AuditVerdictSchema.extend({ runId: z.string() });
export type AuditConcludedPayload = z.infer<typeof AuditConcludedPayloadSchema>;

export const AuditIssueDraftedPayloadSchema = z.object({ title: z.string(), body: z.string() });
export type AuditIssueDraftedPayload = z.infer<typeof AuditIssueDraftedPayloadSchema>;

export const AuditIssuePublishedPayloadSchema = z.object({ issueNumber: z.number().int() });
export type AuditIssuePublishedPayload = z.infer<typeof AuditIssuePublishedPayloadSchema>;

export const AuditResolvedPayloadSchema = z.object({ note: z.string() });
export type AuditResolvedPayload = z.infer<typeof AuditResolvedPayloadSchema>;
