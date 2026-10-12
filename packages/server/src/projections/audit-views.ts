import type { AuditView } from '@agent-factory/cockpit';
import {
  AUDIT_DETECTED_EVENT,
  AUDIT_RESOLVED_EVENT,
  AUDIT_SUBJECT_PREFIX,
  AuditResolvedPayloadSchema,
  foldAuditEvents,
  auditSubject,
} from '@agent-factory/application';
import { firstOf, iso, lastOf, type EventIndex } from './event-index.ts';

export function projectAudits(index: EventIndex, releaseOfCommit: ReadonlyMap<string, string>): AuditView[] {
  const records = index.subjectsWithPrefix(AUDIT_SUBJECT_PREFIX).flatMap((subject) => index.subject(subject));
  return foldAuditEvents(records)
    .map((audit): AuditView => {
      const subjectRecords = index.subject(auditSubject(audit.id));
      const detected = firstOf(subjectRecords, AUDIT_DETECTED_EVENT);
      const resolved = lastOf(subjectRecords, AUDIT_RESOLVED_EVENT);
      return {
        id: audit.id,
        commitSha: audit.commitSha,
        reason: audit.reason,
        commitMessage: audit.commitMessage,
        authorLogin: audit.authorLogin,
        authorName: null,
        pullRequestNumber: audit.pullRequestNumber,
        branch: null,
        state: audit.state,
        detectedAt: iso(detected?.occurredAt ?? new Date(0)),
        changedFiles: [],
        suggestedType: null,
        releaseId: releaseOfCommit.get(audit.commitSha) ?? null,
        conclusion:
          audit.conclusion === null
            ? null
            : {
                runId: audit.conclusion.runId,
                summary: audit.conclusion.summary,
                findings: [...audit.conclusion.findings],
                proposedFix: audit.conclusion.proposedFix,
              },
        failureCount: audit.failureCount,
        lastFailure: audit.lastFailure,
        draft: audit.draft,
        publishedIssueNumber: audit.publishedIssueNumber,
        resolved: audit.resolved,
        resolutionNote: resolved === null ? null : AuditResolvedPayloadSchema.parse(resolved.payload).note,
      };
    })
    .sort((left, right) => right.detectedAt.localeCompare(left.detectedAt));
}
