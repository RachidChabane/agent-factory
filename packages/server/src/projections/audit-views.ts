import type { AuditView, SkippedChangeView } from '@agent-factory/cockpit';
import {
  AUDIT_DETECTED_EVENT,
  AUDIT_RESOLVED_EVENT,
  AUDIT_SUBJECT_PREFIX,
  AuditResolvedPayloadSchema,
  auditSubject,
  foldAuditEvents,
  foldSkippedChanges,
} from '@agent-factory/application';
import { suggestTypeForPaths } from '@agent-factory/domain';
import { firstOf, iso, lastOf, type EventIndex } from './event-index.ts';
import type { ProjectSnapshotContext } from './snapshot-context.ts';

function auditRecords(index: EventIndex) {
  return index.subjectsWithPrefix(AUDIT_SUBJECT_PREFIX).flatMap((subject) => index.subject(subject)).sort((left, right) => left.sequence - right.sequence);
}

export function projectAudits(index: EventIndex, releaseOfCommit: ReadonlyMap<string, string>, context: ProjectSnapshotContext): AuditView[] {
  return foldAuditEvents(auditRecords(index))
    .map((audit): AuditView => {
      const subjectRecords = index.subject(auditSubject(audit.id));
      const detected = firstOf(subjectRecords, AUDIT_DETECTED_EVENT);
      const resolved = lastOf(subjectRecords, AUDIT_RESOLVED_EVENT);
      const changedFiles = context.changedFiles.get(audit.commitSha) ?? null;
      return {
        id: audit.id,
        commitSha: audit.commitSha,
        reason: audit.reason,
        commitMessage: audit.commitMessage,
        authorLogin: audit.authorLogin,
        pullRequestNumber: audit.pullRequestNumber,
        branch: audit.pullRequestBranch,
        state: audit.state,
        detectedAt: iso(detected?.occurredAt ?? context.generatedAt),
        changedFiles: changedFiles === null ? null : [...changedFiles],
        suggestedType: changedFiles === null ? null : (suggestTypeForPaths(context.conventions.typology, changedFiles)?.id ?? null),
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

export function projectSkippedChanges(index: EventIndex): SkippedChangeView[] {
  return foldSkippedChanges(auditRecords(index))
    .map((change) => ({
      commitSha: change.commitSha,
      automation: change.automation,
      commitMessage: change.commitMessage,
      authorLogin: change.authorLogin,
      pullRequestNumber: change.pullRequestNumber,
      branch: change.pullRequestBranch,
      recordedAt: iso(change.recordedAt),
    }))
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
}

/** The audits whose changed files the cockpit has not read yet. */
export function auditsWithoutFiles(index: EventIndex, known: ReadonlyMap<string, readonly string[]>): readonly string[] {
  return foldAuditEvents(auditRecords(index))
    .map((audit) => audit.commitSha)
    .filter((sha) => !known.has(sha));
}
