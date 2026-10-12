import type { AuditReason, AuditState } from '@agent-factory/domain';
import type { EventStore, FactoryEventRecord } from '../ports.ts';
import type { AuditFinding } from './audit-verdict.ts';
import {
  AUDIT_CONCLUDED_EVENT,
  AUDIT_DETECTED_EVENT,
  AUDIT_FAILED_EVENT,
  AUDIT_ISSUE_DRAFTED_EVENT,
  AUDIT_ISSUE_PUBLISHED_EVENT,
  AUDIT_RESOLVED_EVENT,
  AUDIT_SKIPPED_EVENT,
  AUDIT_STARTED_EVENT,
  AUDIT_SUBJECT_PREFIX,
  AuditConcludedPayloadSchema,
  AuditDetectedPayloadSchema,
  AuditFailedPayloadSchema,
  AuditIssueDraftedPayloadSchema,
  AuditIssuePublishedPayloadSchema,
  AuditSkippedPayloadSchema,
  auditSubject,
} from './events.ts';

export interface AuditConclusion {
  readonly runId: string;
  readonly summary: string;
  readonly findings: readonly AuditFinding[];
  readonly proposedFix: string | null;
}

export interface AuditIssueDraft {
  readonly title: string;
  readonly body: string;
}

export interface AuditRecord {
  readonly id: string;
  readonly commitSha: string;
  readonly reason: AuditReason;
  readonly commitMessage: string;
  readonly authorLogin: string | null;
  readonly pullRequestNumber: number | null;
  readonly pullRequestBranch: string | null;
  readonly state: AuditState;
  readonly conclusion: AuditConclusion | null;
  readonly failureCount: number;
  readonly lastFailure: string | null;
  readonly draft: AuditIssueDraft | null;
  readonly publishedIssueNumber: number | null;
  readonly resolved: boolean;
}

const FIRST_SEQUENCE = 0;

function startRecord(event: FactoryEventRecord): AuditRecord {
  const detected = AuditDetectedPayloadSchema.parse(event.payload);
  return {
    id: event.subject.slice(AUDIT_SUBJECT_PREFIX.length),
    commitSha: detected.commitSha,
    reason: detected.reason,
    commitMessage: detected.commitMessage,
    authorLogin: detected.authorLogin,
    pullRequestNumber: detected.pullRequestNumber,
    pullRequestBranch: detected.pullRequestBranch,
    state: 'detected',
    conclusion: null,
    failureCount: 0,
    lastFailure: null,
    draft: null,
    publishedIssueNumber: null,
    resolved: false,
  };
}

function applyEvent(record: AuditRecord, event: FactoryEventRecord): AuditRecord {
  switch (event.type) {
    case AUDIT_STARTED_EVENT:
      return { ...record, state: 'auditing' };
    case AUDIT_FAILED_EVENT: {
      const failure = AuditFailedPayloadSchema.parse(event.payload);
      return { ...record, failureCount: record.failureCount + 1, lastFailure: failure.reason };
    }
    case AUDIT_CONCLUDED_EVENT: {
      const concluded = AuditConcludedPayloadSchema.parse(event.payload);
      const { runId, summary, findings, proposedFix } = concluded;
      return { ...record, state: concluded.verdict, conclusion: { runId, summary, findings, proposedFix } };
    }
    case AUDIT_ISSUE_DRAFTED_EVENT:
      return { ...record, draft: AuditIssueDraftedPayloadSchema.parse(event.payload) };
    case AUDIT_ISSUE_PUBLISHED_EVENT:
      return { ...record, publishedIssueNumber: AuditIssuePublishedPayloadSchema.parse(event.payload).issueNumber };
    case AUDIT_RESOLVED_EVENT:
      return { ...record, resolved: true };
    default:
      return record;
  }
}

export function foldAuditEvents(events: readonly FactoryEventRecord[]): readonly AuditRecord[] {
  const records = new Map<string, AuditRecord>();
  for (const event of events) {
    const current = records.get(event.subject);
    if (event.type === AUDIT_DETECTED_EVENT) {
      if (current === undefined) records.set(event.subject, startRecord(event));
    } else if (current !== undefined) {
      records.set(event.subject, applyEvent(current, event));
    }
  }
  return [...records.values()];
}

/** A change of another automation, recorded without an audit. */
export interface SkippedChange {
  readonly commitSha: string;
  readonly automation: string;
  readonly commitMessage: string;
  readonly authorLogin: string | null;
  readonly pullRequestNumber: number | null;
  readonly pullRequestBranch: string | null;
  readonly recordedAt: Date;
}

/** The skipped changes the operator has not since asked to audit. */
export function foldSkippedChanges(events: readonly FactoryEventRecord[]): readonly SkippedChange[] {
  const audited = new Set(events.filter((event) => event.type === AUDIT_DETECTED_EVENT).map((event) => event.subject));
  const skipped = new Map<string, SkippedChange>();
  for (const event of events) {
    if (event.type !== AUDIT_SKIPPED_EVENT || audited.has(event.subject) || skipped.has(event.subject)) continue;
    skipped.set(event.subject, { ...AuditSkippedPayloadSchema.parse(event.payload), recordedAt: event.occurredAt });
  }
  return [...skipped.values()];
}

export async function loadSkippedChanges(events: EventStore): Promise<readonly SkippedChange[]> {
  return foldSkippedChanges(await events.read(AUDIT_SUBJECT_PREFIX, FIRST_SEQUENCE));
}

export async function loadAudits(events: EventStore): Promise<readonly AuditRecord[]> {
  return foldAuditEvents(await events.read(AUDIT_SUBJECT_PREFIX, FIRST_SEQUENCE));
}

export async function loadAudit(events: EventStore, auditId: string): Promise<AuditRecord | null> {
  const subject = auditSubject(auditId);
  const records = foldAuditEvents((await events.read(subject, FIRST_SEQUENCE)).filter((event) => event.subject === subject));
  return records[0] ?? null;
}
