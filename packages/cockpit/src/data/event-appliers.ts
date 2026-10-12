import type { z } from 'zod';
import { ISSUE_ESCALATION_STATE } from '@agent-factory/domain';
import type { AuditView, CockpitSnapshot, FactoryEventRecord, IssueView, ReleaseView, RunView } from '../contract/index.ts';
import {
  AUDIT_CONCLUDED_EVENT,
  AUDIT_CURSOR_ADVANCED_EVENT,
  AUDIT_DETECTED_EVENT,
  AUDIT_FAILED_EVENT,
  AUDIT_ISSUE_DRAFTED_EVENT,
  AUDIT_ISSUE_PUBLISHED_EVENT,
  AUDIT_RESOLVED_EVENT,
  AUDIT_STARTED_EVENT,
  AUDIT_SUBJECT_PREFIX,
  AuditConcludedPayloadSchema,
  AuditDetectedPayloadSchema,
  AuditFailedPayloadSchema,
  AuditIssueDraftedPayloadSchema,
  AuditIssuePublishedPayloadSchema,
  AuditResolvedPayloadSchema,
  AuditStartedPayloadSchema,
  ISSUE_SUBJECT_PREFIX,
  ISSUE_TRANSITIONED_EVENT,
  IssueTransitionedPayloadSchema,
  PULL_REQUEST_OPENED_EVENT,
  PullRequestOpenedPayloadSchema,
  RELEASE_EVALUATED_EVENT,
  RUN_FINISHED_EVENT,
  RUN_STARTED_EVENT,
  RUN_SUBJECT_PREFIX,
  ReleaseEvaluatedPayloadSchema,
  RunFinishedPayloadSchema,
  RunStartedPayloadSchema,
  subjectId,
  subjectNumber,
} from '../contract/index.ts';

export type ApplyOutcome =
  | { readonly kind: 'applied'; readonly snapshot: CockpitSnapshot }
  | { readonly kind: 'ignored' }
  | { readonly kind: 'resync'; readonly reason: string }
  | { readonly kind: 'malformed'; readonly reason: string }
  | { readonly kind: 'unknown' };

type EventApplier = (snapshot: CockpitSnapshot, record: FactoryEventRecord) => ApplyOutcome;

const GATE_DRIVEN_RELEASE_STATES: readonly ReleaseView['state'][] = ['auditing', 'blocked', 'promotable'];

function malformed(record: FactoryEventRecord, error: z.ZodError): ApplyOutcome {
  return { kind: 'malformed', reason: `${record.type}: ${error.issues.map((issue) => issue.message).join('; ')}` };
}

function missing(record: FactoryEventRecord): ApplyOutcome {
  return { kind: 'resync', reason: `${record.type}: ${record.subject} is not in the snapshot` };
}

function withPayload<T>(
  schema: z.ZodType<T>,
  apply: (snapshot: CockpitSnapshot, payload: T, record: FactoryEventRecord) => ApplyOutcome,
): EventApplier {
  return (snapshot, record) => {
    const parsed = schema.safeParse(record.payload);
    return parsed.success ? apply(snapshot, parsed.data, record) : malformed(record, parsed.error);
  };
}

function replaceFirst<T>(items: readonly T[], matches: (item: T) => boolean, update: (item: T) => T): readonly T[] | null {
  const index = items.findIndex(matches);
  if (index < 0) return null;
  return items.map((item, position) => (position === index ? update(item) : item));
}

function updateIssue(
  snapshot: CockpitSnapshot,
  record: FactoryEventRecord,
  update: (issue: IssueView) => IssueView,
): ApplyOutcome {
  const number = subjectNumber(record.subject, ISSUE_SUBJECT_PREFIX);
  const issues = number === null ? null : replaceFirst(snapshot.issues, (issue) => issue.number === number, update);
  return issues === null ? missing(record) : { kind: 'applied', snapshot: { ...snapshot, issues: [...issues] } };
}

function updateAudit(
  snapshot: CockpitSnapshot,
  record: FactoryEventRecord,
  update: (audit: AuditView) => AuditView,
): ApplyOutcome {
  const id = subjectId(record.subject, AUDIT_SUBJECT_PREFIX);
  const audits = id === null ? null : replaceFirst(snapshot.audits, (audit) => audit.id === id, update);
  return audits === null ? missing(record) : { kind: 'applied', snapshot: { ...snapshot, audits: [...audits] } };
}

function updateRun(snapshot: CockpitSnapshot, record: FactoryEventRecord, update: (run: RunView) => RunView): ApplyOutcome {
  const id = subjectId(record.subject, RUN_SUBJECT_PREFIX);
  const runs = id === null ? null : replaceFirst(snapshot.runs, (run) => run.id === id, update);
  return runs === null ? missing(record) : { kind: 'applied', snapshot: { ...snapshot, runs: [...runs] } };
}

const applyIssueTransition = withPayload(IssueTransitionedPayloadSchema, (snapshot, payload, record) =>
  updateIssue(snapshot, record, (issue) => {
    const escalated = payload.to === ISSUE_ESCALATION_STATE;
    return {
      ...issue,
      state: payload.to,
      resumeTarget: escalated ? (payload.from ?? issue.state) : null,
      escalation: escalated ? { reason: payload.reason, diagnosis: payload.reason, since: record.occurredAt } : null,
      updatedAt: record.occurredAt,
    };
  }),
);

const applyAuditDetected = withPayload(AuditDetectedPayloadSchema, (snapshot, _payload, record) => {
  const id = subjectId(record.subject, AUDIT_SUBJECT_PREFIX);
  const known = snapshot.audits.some((audit) => audit.id === id);
  return known ? { kind: 'ignored' } : { kind: 'resync', reason: `${record.type}: new audit ${record.subject}` };
});

const applyAuditStarted = withPayload(AuditStartedPayloadSchema, (snapshot, _payload, record) =>
  updateAudit(snapshot, record, (audit) => ({ ...audit, state: 'auditing' })),
);

const applyAuditFailed = withPayload(AuditFailedPayloadSchema, (snapshot, payload, record) =>
  updateAudit(snapshot, record, (audit) => ({
    ...audit,
    failureCount: audit.failureCount + 1,
    lastFailure: payload.reason,
  })),
);

const applyAuditConcluded = withPayload(AuditConcludedPayloadSchema, (snapshot, payload, record) =>
  updateAudit(snapshot, record, (audit) => ({
    ...audit,
    state: payload.verdict,
    conclusion: {
      runId: payload.runId,
      summary: payload.summary,
      findings: payload.findings,
      proposedFix: payload.proposedFix,
    },
  })),
);

const applyAuditDrafted = withPayload(AuditIssueDraftedPayloadSchema, (snapshot, payload, record) =>
  updateAudit(snapshot, record, (audit) => ({ ...audit, draft: payload })),
);

const applyAuditPublished = withPayload(AuditIssuePublishedPayloadSchema, (snapshot, payload, record) =>
  updateAudit(snapshot, record, (audit) => ({ ...audit, publishedIssueNumber: payload.issueNumber })),
);

const applyAuditResolved = withPayload(AuditResolvedPayloadSchema, (snapshot, payload, record) =>
  updateAudit(snapshot, record, (audit) => ({ ...audit, resolved: true, resolutionNote: payload.note })),
);

const applyPullRequestOpened = withPayload(PullRequestOpenedPayloadSchema, (snapshot, payload, record) => {
  const pullRequests = replaceFirst(
    snapshot.pullRequests,
    (pullRequest) => pullRequest.number === payload.number,
    (pullRequest) => ({ ...pullRequest, evidenceComplete: payload.evidenceComplete }),
  );
  return pullRequests === null ? missing(record) : { kind: 'applied', snapshot: { ...snapshot, pullRequests: [...pullRequests] } };
});

const applyReleaseEvaluated = withPayload(ReleaseEvaluatedPayloadSchema, (snapshot, payload, record) => {
  const releases = replaceFirst(
    snapshot.releases,
    (release) => release.id === payload.releaseId,
    (release) => ({
      ...release,
      state: GATE_DRIVEN_RELEASE_STATES.includes(release.state)
        ? payload.promotable
          ? 'promotable'
          : 'blocked'
        : release.state,
      gate: { promotable: payload.promotable, blockingReasons: payload.blockingReasons, evaluatedAt: record.occurredAt },
      report: payload.report,
    }),
  );
  return releases === null ? missing(record) : { kind: 'applied', snapshot: { ...snapshot, releases: [...releases] } };
});

const applyRunStarted = withPayload(RunStartedPayloadSchema, (snapshot, payload) => {
  const others = snapshot.runs.filter((run) => run.id !== payload.id);
  return { kind: 'applied', snapshot: { ...snapshot, runs: [payload, ...others] } };
});

const applyRunFinished = withPayload(RunFinishedPayloadSchema, (snapshot, payload, record) =>
  updateRun(snapshot, record, (run) => ({
    ...run,
    status: payload.status,
    outcome: payload.outcome,
    endedAt: payload.endedAt,
    usage: payload.usage,
    costUsd: payload.costUsd,
    turns: payload.turns,
    currentTool: null,
    pendingQuestion: null,
  })),
);

const ignore: EventApplier = () => ({ kind: 'ignored' });

export const EVENT_APPLIERS: Readonly<Record<string, EventApplier>> = {
  [ISSUE_TRANSITIONED_EVENT]: applyIssueTransition,
  [AUDIT_DETECTED_EVENT]: applyAuditDetected,
  [AUDIT_STARTED_EVENT]: applyAuditStarted,
  [AUDIT_FAILED_EVENT]: applyAuditFailed,
  [AUDIT_CONCLUDED_EVENT]: applyAuditConcluded,
  [AUDIT_ISSUE_DRAFTED_EVENT]: applyAuditDrafted,
  [AUDIT_ISSUE_PUBLISHED_EVENT]: applyAuditPublished,
  [AUDIT_RESOLVED_EVENT]: applyAuditResolved,
  [AUDIT_CURSOR_ADVANCED_EVENT]: ignore,
  [PULL_REQUEST_OPENED_EVENT]: applyPullRequestOpened,
  [RELEASE_EVALUATED_EVENT]: applyReleaseEvaluated,
  [RUN_STARTED_EVENT]: applyRunStarted,
  [RUN_FINISHED_EVENT]: applyRunFinished,
};

export function applyFactoryEvent(snapshot: CockpitSnapshot, record: FactoryEventRecord): ApplyOutcome {
  const applier = EVENT_APPLIERS[record.type];
  return applier === undefined ? { kind: 'unknown' } : applier(snapshot, record);
}
