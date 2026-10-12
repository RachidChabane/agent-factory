import type { z } from 'zod';
import { ISSUE_ESCALATION_STATE, ISSUE_TRANSITIONED_EVENT, issueSubject } from '@agent-factory/domain';
import type { IssueSpec, IssueState } from '@agent-factory/domain';
import type { AcceptanceManifest } from '../acceptance/acceptance-manifest.ts';
import type { EventStore, FactoryEventRecord, PullRequestRef, Worktree } from '../ports.ts';
import {
  AcceptanceAuthoredSchema,
  AgentRunFinishedSchema,
  AuthoringRestartedSchema,
  BeforeProofCorrectionRequestedSchema,
  BeforeProofRecordedSchema,
  BranchPushedSchema,
  CheckRewriteAuthoredSchema,
  CheckRewriteOrderedSchema,
  CheckRewriteProvedSchema,
  CheckRewriteStartedSchema,
  CheckRewrittenSchema,
  WorkspacePreparedSchema,
  ChecksFrozenSchema,
  CommitRecordedSchema,
  DecisionAnsweredSchema,
  EvidenceCommittedSchema,
  EvidenceRemovedSchema,
  ExternalFeedbackReceivedSchema,
  GateCompletedSchema,
  ImplementerAttemptFinishedSchema,
  IssueTransitionedPayloadSchema,
  PIPELINE_EVENTS,
  PullRequestMergedSchema,
  PullRequestOpenedSchema,
  PullRequestUpdatedSchema,
  RetryDecidedSchema,
  ReviewCompletedSchema,
  SpecCapturedSchema,
  WorktreeAcquiredSchema,
  WorktreeReleasedSchema,
  type AgentRunFinished,
  type BeforeProofCorrectionRecord,
  type BeforeProofRecord,
  type CheckRewriteAuthoredRecord,
  type CheckRewriteOrder,
  type CheckRewrittenRecord,
  type DecisionAnswerRecord,
  type FileFingerprint,
  type EvidenceRecord,
  type EvidenceRemovalRecord,
  type ExternalFeedbackRecord,
  type FrozenRecord,
  type GateRecord,
  type ImplementerAttemptRecord,
  type RetryRecord,
  type ReviewRecord,
} from './journal-events.ts';

const FIRST_SEQUENCE = 0;

export interface CheckRewriteProgress {
  readonly order: CheckRewriteOrder;
  readonly fingerprint: readonly FileFingerprint[] | null;
  readonly authored: CheckRewriteAuthoredRecord | null;
  readonly proved: boolean;
}

export interface PipelineJournal {
  readonly issueNumber: number;
  readonly state: IssueState | null;
  readonly stateBeforeEscalation: IssueState | null;
  readonly escalationReason: string | null;
  readonly spec: IssueSpec | null;
  readonly branch: string | null;
  readonly worktree: Worktree | null;
  /** The base commit the issue's latest worktree started from, kept once the worktree is released. */
  readonly baseSha: string | null;
  readonly workspacePrepared: boolean;
  readonly manifest: AcceptanceManifest | null;
  readonly beforeProof: BeforeProofRecord | null;
  readonly beforeProofCorrections: readonly BeforeProofCorrectionRecord[];
  readonly pendingBeforeProofCorrection: BeforeProofCorrectionRecord | null;
  readonly frozen: FrozenRecord | null;
  readonly attempts: readonly ImplementerAttemptRecord[];
  readonly gates: readonly GateRecord[];
  readonly reviews: readonly ReviewRecord[];
  readonly decisions: readonly RetryRecord[];
  readonly decisionAnswers: readonly DecisionAnswerRecord[];
  readonly agentRuns: readonly AgentRunFinished[];
  readonly implementationCommit: string | null;
  readonly evidence: EvidenceRecord | null;
  readonly pushedHead: string | null;
  readonly pullRequest: PullRequestRef | null;
  readonly evidenceRemoval: EvidenceRemovalRecord | null;
  readonly mergeSha: string | null;
  readonly lastCommitSha: string | null;
  readonly feedback: readonly ExternalFeedbackRecord[];
  readonly pullRequestBodySha: string | null;
  readonly checkRewrite: CheckRewriteProgress | null;
  readonly checkRewrites: readonly CheckRewrittenRecord[];
  readonly attemptEpoch: number;
}

export class JournalCorruptError extends Error {
  constructor(event: FactoryEventRecord, cause: unknown) {
    super(`Event ${event.sequence} (${event.type}) of ${event.subject} does not match its schema`, { cause });
    this.name = 'JournalCorruptError';
  }
}

type Draft = { -readonly [K in keyof PipelineJournal]: PipelineJournal[K] };

function emptyJournal(issueNumber: number): Draft {
  return {
    issueNumber,
    state: null,
    stateBeforeEscalation: null,
    escalationReason: null,
    spec: null,
    branch: null,
    worktree: null,
    baseSha: null,
    workspacePrepared: false,
    manifest: null,
    beforeProof: null,
    beforeProofCorrections: [],
    pendingBeforeProofCorrection: null,
    frozen: null,
    attempts: [],
    gates: [],
    reviews: [],
    decisions: [],
    decisionAnswers: [],
    agentRuns: [],
    implementationCommit: null,
    evidence: null,
    pushedHead: null,
    pullRequest: null,
    evidenceRemoval: null,
    mergeSha: null,
    lastCommitSha: null,
    feedback: [],
    pullRequestBodySha: null,
    checkRewrite: null,
    checkRewrites: [],
    attemptEpoch: 0,
  };
}

function parse<S extends z.ZodType>(schema: S, event: FactoryEventRecord): z.infer<S> {
  const parsed = schema.safeParse(event.payload);
  if (!parsed.success) throw new JournalCorruptError(event, parsed.error);
  return parsed.data;
}

type Reducer = (journal: Draft, event: FactoryEventRecord) => void;

const REDUCERS: Readonly<Record<string, Reducer>> = {
  [ISSUE_TRANSITIONED_EVENT]: (journal, event) => {
    const { to, reason } = parse(IssueTransitionedPayloadSchema, event);
    if (to === ISSUE_ESCALATION_STATE) {
      journal.stateBeforeEscalation = journal.state;
      journal.escalationReason = reason;
    }
    journal.state = to;
  },
  [PIPELINE_EVENTS.specCaptured]: (journal, event) => {
    const { spec, branch } = parse(SpecCapturedSchema, event);
    journal.spec = spec;
    journal.branch = branch;
  },
  [PIPELINE_EVENTS.worktreeAcquired]: (journal, event) => {
    const worktree = parse(WorktreeAcquiredSchema, event);
    journal.worktree = worktree;
    journal.baseSha = worktree.baseSha;
    journal.lastCommitSha = journal.lastCommitSha ?? worktree.baseSha;
  },
  [PIPELINE_EVENTS.workspacePrepared]: (journal, event) => {
    parse(WorkspacePreparedSchema, event);
    journal.workspacePrepared = true;
  },
  [PIPELINE_EVENTS.worktreeReleased]: (journal, event) => {
    parse(WorktreeReleasedSchema, event);
    journal.worktree = null;
  },
  [PIPELINE_EVENTS.authoringRestarted]: (journal, event) => {
    parse(AuthoringRestartedSchema, event);
    journal.worktree = null;
    journal.workspacePrepared = false;
    journal.manifest = null;
    journal.beforeProof = null;
    journal.beforeProofCorrections = [];
    journal.pendingBeforeProofCorrection = null;
    journal.frozen = null;
    journal.lastCommitSha = null;
  },
  [PIPELINE_EVENTS.agentRunFinished]: (journal, event) => {
    journal.agentRuns = [...journal.agentRuns, parse(AgentRunFinishedSchema, event)];
  },
  [PIPELINE_EVENTS.acceptanceAuthored]: (journal, event) => {
    journal.manifest = parse(AcceptanceAuthoredSchema, event).manifest;
    journal.pendingBeforeProofCorrection = null;
  },
  [PIPELINE_EVENTS.beforeProofCorrectionRequested]: (journal, event) => {
    const correction = parse(BeforeProofCorrectionRequestedSchema, event);
    journal.beforeProofCorrections = [...journal.beforeProofCorrections, correction];
    journal.pendingBeforeProofCorrection = correction;
    journal.manifest = null;
    journal.beforeProof = null;
  },
  [PIPELINE_EVENTS.beforeProofRecorded]: (journal, event) => {
    journal.beforeProof = parse(BeforeProofRecordedSchema, event);
  },
  [PIPELINE_EVENTS.checksFrozen]: (journal, event) => {
    const frozen = parse(ChecksFrozenSchema, event);
    journal.frozen = frozen;
    journal.lastCommitSha = frozen.commitSha ?? journal.lastCommitSha;
  },
  [PIPELINE_EVENTS.implementerAttemptFinished]: (journal, event) => {
    journal.attempts = [...journal.attempts, parse(ImplementerAttemptFinishedSchema, event)];
  },
  [PIPELINE_EVENTS.gateCompleted]: (journal, event) => {
    journal.gates = [...journal.gates, parse(GateCompletedSchema, event)];
  },
  [PIPELINE_EVENTS.reviewCompleted]: (journal, event) => {
    journal.reviews = [...journal.reviews, parse(ReviewCompletedSchema, event)];
  },
  [PIPELINE_EVENTS.retryDecided]: (journal, event) => {
    journal.decisions = [...journal.decisions, parse(RetryDecidedSchema, event)];
  },
  [PIPELINE_EVENTS.decisionAnswered]: (journal, event) => {
    journal.decisionAnswers = [...journal.decisionAnswers, parse(DecisionAnsweredSchema, event)];
  },
  [PIPELINE_EVENTS.implementationCommitted]: (journal, event) => {
    const { sha } = parse(CommitRecordedSchema, event);
    journal.implementationCommit = sha;
    journal.lastCommitSha = sha;
  },
  [PIPELINE_EVENTS.evidenceCommitted]: (journal, event) => {
    const evidence = parse(EvidenceCommittedSchema, event);
    journal.evidence = evidence;
    journal.lastCommitSha = evidence.sha;
  },
  [PIPELINE_EVENTS.branchPushed]: (journal, event) => {
    journal.pushedHead = parse(BranchPushedSchema, event).headSha;
  },
  [PIPELINE_EVENTS.pullRequestOpened]: (journal, event) => {
    journal.pullRequest = parse(PullRequestOpenedSchema, event);
    journal.pullRequestBodySha = journal.evidence?.sha ?? null;
  },
  [PIPELINE_EVENTS.externalFeedbackReceived]: (journal, event) => {
    journal.feedback = [...journal.feedback, parse(ExternalFeedbackReceivedSchema, event)];
    journal.implementationCommit = null;
    journal.evidence = null;
    journal.pullRequestBodySha = null;
  },
  [PIPELINE_EVENTS.pullRequestUpdated]: (journal, event) => {
    journal.pullRequestBodySha = parse(PullRequestUpdatedSchema, event).headSha;
  },
  [PIPELINE_EVENTS.evidenceRemoved]: (journal, event) => {
    const removal = parse(EvidenceRemovedSchema, event);
    journal.evidenceRemoval = removal;
    journal.lastCommitSha = removal.headSha;
  },
  [PIPELINE_EVENTS.checkRewriteOrdered]: (journal, event) => {
    journal.checkRewrite = { order: parse(CheckRewriteOrderedSchema, event), fingerprint: null, authored: null, proved: false };
  },
  [PIPELINE_EVENTS.checkRewriteStarted]: (journal, event) => {
    const started = parse(CheckRewriteStartedSchema, event);
    if (journal.checkRewrite !== null) journal.checkRewrite = { ...journal.checkRewrite, fingerprint: started.fingerprint };
  },
  [PIPELINE_EVENTS.checkRewriteAuthored]: (journal, event) => {
    const authored = parse(CheckRewriteAuthoredSchema, event);
    if (journal.checkRewrite !== null) journal.checkRewrite = { ...journal.checkRewrite, authored };
  },
  [PIPELINE_EVENTS.checkRewriteProved]: (journal, event) => {
    journal.beforeProof = parse(CheckRewriteProvedSchema, event).beforeProof;
    if (journal.checkRewrite !== null) journal.checkRewrite = { ...journal.checkRewrite, proved: true };
  },
  [PIPELINE_EVENTS.checkRewritten]: (journal, event) => {
    const rewritten = parse(CheckRewrittenSchema, event);
    journal.frozen = { checks: rewritten.checks, commitSha: rewritten.commitSha ?? journal.frozen?.commitSha ?? null };
    journal.lastCommitSha = rewritten.commitSha ?? journal.lastCommitSha;
    journal.attemptEpoch = rewritten.nextAttempt;
    journal.implementationCommit = null;
    journal.evidence = null;
    journal.pullRequestBodySha = null;
    journal.checkRewrite = null;
    journal.checkRewrites = [...journal.checkRewrites, rewritten];
  },
  [PIPELINE_EVENTS.pullRequestMerged]: (journal, event) => {
    journal.mergeSha = parse(PullRequestMergedSchema, event).mergeSha;
  },
};

export function projectJournal(issueNumber: number, events: readonly FactoryEventRecord[]): PipelineJournal {
  const subject = issueSubject(issueNumber);
  const journal = emptyJournal(issueNumber);
  for (const event of events) {
    if (event.subject !== subject) continue;
    REDUCERS[event.type]?.(journal, event);
  }
  return journal;
}

export async function loadJournal(events: EventStore, issueNumber: number): Promise<PipelineJournal> {
  return projectJournal(issueNumber, await events.read(issueSubject(issueNumber), FIRST_SEQUENCE));
}

export function decisionsOfEpoch(journal: PipelineJournal): readonly RetryRecord[] {
  return journal.decisions.filter((record) => record.afterAttempt >= journal.attemptEpoch);
}

export function currentAttempt(journal: PipelineJournal): number {
  return journal.attemptEpoch + decisionsOfEpoch(journal).filter((record) => record.decision.action !== 'needs-human').length;
}

export function nextAttemptEpoch(journal: PipelineJournal): number {
  return Math.max(currentAttempt(journal), ...journal.attempts.map((record) => record.attempt + 1));
}

export function attemptRecord(journal: PipelineJournal, attempt: number): ImplementerAttemptRecord | null {
  return journal.attempts.findLast((record) => record.attempt === attempt) ?? null;
}

export function gateRecord(journal: PipelineJournal, attempt: number): GateRecord | null {
  return journal.gates.findLast((record) => record.attempt === attempt) ?? null;
}

export function reviewRecord(journal: PipelineJournal, attempt: number): ReviewRecord | null {
  return journal.reviews.findLast((record) => record.attempt === attempt) ?? null;
}

export function decisionAfter(journal: PipelineJournal, attempt: number): RetryRecord | null {
  return journal.decisions.find((record) => record.afterAttempt === attempt) ?? null;
}

export function pendingFeedback(journal: PipelineJournal): ExternalFeedbackRecord | null {
  const latest = journal.feedback.at(-1);
  if (latest === undefined || latest.cycleStarted) return null;
  return decisionAfter(journal, latest.afterAttempt) === null ? latest : null;
}

export function totalCostUsd(journal: PipelineJournal): number {
  return journal.agentRuns.reduce((sum, run) => sum + run.costUsd, 0);
}

export interface AttemptCounts {
  readonly total: number;
  readonly resumed: number;
  readonly escalated: number;
}

export function attemptCounts(journal: PipelineJournal): AttemptCounts {
  return {
    total: new Set(journal.attempts.map((record) => record.attempt)).size,
    resumed: journal.decisions.filter((record) => record.decision.action === 'resume-same-session').length,
    escalated: journal.decisions.filter((record) => record.decision.action === 'fresh-session-escalated').length,
  };
}
