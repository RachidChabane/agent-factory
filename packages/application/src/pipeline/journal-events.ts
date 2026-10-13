import { z } from 'zod';
import {
  AGENT_ROLES,
  BEFORE_PROOF_KINDS,
  EFFORT_LEVELS,
  FAILURE_KINDS,
  GATE_STEP_OUTCOMES,
  ISSUE_STATES,
  OMISSION_REASONS,
  TEST_OUTCOMES,
  TEST_RUNNERS,
} from '@agent-factory/domain';
import { AcceptanceManifestSchema } from '../acceptance/acceptance-manifest.ts';
import { ScoreReportSchema } from '../acceptance/score-report.ts';
import { AGENT_RUN_OUTCOMES } from '../ports.ts';
import { ReviewFindingSchema } from '../review/review-findings.ts';
import { IssueSpecSchema } from '../spec/issue-spec-schema.ts';
import { DelegationFieldsSchema } from '../autonomy/delegation.ts';

export const PIPELINE_EVENTS = {
  specCaptured: 'pipeline.spec-captured',
  worktreeAcquired: 'pipeline.worktree-acquired',
  workspacePrepared: 'pipeline.workspace-prepared',
  agentRunStarted: 'pipeline.agent-run-started',
  agentRunFinished: 'pipeline.agent-run-finished',
  acceptanceAuthored: 'pipeline.acceptance-authored',
  beforeProofRecorded: 'pipeline.before-proof-recorded',
  authorScratchFilesRemoved: 'pipeline.author-scratch-files-removed',
  checksFrozen: 'pipeline.checks-frozen',
  implementerAttemptFinished: 'pipeline.implementer-attempt-finished',
  gateCompleted: 'pipeline.gate-completed',
  reviewCompleted: 'pipeline.review-completed',
  reviewReordered: 'pipeline.review-reordered',
  retryDecided: 'pipeline.retry-decided',
  implementationCommitted: 'pipeline.implementation-committed',
  evidenceCommitted: 'pipeline.evidence-committed',
  branchPushed: 'pipeline.branch-pushed',
  pullRequestOpened: 'pipeline.pull-request-opened',
  evidenceRemoved: 'pipeline.evidence-removed',
  pullRequestMerged: 'pipeline.pull-request-merged',
  worktreeReleased: 'pipeline.worktree-released',
  authoringRestarted: 'pipeline.authoring-restarted',
  externalFeedbackReceived: 'pipeline.external-feedback-received',
  pullRequestUpdated: 'pipeline.pull-request-updated',
  decisionAnswered: 'pipeline.decision-answered',
  beforeProofCorrectionRequested: 'pipeline.before-proof-correction-requested',
  checkRewriteOrdered: 'pipeline.check-rewrite-ordered',
  checkRewriteStarted: 'pipeline.check-rewrite-started',
  checkRewriteAuthored: 'pipeline.check-rewrite-authored',
  checkRewriteProved: 'pipeline.check-rewrite-proved',
  checkRewritten: 'pipeline.check-rewritten',
  filmQueued: 'pipeline.film-queued',
  filmStarted: 'pipeline.film-started',
  filmStageEntered: 'pipeline.film-stage-entered',
  filmCommitted: 'pipeline.film-committed',
  filmPushed: 'pipeline.film-pushed',
  filmFinished: 'pipeline.film-finished',
  filmFailed: 'pipeline.film-failed',
  pullRequestReadyAnnounced: 'pipeline.pull-request-ready-announced',
} as const;

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const IssueTransitionedPayloadSchema = z.object({
  from: z.enum(ISSUE_STATES).nullable(),
  to: z.enum(ISSUE_STATES),
  reason: z.string(),
});

export const SpecCapturedSchema = z.object({
  spec: IssueSpecSchema,
  branch: z.string().min(1),
});

export const WorktreeAcquiredSchema = z.object({
  path: z.string().min(1),
  branch: z.string().min(1),
  baseSha: z.string().min(1),
});

export const AuthoringRestartedSchema = z.object({
  reason: z.string().min(1),
});

export const WorkspacePreparedSchema = z.object({
  logName: z.string().min(1),
});

export const AuthorScratchFilesRemovedSchema = z.object({
  paths: z.array(z.string().min(1)).min(1),
});

export const AgentRunStartedSchema = z.object({
  role: z.enum(AGENT_ROLES),
  runId: z.string().min(1),
  model: z.string().min(1),
  effort: z.enum(EFFORT_LEVELS),
  resumeSessionId: z.string().nullable(),
});

export const AgentRunFinishedSchema = z.object({
  role: z.enum(AGENT_ROLES),
  runId: z.string().min(1),
  sessionId: z.string().nullable(),
  outcome: z.enum(AGENT_RUN_OUTCOMES),
  costUsd: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
  turns: z.number().int().nonnegative(),
  gateBlocks: z.number().int().nonnegative(),
  rawLogPath: z.string(),
});

export const AcceptanceAuthoredSchema = z.object({
  manifest: AcceptanceManifestSchema,
});

export const CachedEvidenceSchema = z.object({
  path: z.string().min(1),
  caption: z.string().min(1),
  cachedPath: z.string().min(1).nullable(),
});

export const BeforeProofEvaluationSchema = z.discriminatedUnion('valid', [
  z.object({ valid: z.literal(true), kind: z.enum(BEFORE_PROOF_KINDS) }),
  z.object({ valid: z.literal(false), reason: z.string() }),
]);

export const AcceptanceTestOnBaseSchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  criteria: z.array(z.number().int().positive()),
  outcome: z.enum(TEST_OUTCOMES),
  failureKind: z.enum(FAILURE_KINDS).nullable(),
  failureMessage: z.string().nullable(),
});

export const AcceptanceTestOnBranchSchema = z.object({
  id: z.string().min(1),
  outcome: z.union([z.enum(TEST_OUTCOMES), z.literal('missing')]),
});

export const BeforeProofRecordedSchema = z.object({
  checksExpressible: z.boolean(),
  exitCode: z.number().int().nullable(),
  checksFailedOnBase: z.boolean(),
  scoreReport: ScoreReportSchema.nullable(),
  baseScore: z.number().nullable(),
  logName: z.string().nullable(),
  evaluation: BeforeProofEvaluationSchema,
  evidence: z.array(CachedEvidenceSchema),
  runner: z.enum(TEST_RUNNERS).nullable().default(null),
  tests: z.array(AcceptanceTestOnBaseSchema).default([]),
});

export const FrozenCheckSchema = z.object({ path: z.string().min(1), sha256: Sha256Schema });

export const ChecksFrozenSchema = z.object({
  checks: z.array(FrozenCheckSchema),
  commitSha: z.string().min(1).nullable(),
});

export const ATTEMPT_MODES = ['initial', 'resumed', 'fresh-escalated'] as const;
export type AttemptMode = (typeof ATTEMPT_MODES)[number];

export const ImplementerAttemptFinishedSchema = z.object({
  attempt: z.number().int().nonnegative(),
  mode: z.enum(ATTEMPT_MODES),
  model: z.string().min(1),
  effort: z.enum(EFFORT_LEVELS),
  runId: z.string().min(1),
  sessionId: z.string().nullable(),
  outcome: z.enum(AGENT_RUN_OUTCOMES),
  gateBlocks: z.number().int().nonnegative(),
  finalTextTail: z.string(),
  decisionRequest: z.string().nullable().default(null),
});

export const BeforeProofCorrectionRequestedSchema = z.object({
  correction: z.number().int().positive(),
  reason: z.string().min(1),
  sessionId: z.string().min(1),
});

export const CheckRewriteOrderedSchema = z.object({
  path: z.string().min(1),
  instruction: z.string().min(1),
  operator: z.string().min(1),
  orderedAt: z.iso.datetime({ offset: true }),
  fromState: z.enum(ISSUE_STATES),
});

export const FileFingerprintSchema = z.object({ path: z.string().min(1), sha256: Sha256Schema.nullable() });

export const CheckRewriteStartedSchema = z.object({
  path: z.string().min(1),
  fingerprint: z.array(FileFingerprintSchema),
});

export const CheckRewriteAuthoredSchema = z.object({
  path: z.string().min(1),
  runId: z.string().min(1),
  sessionId: z.string().nullable(),
  outcome: z.enum(AGENT_RUN_OUTCOMES),
});

export const CheckRewriteProvedSchema = z.object({
  path: z.string().min(1),
  beforeProof: BeforeProofRecordedSchema,
});

export const CheckRewrittenSchema = z.object({
  path: z.string().min(1),
  instruction: z.string().min(1),
  operator: z.string().min(1),
  previousSha256: Sha256Schema,
  sha256: Sha256Schema,
  checks: z.array(FrozenCheckSchema),
  commitSha: z.string().min(1).nullable(),
  nextAttempt: z.number().int().nonnegative(),
});

export const DecisionAnsweredSchema = z.object({
  runId: z.string().min(1),
  answer: z.string().min(1),
  ...DelegationFieldsSchema,
});

export const GateStepResultSchema = z.object({
  name: z.string().min(1),
  outcome: z.enum(GATE_STEP_OUTCOMES),
  detail: z.string(),
});

export const FROZEN_CHECK_VIOLATION_KINDS = ['modified', 'missing'] as const;

export const FrozenCheckViolationSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(FROZEN_CHECK_VIOLATION_KINDS),
});

export const GateCompletedSchema = z.object({
  attempt: z.number().int().nonnegative(),
  result: z.object({ passed: z.boolean(), steps: z.array(GateStepResultSchema) }),
  violations: z.array(FrozenCheckViolationSchema),
  logName: z.string().min(1),
  scoreReport: ScoreReportSchema.nullable(),
  evidence: z.array(CachedEvidenceSchema),
  tests: z.array(AcceptanceTestOnBranchSchema).default([]),
});

export const ReviewCompletedSchema = z.object({
  attempt: z.number().int().nonnegative(),
  runId: z.string().min(1),
  findings: z.array(ReviewFindingSchema),
});

/** The operator ordered the review of an attempt again: the reviews recorded before the order no longer count. */
export const ReviewReorderedSchema = z.object({
  attempt: z.number().int().nonnegative(),
  operator: z.string().min(1),
});

export const FAILURE_SOURCES = ['agent', 'gate', 'review'] as const;
export type FailureSource = (typeof FAILURE_SOURCES)[number];

export const RetryDecisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('resume-same-session') }),
  z.object({
    action: z.literal('fresh-session-escalated'),
    profile: z.object({ model: z.string().min(1), effort: z.enum(EFFORT_LEVELS) }),
  }),
  z.object({ action: z.literal('needs-human') }),
]);

export const RetryDecidedSchema = z.object({
  afterAttempt: z.number().int().nonnegative(),
  failure: z.object({ source: z.enum(FAILURE_SOURCES), summary: z.string() }),
  decision: RetryDecisionSchema,
  /** Whether the decision answers the operator's feedback rather than a failure: the cycle it opens counts its failures afresh. */
  opensCycle: z.boolean().default(false),
});

export const CommitRecordedSchema = z.object({ sha: z.string().min(1) });

export const EVIDENCE_PHASES = ['before', 'after'] as const;
export type EvidencePhase = (typeof EVIDENCE_PHASES)[number];

export const EvidenceFileSchema = z.object({
  phase: z.enum(EVIDENCE_PHASES),
  sourcePath: z.string().min(1),
  bundlePath: z.string().min(1),
  caption: z.string().min(1),
});

/** What says why a file of the evidence is not on the pull request: how heavy it is and the limit it passed. */
const OmissionFields = {
  bytes: z.number().int().nonnegative(),
  reason: z.enum(OMISSION_REASONS),
  limitBytes: z.number().int().positive(),
};

/** A file the checks produced as evidence that the limits of the pull request keep off it. */
export const OmittedEvidenceFileSchema = z.object({
  phase: z.enum(EVIDENCE_PHASES),
  sourcePath: z.string().min(1),
  caption: z.string().min(1),
  ...OmissionFields,
});

export const EvidenceBundleSchema = z.object({
  directory: z.string().min(1),
  beforeLogPath: z.string().min(1).nullable(),
  afterLogPath: z.string().min(1).nullable(),
  diffStatPath: z.string().min(1).nullable(),
  acceptanceTestsPath: z.string().min(1).nullable().default(null),
  files: z.array(EvidenceFileSchema),
  missing: z.array(z.object({ phase: z.enum(EVIDENCE_PHASES), sourcePath: z.string().min(1) })),
  omitted: z.array(OmittedEvidenceFileSchema).default([]),
});

export const ChangedFileStatSchema = z.object({
  path: z.string().min(1),
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
});

export const EvidenceCommittedSchema = z.object({
  sha: z.string().min(1),
  bundle: EvidenceBundleSchema,
  changes: z.array(ChangedFileStatSchema).default([]),
});

export const BranchPushedSchema = z.object({ headSha: z.string().min(1) });

export const PullRequestOpenedSchema = z.object({
  number: z.number().int().positive(),
  url: z.string().min(1),
  headSha: z.string().min(1),
});

export const EvidenceRemovedSchema = z.object({
  reviewedHeadSha: z.string().min(1),
  headSha: z.string().min(1),
});

export const PullRequestMergedSchema = z.object({ mergeSha: z.string().min(1), ...DelegationFieldsSchema });

export const WorktreeReleasedSchema = z.object({ path: z.string().min(1) });

export const ExternalFeedbackReceivedSchema = z.object({
  id: z.string().min(1),
  author: z.string().min(1),
  source: z.string().min(1),
  body: z.string().min(1),
  receivedAt: z.iso.datetime({ offset: true }),
  pullRequestNumber: z.number().int().positive(),
  afterAttempt: z.number().int().nonnegative(),
  findings: z.array(ReviewFindingSchema),
  cycleStarted: z.boolean(),
});

export const PullRequestUpdatedSchema = z.object({ headSha: z.string().min(1) });

/** Who orders the films a spec declares. */
export const FACTORY_FILM_OPERATOR = 'factory';

/** The two recordings of a film: the issue's base commit, then the pull request head. */
export const FILM_PHASES = ['before', 'after'] as const;
export type FilmPhase = (typeof FILM_PHASES)[number];

export const FILM_RUNNING_STAGES = ['recording-base', 'recording-head', 'committing'] as const;
export type FilmRunningStage = (typeof FILM_RUNNING_STAGES)[number];

export const FilmQueuedSchema = z.object({
  scenario: z.string().min(1),
  operator: z.string().min(1),
});

export const FilmStageEnteredSchema = z.object({
  scenario: z.string().min(1),
  stage: z.enum(FILM_RUNNING_STAGES),
});

export const FilmStartedSchema = z.object({
  scenario: z.string().min(1),
  operator: z.string().min(1),
  baseSha: z.string().min(1),
  headSha: z.string().min(1),
});

export const FilmCommittedSchema = z.object({ scenario: z.string().min(1), sha: z.string().min(1) });

export const FilmPushedSchema = z.object({ headSha: z.string().min(1) });

export const FilmFailedSchema = z.object({ scenario: z.string().min(1), reason: z.string().min(1) });

export const FilmFactSchema = z.object({ label: z.string().min(1), value: z.string() });

/** A file of a recording that the limits of the pull request keep off the branch, by the path it would have there. */
export const OmittedFilmFileSchema = z.object({ path: z.string().min(1), ...OmissionFields });

/** What one recording left on the branch, and where its files stand in the factory's film store. */
const FilmPhaseRecordSchema = z.object({
  video: z.string().min(1),
  report: z.string().min(1),
  /** The final screenshot first, then the key frames. */
  screenshots: z.array(z.string().min(1)),
  facts: z.array(FilmFactSchema),
  storeVideo: z.string().min(1),
  storeScreenshots: z.array(z.string().min(1)),
  /** The video and screenshots above that are not on the branch. */
  omitted: z.array(OmittedFilmFileSchema).default([]),
});

export const FilmFinishedSchema = z.object({
  scenario: z.string().min(1),
  baseSha: z.string().min(1),
  headSha: z.string().min(1),
  commitSha: z.string().min(1),
  before: FilmPhaseRecordSchema,
  after: FilmPhaseRecordSchema,
});

/** A link to a file of a pull request that the operator's upload command made reachable. */
export const MediaLinkSchema = z.object({ label: z.string().min(1), url: z.string().min(1) });

/** A file the upload command could not make reachable, and why. */
export const MediaFailureSchema = z.object({ label: z.string().min(1), reason: z.string().min(1) });

/** The notice that a pull request is ready was sent for its head, with the links it carried. */
export const PullRequestReadyAnnouncedSchema = z.object({
  pullRequestNumber: z.number().int().positive(),
  headSha: z.string().min(1),
  links: z.array(MediaLinkSchema),
  failures: z.array(MediaFailureSchema),
});

export type FilmFinishedRecord = z.infer<typeof FilmFinishedSchema>;
export type PullRequestReadyAnnouncedRecord = z.infer<typeof PullRequestReadyAnnouncedSchema>;
export type MediaLinkRecord = z.infer<typeof MediaLinkSchema>;
export type MediaFailureRecord = z.infer<typeof MediaFailureSchema>;
export type FilmPhaseRecord = z.infer<typeof FilmPhaseRecordSchema>;
export type OmittedFilmFile = z.infer<typeof OmittedFilmFileSchema>;
export type OmittedEvidenceFile = z.infer<typeof OmittedEvidenceFileSchema>;
export type FilmStartedRecord = z.infer<typeof FilmStartedSchema>;

export type AgentRunFinished = z.infer<typeof AgentRunFinishedSchema>;
export type BeforeProofRecord = z.infer<typeof BeforeProofRecordedSchema>;
export type CachedEvidence = z.infer<typeof CachedEvidenceSchema>;
export type FrozenRecord = z.infer<typeof ChecksFrozenSchema>;
export type ImplementerAttemptRecord = z.infer<typeof ImplementerAttemptFinishedSchema>;
export type GateRecord = z.infer<typeof GateCompletedSchema>;
export type FrozenCheckViolation = z.infer<typeof FrozenCheckViolationSchema>;
export type ReviewRecord = z.infer<typeof ReviewCompletedSchema>;
export type ReviewReorderRecord = z.infer<typeof ReviewReorderedSchema>;
export type RetryRecord = z.infer<typeof RetryDecidedSchema>;
export type DecisionAnswerRecord = z.infer<typeof DecisionAnsweredSchema>;
export type BeforeProofCorrectionRecord = z.infer<typeof BeforeProofCorrectionRequestedSchema>;
export type CheckRewriteOrder = z.infer<typeof CheckRewriteOrderedSchema>;
export type FileFingerprint = z.infer<typeof FileFingerprintSchema>;
export type CheckRewriteAuthoredRecord = z.infer<typeof CheckRewriteAuthoredSchema>;
export type CheckRewrittenRecord = z.infer<typeof CheckRewrittenSchema>;
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
export type EvidenceFile = z.infer<typeof EvidenceFileSchema>;
export type EvidenceRecord = z.infer<typeof EvidenceCommittedSchema>;
export type EvidenceRemovalRecord = z.infer<typeof EvidenceRemovedSchema>;
export type ExternalFeedbackRecord = z.infer<typeof ExternalFeedbackReceivedSchema>;
