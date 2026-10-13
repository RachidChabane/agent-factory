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
  FilmCommittedSchema,
  FilmFailedSchema,
  FilmFinishedSchema,
  FilmPushedSchema,
  FilmQueuedSchema,
  FilmStageEnteredSchema,
  FilmStartedSchema,
  GateCompletedSchema,
  ImplementerAttemptFinishedSchema,
  IssueTransitionedPayloadSchema,
  PIPELINE_EVENTS,
  PullRequestMergedSchema,
  PullRequestOpenedSchema,
  PullRequestReadyAnnouncedSchema,
  PullRequestUpdatedSchema,
  RetryDecidedSchema,
  ReviewCompletedSchema,
  ReviewReorderedSchema,
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
  type FilmFinishedRecord,
  type FilmRunningStage,
  type PullRequestReadyAnnouncedRecord,
  FACTORY_FILM_OPERATOR,
  type EvidenceRecord,
  type EvidenceRemovalRecord,
  type ExternalFeedbackRecord,
  type FrozenRecord,
  type GateRecord,
  type ImplementerAttemptRecord,
  type RetryRecord,
  type ReviewRecord,
  type ReviewReorderRecord,
} from './journal-events.ts';

const FIRST_SEQUENCE = 0;

export interface CheckRewriteProgress {
  readonly order: CheckRewriteOrder;
  readonly fingerprint: readonly FileFingerprint[] | null;
  readonly authored: CheckRewriteAuthoredRecord | null;
  readonly proved: boolean;
}

export const FILM_ORDER_STATUSES = ['queued', 'running', 'finished', 'failed'] as const;
export type FilmOrderStatus = (typeof FILM_ORDER_STATUSES)[number];

/** One scenario ordered for the pull request of an issue, and how far its film has come. */
export interface FilmOrderState {
  readonly scenario: string;
  readonly operator: string;
  readonly status: FilmOrderStatus;
  readonly stage: FilmRunningStage | null;
  /** The sequence of the event that queued the film in the installation's log: films run in this order. */
  readonly queuedSequence: number;
  readonly queuedAt: string;
  readonly startedAt: string | null;
  readonly updatedAt: string;
  readonly reason: string | null;
}

/** The notice that the pull request is ready, as it was sent for one head. */
export interface ReadyAnnouncement extends PullRequestReadyAnnouncedRecord {
  readonly announcedAt: string;
}

export function isFilmPending(order: FilmOrderState): boolean {
  return order.status === 'queued' || order.status === 'running';
}

export function isFilmFailed(order: FilmOrderState): boolean {
  return order.status === 'failed';
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
  /** The manifest of the current authoring, which a before-proof correction keeps when it leaves the manifest out. */
  readonly authoredManifest: AcceptanceManifest | null;
  readonly beforeProof: BeforeProofRecord | null;
  readonly beforeProofCorrections: readonly BeforeProofCorrectionRecord[];
  readonly pendingBeforeProofCorrection: BeforeProofCorrectionRecord | null;
  readonly frozen: FrozenRecord | null;
  readonly attempts: readonly ImplementerAttemptRecord[];
  readonly gates: readonly GateRecord[];
  readonly reviews: readonly ReviewRecord[];
  /** The reviews an operator's order replaced, kept for the history of the issue. */
  readonly supersededReviews: readonly ReviewRecord[];
  readonly reviewReorders: readonly ReviewReorderRecord[];
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
  readonly films: readonly FilmFinishedRecord[];
  readonly filmOrders: readonly FilmOrderState[];
  readonly readyAnnouncements: readonly ReadyAnnouncement[];
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
    authoredManifest: null,
    beforeProof: null,
    beforeProofCorrections: [],
    pendingBeforeProofCorrection: null,
    frozen: null,
    attempts: [],
    gates: [],
    reviews: [],
    supersededReviews: [],
    reviewReorders: [],
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
    films: [],
    filmOrders: [],
    readyAnnouncements: [],
  };
}

function parse<S extends z.ZodType>(schema: S, event: FactoryEventRecord): z.infer<S> {
  const parsed = schema.safeParse(event.payload);
  if (!parsed.success) throw new JournalCorruptError(event, parsed.error);
  return parsed.data;
}

type Reducer = (journal: Draft, event: FactoryEventRecord) => void;
type FilmOrderFields = Omit<FilmOrderState, 'scenario' | 'updatedAt'>;

function upsertFilmOrder(journal: Draft, scenario: string, fields: FilmOrderFields, event: FactoryEventRecord): void {
  const order: FilmOrderState = { scenario, ...fields, updatedAt: event.occurredAt.toISOString() };
  const known = journal.filmOrders.some((candidate) => candidate.scenario === scenario);
  journal.filmOrders = known ? journal.filmOrders.map((candidate) => (candidate.scenario === scenario ? order : candidate)) : [...journal.filmOrders, order];
}

function settleFilmOrder(journal: Draft, scenario: string, status: 'finished' | 'failed', reason: string | null, event: FactoryEventRecord): void {
  const known = journal.filmOrders.find((candidate) => candidate.scenario === scenario);
  upsertFilmOrder(
    journal,
    scenario,
    {
      operator: known?.operator ?? FACTORY_FILM_OPERATOR,
      status,
      stage: null,
      queuedSequence: known?.queuedSequence ?? event.sequence,
      queuedAt: known?.queuedAt ?? event.occurredAt.toISOString(),
      startedAt: known?.startedAt ?? null,
      reason,
    },
    event,
  );
}

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
    journal.authoredManifest = null;
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
    const { manifest } = parse(AcceptanceAuthoredSchema, event);
    journal.manifest = manifest;
    journal.authoredManifest = manifest;
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
  [PIPELINE_EVENTS.reviewReordered]: (journal, event) => {
    const reorder = parse(ReviewReorderedSchema, event);
    const superseded = journal.reviews.filter((record) => record.attempt === reorder.attempt);
    journal.reviews = journal.reviews.filter((record) => record.attempt !== reorder.attempt);
    journal.supersededReviews = [...journal.supersededReviews, ...superseded];
    journal.reviewReorders = [...journal.reviewReorders, reorder];
  },
  [PIPELINE_EVENTS.retryDecided]: (journal, event) => {
    const decided = parse(RetryDecidedSchema, event);
    journal.decisions = [...journal.decisions, decided];
    if (decided.opensCycle) journal.attemptEpoch = decided.afterAttempt + 1;
  },
  [PIPELINE_EVENTS.decisionAnswered]: (journal, event) => {
    const answered = parse(DecisionAnsweredSchema, event);
    journal.decisionAnswers = [...journal.decisionAnswers, answered];
    const asking = journal.attempts.findLast((record) => record.runId === answered.runId);
    if (asking !== undefined) journal.attemptEpoch = Math.max(journal.attemptEpoch, asking.attempt);
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
    journal.films = [];
    journal.filmOrders = [];
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
    journal.films = [];
    journal.filmOrders = [];
  },
  [PIPELINE_EVENTS.filmQueued]: (journal, event) => {
    const queued = parse(FilmQueuedSchema, event);
    upsertFilmOrder(
      journal,
      queued.scenario,
      { operator: queued.operator, status: 'queued', stage: null, queuedSequence: event.sequence, queuedAt: event.occurredAt.toISOString(), startedAt: null, reason: null },
      event,
    );
  },
  [PIPELINE_EVENTS.filmStarted]: (journal, event) => {
    const started = parse(FilmStartedSchema, event);
    const queued = journal.filmOrders.find((order) => order.scenario === started.scenario && order.status === 'queued');
    upsertFilmOrder(
      journal,
      started.scenario,
      {
        operator: started.operator,
        status: 'running',
        stage: 'recording-base',
        queuedSequence: queued?.queuedSequence ?? event.sequence,
        queuedAt: queued?.queuedAt ?? event.occurredAt.toISOString(),
        startedAt: event.occurredAt.toISOString(),
        reason: null,
      },
      event,
    );
  },
  [PIPELINE_EVENTS.filmStageEntered]: (journal, event) => {
    const entered = parse(FilmStageEnteredSchema, event);
    const running = journal.filmOrders.find((order) => order.scenario === entered.scenario && order.status === 'running');
    if (running !== undefined) upsertFilmOrder(journal, entered.scenario, { ...running, stage: entered.stage }, event);
  },
  [PIPELINE_EVENTS.filmCommitted]: (journal, event) => {
    journal.lastCommitSha = parse(FilmCommittedSchema, event).sha;
  },
  [PIPELINE_EVENTS.filmPushed]: (journal, event) => {
    journal.pushedHead = parse(FilmPushedSchema, event).headSha;
  },
  [PIPELINE_EVENTS.filmFinished]: (journal, event) => {
    const finished = parse(FilmFinishedSchema, event);
    journal.films = [...journal.films.filter((film) => film.scenario !== finished.scenario), finished];
    settleFilmOrder(journal, finished.scenario, 'finished', null, event);
  },
  [PIPELINE_EVENTS.filmFailed]: (journal, event) => {
    const failed = parse(FilmFailedSchema, event);
    settleFilmOrder(journal, failed.scenario, 'failed', failed.reason, event);
  },
  [PIPELINE_EVENTS.pullRequestReadyAnnounced]: (journal, event) => {
    const announced = parse(PullRequestReadyAnnouncedSchema, event);
    journal.readyAnnouncements = [...journal.readyAnnouncements, { ...announced, announcedAt: event.occurredAt.toISOString() }];
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

/** The head the pull request has now: the last commit the factory pushed. */
export function currentHeadOf(journal: PipelineJournal): string | null {
  return journal.pushedHead ?? journal.pullRequest?.headSha ?? null;
}

export function isAnnouncedReady(journal: PipelineJournal, headSha: string): boolean {
  return journal.readyAnnouncements.some((announcement) => announcement.headSha === headSha);
}

/**
 * The decisions of the current cycle, which the failure budget counts. A cycle begins with the first attempt and again
 * with each check the operator had rewritten, each feedback the operator recorded on the pull request and each answer
 * the operator gave to a decision request: these gestures never spend the budget, and the failures before them stop
 * counting.
 */
export function decisionsOfEpoch(journal: PipelineJournal): readonly RetryRecord[] {
  return journal.decisions.filter((record) => record.afterAttempt >= journal.attemptEpoch);
}

/**
 * The decisions since the operator last had a frozen check rewritten: what a fresh session is told was rejected. Failures
 * reported against the checks before the rewrite tell it nothing; the operator's feedback and answers do not end it.
 */
export function decisionsSinceRewrite(journal: PipelineJournal): readonly RetryRecord[] {
  const rewrittenAt = journal.checkRewrites.at(-1)?.nextAttempt ?? 0;
  return journal.decisions.filter((record) => record.afterAttempt >= rewrittenAt);
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

/** The latest decision that followed the attempt: a review ordered again, or feedback on its pull request, can add one to an earlier decision. */
export function decisionAfter(journal: PipelineJournal, attempt: number): RetryRecord | null {
  return journal.decisions.findLast((record) => record.afterAttempt === attempt) ?? null;
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
