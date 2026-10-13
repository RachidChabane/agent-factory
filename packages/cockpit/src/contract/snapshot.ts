import { z } from 'zod';
import {
  AGENT_ROLES,
  AUDIT_REASONS,
  AUDIT_STATES,
  BASE_EXPECTATIONS,
  BASE_TEST_RESULTS,
  BEFORE_PROOF_KINDS,
  BILLING_MODES,
  BRANCH_TEST_RESULTS,
  DELEGABLE_GESTURES,
  EFFORT_LEVELS,
  ISSUE_STATES,
  MERGE_CONDITIONS,
  PAUSE_ABOVE_PRESSURE_LEVELS,
  PAUSE_CAUSES,
  PROMOTION_POLICIES,
  PROOF_STRATEGIES,
  REFERENCE_SNAPSHOT_STATUSES,
  RELEASE_MODEL_KINDS,
  RELEASE_STATES,
  REQUEST_STATES,
  REVIEW_CATEGORIES,
  REVIEW_SEVERITIES,
  TEST_RUNNERS,
  TOOL_FAILURE_STATUSES,
  TOOL_SESSION_OUTCOMES,
  TOOL_STATUSES,
  USAGE_FRESHNESS,
  USAGE_LIMIT_KINDS,
  USAGE_SOURCES,
} from '@agent-factory/domain';
import { StreamEventSchema } from './events.ts';
import {
  AmountSchema,
  CountSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  IssueNumberSchema,
  IssueTypeIdSchema,
  PercentSchema,
  ProjectIdSchema,
  RatioSchema,
  readingOf,
  TokenTotalsSchema,
  TokenUsageSchema,
} from './primitives.ts';
import {
  AGENT_RUN_OUTCOMES,
  ATTEMPT_KINDS,
  ATTEMPT_OUTCOMES,
  AUDIT_FINDING_LEVELS,
  BEFORE_RESULTS,
  CHALLENGE_VERDICTS,
  CHECK_CONCLUSIONS,
  CHECK_RUN_OUTCOMES,
  COMMIT_ATTRIBUTIONS,
  COST_BASIS_VIEWS,
  DELEGATED_TARGET_KINDS,
  DEPLOYMENT_OUTCOMES,
  ENVIRONMENT_STATUSES,
  FORGE_KINDS,
  INSTALLATION_MODES,
  KNOWLEDGE_SOURCE_KINDS,
  MEMORY_PRESSURES,
  NOTIFICATION_CHANNEL_KINDS,
  PAUSE_SCOPES,
  PULL_REQUEST_STATES,
  READY_NOTICE_STATUSES,
  RELEASE_SOURCES,
  RUN_STATUSES,
  RUN_SUBJECT_KINDS,
  SUBAGENT_STATUSES,
  TOOL_SCOPES,
  WORKFLOW_STATUSES,
} from './vocabulary.ts';

// ---------------------------------------------------------------- installation

export const PauseViewSchema = z.object({
  scope: z.enum(PAUSE_SCOPES),
  cause: z.enum(PAUSE_CAUSES),
  reason: z.string(),
  since: IsoDateTimeSchema,
  resumesAt: IsoDateTimeSchema.nullable(),
});
export type PauseView = z.infer<typeof PauseViewSchema>;

export const InstallationInfoSchema = z.object({
  version: z.string().min(1),
  mode: z.enum(INSTALLATION_MODES),
  operator: z.string().min(1),
  publicUrl: z.string(),
  startedAt: IsoDateTimeSchema.nullable(),
  /** The installation-wide pauses: the operator's, short memory, a spent budget. */
  pauses: z.array(PauseViewSchema),
  runSlots: z.object({ limit: CountSchema, running: CountSchema, queued: CountSchema }),
  /** How old a reading of each kind may be before the cockpit calls it stale, from the intervals the factory reads it at. */
  staleAfterMs: z.object({ forge: CountSchema, health: CountSchema, resources: CountSchema, tools: CountSchema, knowledge: CountSchema, references: CountSchema }),
});
export type InstallationInfo = z.infer<typeof InstallationInfoSchema>;

// ---------------------------------------------------------------- requests

export const SourceRefSchema = z.object({ label: z.string(), reference: z.string() });
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const ChallengeItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  verdict: z.enum(CHALLENGE_VERDICTS),
  currentState: z.string(),
  intent: z.string(),
  idea: z.string(),
  method: z.string(),
  reason: z.string(),
  question: z.string().nullable(),
  sources: z.array(SourceRefSchema),
});
export type ChallengeItem = z.infer<typeof ChallengeItemSchema>;

export const ProposedSpecSchema = z.object({
  id: z.string().min(1),
  itemIds: z.array(z.string()),
  title: z.string(),
  type: IssueTypeIdSchema,
  need: z.string(),
  acceptanceCriteria: z.array(z.string()),
  outOfScope: z.array(z.string()),
  expectedProof: z.string(),
  problems: z.array(z.string()),
  issueNumber: IssueNumberSchema.nullable(),
});
export type ProposedSpec = z.infer<typeof ProposedSpecSchema>;

export const ChallengeReportSchema = z.object({
  runId: z.string().nullable(),
  completedAt: IsoDateTimeSchema,
  summary: z.string(),
  items: z.array(ChallengeItemSchema),
  specs: z.array(ProposedSpecSchema),
  reply: z.string(),
});
export type ChallengeReport = z.infer<typeof ChallengeReportSchema>;

export const AttachmentSchema = z.object({ name: z.string(), url: z.string(), mediaType: z.string() });
export type Attachment = z.infer<typeof AttachmentSchema>;

export const RequestViewSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  requester: z.string(),
  channel: z.string(),
  receivedAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  state: z.enum(REQUEST_STATES),
  body: z.string(),
  attachments: z.array(AttachmentSchema),
  challenge: ChallengeReportSchema.nullable(),
  lastChallengeFailure: z.object({ at: IsoDateTimeSchema, reason: z.string() }).nullable(),
  issueNumbers: z.array(IssueNumberSchema),
  declineReason: z.string().nullable(),
});
export type RequestView = z.infer<typeof RequestViewSchema>;

// ---------------------------------------------------------------- delegated decisions

/** A gesture of the operator that the project's orchestrator made, with the reason it gave and the rule that allowed it. */
export const DelegatedDecisionViewSchema = z.object({
  at: IsoDateTimeSchema,
  actor: z.string().min(1),
  gesture: z.enum(DELEGABLE_GESTURES),
  target: z.object({ kind: z.enum(DELEGATED_TARGET_KINDS), number: IssueNumberSchema }),
  /** The issue whose record the gesture belongs to; the pull request's issue for a merge. */
  issueNumber: IssueNumberSchema,
  reason: z.string().min(1),
  rule: z.string().min(1),
});
export type DelegatedDecisionView = z.infer<typeof DelegatedDecisionViewSchema>;

/** What a project delegates, and to whom: the policy of its configuration. */
export const AutonomyViewSchema = z.object({
  actor: z.string().min(1),
  validateSpecs: z.boolean(),
  answerDecisions: z.boolean(),
  resume: z.boolean(),
  merge: z.array(z.object({ types: z.array(IssueTypeIdSchema), requires: z.array(z.enum(MERGE_CONDITIONS)) })),
});
export type AutonomyView = z.infer<typeof AutonomyViewSchema>;

// ---------------------------------------------------------------- issues

export const IssueSpecViewSchema = z.object({
  need: z.string(),
  acceptanceCriteria: z.array(z.string()),
  outOfScope: z.array(z.string()),
  expectedProof: z.string(),
  /** The film scenarios the spec declares for its pull request. */
  films: z.array(z.string().min(1)),
});
export type IssueSpecView = z.infer<typeof IssueSpecViewSchema>;

export const AcceptanceCheckSchema = z.object({
  path: z.string().min(1),
  /** The test runner the acceptance manifest names; null before the manifest is written. */
  runner: z.enum(TEST_RUNNERS).nullable(),
  sha256: z.string().nullable(),
  onBase: z.enum(BASE_EXPECTATIONS).nullable(),
  before: z.object({
    result: z.enum(BEFORE_RESULTS),
    detail: z.string(),
    score: z.number().nullable(),
    screenshotUrl: z.string().nullable(),
  }),
});
export type AcceptanceCheck = z.infer<typeof AcceptanceCheckSchema>;

export const AttemptSchema = z.object({
  index: CountSchema,
  kind: z.enum(ATTEMPT_KINDS),
  runId: z.string(),
  model: z.string(),
  effort: z.enum(EFFORT_LEVELS),
  startedAt: IsoDateTimeSchema,
  endedAt: IsoDateTimeSchema.nullable(),
  outcome: z.enum(ATTEMPT_OUTCOMES),
  summary: z.string(),
});
export type Attempt = z.infer<typeof AttemptSchema>;

export const EscalationSchema = z.object({ reason: z.string(), diagnosis: z.string(), since: IsoDateTimeSchema });
export type Escalation = z.infer<typeof EscalationSchema>;

export const IssueViewSchema = z.object({
  number: IssueNumberSchema,
  title: z.string(),
  type: IssueTypeIdSchema,
  state: z.enum(ISSUE_STATES),
  resumeTarget: z.enum(ISSUE_STATES).nullable(),
  paused: z.boolean(),
  spec: IssueSpecViewSchema,
  /** The issues this one is blocked by, as the forge records them. */
  dependsOn: z.array(IssueNumberSchema),
  requestId: z.string().nullable(),
  branch: z.string().nullable(),
  pullRequestNumber: IssueNumberSchema.nullable(),
  beforeProofKind: z.enum(BEFORE_PROOF_KINDS),
  checks: z.array(AcceptanceCheckSchema),
  checksFrozenAt: IsoDateTimeSchema.nullable(),
  attempts: z.array(AttemptSchema),
  escalation: EscalationSchema.nullable(),
  costUsd: AmountSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  url: z.string(),
  /** The gestures the project's orchestrator made on this issue or on its pull request, newest first. */
  delegated: z.array(DelegatedDecisionViewSchema),
});
export type IssueView = z.infer<typeof IssueViewSchema>;

// ---------------------------------------------------------------- runs

export const RunSubagentSchema = z.object({
  toolUseId: z.string(),
  description: z.string(),
  agentType: z.string(),
  status: z.enum(SUBAGENT_STATUSES),
});
export type RunSubagent = z.infer<typeof RunSubagentSchema>;

export const PendingQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  options: z.array(z.string()),
  askedAt: IsoDateTimeSchema,
});
export type PendingQuestion = z.infer<typeof PendingQuestionSchema>;

export const RunSubjectSchema = z.object({ kind: z.enum(RUN_SUBJECT_KINDS), id: z.string().min(1) });
export type RunSubject = z.infer<typeof RunSubjectSchema>;

export const RunViewSchema = z.object({
  id: z.string().min(1),
  /** The project the run works for; null for installation work. */
  project: ProjectIdSchema.nullable(),
  role: z.enum(AGENT_ROLES),
  model: z.string(),
  effort: z.enum(EFFORT_LEVELS),
  account: z.string().nullable(),
  status: z.enum(RUN_STATUSES),
  outcome: z.enum(AGENT_RUN_OUTCOMES).nullable(),
  subject: RunSubjectSchema,
  attempt: CountSchema,
  currentTool: z.string().nullable(),
  branch: z.string().nullable(),
  startedAt: IsoDateTimeSchema,
  endedAt: IsoDateTimeSchema.nullable(),
  usage: TokenUsageSchema,
  costUsd: AmountSchema,
  turns: CountSchema,
  maxTurns: CountSchema,
  maxBudgetUsd: AmountSchema,
  lastLine: z.string().nullable(),
  logLength: CountSchema,
  subagents: z.array(RunSubagentSchema),
  pendingQuestion: PendingQuestionSchema.nullable(),
});
export type RunView = z.infer<typeof RunViewSchema>;

// ---------------------------------------------------------------- pull requests

export const RunOutcomeSummarySchema = z.object({
  passed: CountSchema,
  failed: CountSchema,
  skipped: CountSchema,
  failures: z.array(z.object({ test: z.string(), message: z.string().nullable() })),
  missing: z.array(z.string()),
});
export type RunOutcomeSummary = z.infer<typeof RunOutcomeSummarySchema>;

export const CheckRunLogSchema = z.object({
  outcome: z.enum(CHECK_RUN_OUTCOMES),
  sha: z.string(),
  log: z.string(),
  summary: RunOutcomeSummarySchema.nullable(),
});
export type CheckRunLog = z.infer<typeof CheckRunLogSchema>;

export const EvalCaseScoreSchema = z.object({
  caseId: z.string(),
  /** What the case checks, when the project's evaluation names its cases. */
  label: z.string().nullable(),
  targeted: z.boolean(),
  baseScore: z.number(),
  branchScore: z.number(),
});
export type EvalCaseScore = z.infer<typeof EvalCaseScoreSchema>;

export const AcceptanceTestRowSchema = z.object({
  criterion: z.number().int().positive(),
  test: z.string(),
  name: z.string(),
  base: z.enum(BASE_TEST_RESULTS),
  branch: z.enum(BRANCH_TEST_RESULTS),
});
export type AcceptanceTestRowView = z.infer<typeof AcceptanceTestRowSchema>;

export const AcceptanceCriterionSchema = z.object({ criterion: z.number().int().positive(), text: z.string() });
export type AcceptanceCriterionView = z.infer<typeof AcceptanceCriterionSchema>;

export const EvidenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('image-compare'),
    id: z.string(),
    title: z.string(),
    caption: z.string(),
    beforeUrl: z.string(),
    afterUrl: z.string(),
    /** The image's size in pixels as its file declares it; null when the file could not be read as an image. */
    width: CountSchema.nullable(),
    height: CountSchema.nullable(),
  }),
  z.object({
    kind: z.literal('recording'),
    id: z.string(),
    title: z.string(),
    caption: z.string(),
    url: z.string(),
    posterUrl: z.string().nullable(),
    durationMs: CountSchema,
  }),
  z.object({
    kind: z.literal('red-green'),
    id: z.string(),
    title: z.string(),
    command: z.string(),
    before: CheckRunLogSchema,
    after: CheckRunLogSchema,
  }),
  z.object({
    kind: z.literal('acceptance-tests'),
    id: z.string(),
    title: z.string(),
    runner: z.enum(TEST_RUNNERS).nullable(),
    criteria: z.array(AcceptanceCriterionSchema),
    rows: z.array(AcceptanceTestRowSchema),
  }),
  z.object({
    kind: z.literal('eval-scores'),
    id: z.string(),
    title: z.string(),
    runsPerCase: CountSchema,
    minimumDelta: z.number(),
    regressionTolerance: z.number(),
    cases: z.array(EvalCaseScoreSchema),
  }),
  z.object({ kind: z.literal('report'), id: z.string(), title: z.string(), body: z.string() }),
]);
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ReviewFindingViewSchema = z.object({
  severity: z.enum(REVIEW_SEVERITIES),
  category: z.enum(REVIEW_CATEGORIES),
  file: z.string().nullable(),
  line: CountSchema.nullable(),
  summary: z.string(),
  resolved: z.boolean(),
});
export type ReviewFindingView = z.infer<typeof ReviewFindingViewSchema>;

export const ReviewRoundSchema = z.object({
  round: CountSchema,
  runId: z.string(),
  completedAt: IsoDateTimeSchema,
  findings: z.array(ReviewFindingViewSchema),
});
export type ReviewRound = z.infer<typeof ReviewRoundSchema>;

export const ExternalFeedbackSchema = z.object({
  id: z.string(),
  author: z.string(),
  source: z.string(),
  receivedAt: IsoDateTimeSchema,
  body: z.string(),
  cycleStarted: z.boolean(),
});
export type ExternalFeedback = z.infer<typeof ExternalFeedbackSchema>;

/** A file the change touched; its patch is read on demand from the pull request's diff. */
export const ChangedFileSchema = z.object({
  path: z.string(),
  additions: CountSchema,
  deletions: CountSchema,
});
export type ChangedFile = z.infer<typeof ChangedFileSchema>;

export const FilePatchSchema = z.object({
  path: z.string(),
  patch: z.string(),
  /** Whether the patch was cut because the file's change is too large to show whole. */
  truncated: z.boolean(),
});
export type FilePatchView = z.infer<typeof FilePatchSchema>;

/** What a pull request changes, from the base it started from to its head, read from the factory's clone. */
export const PullRequestDiffSchema = z.object({
  pullRequestNumber: IssueNumberSchema,
  baseSha: z.string(),
  headSha: z.string(),
  readAt: IsoDateTimeSchema,
  files: z.array(FilePatchSchema),
});
export type PullRequestDiff = z.infer<typeof PullRequestDiffSchema>;

export const CheckRunViewSchema = z.object({
  name: z.string(),
  conclusion: z.enum(CHECK_CONCLUSIONS),
  url: z.string(),
  durationMs: CountSchema.nullable(),
  /** A failing check that fails the same way on the base branch: the change did not cause it, and it does not block the merge. */
  failsOnBase: z.boolean(),
});
export type CheckRunView = z.infer<typeof CheckRunViewSchema>;

/** Where a film stands: waiting its turn, in one of the stages of its recording, or ended. */
export const FILM_ORDER_STATES = ['queued', 'recording-base', 'recording-head', 'committing', 'finished', 'failed'] as const;
export type FilmOrderState = (typeof FILM_ORDER_STATES)[number];
export const PENDING_FILM_STATES: readonly FilmOrderState[] = ['queued', 'recording-base', 'recording-head', 'committing'];

export const FilmFactSchema = z.object({ label: z.string().min(1), value: z.string() });
export type FilmFact = z.infer<typeof FilmFactSchema>;

/** One recording of a film: the commit it was taken at, its video, its screenshots and the facts the report gave. */
export const FilmPhaseViewSchema = z.object({
  sha: z.string().min(1),
  videoUrl: z.string().min(1),
  /** The final screenshot first, then the key frames. */
  screenshotUrls: z.array(z.string().min(1)),
  facts: z.array(FilmFactSchema),
});
export type FilmPhaseView = z.infer<typeof FilmPhaseViewSchema>;

/** A scenario recorded on the base and on the head of the pull request. */
export const FilmViewSchema = z.object({
  scenario: z.string().min(1),
  recordedAt: IsoDateTimeSchema,
  before: FilmPhaseViewSchema,
  after: FilmPhaseViewSchema,
});
export type FilmView = z.infer<typeof FilmViewSchema>;

/** A scenario ordered for the pull request, and where its film stands in the installation's queue. */
export const FilmOrderViewSchema = z.object({
  scenario: z.string().min(1),
  operator: z.string().min(1),
  state: z.enum(FILM_ORDER_STATES),
  /** When the film is expected to be recorded, estimated at `generatedAt` of the snapshot; null once it ended. */
  expectedAt: IsoDateTimeSchema.nullable(),
  /** The films, of any project, that finish before this one. */
  filmsAhead: CountSchema,
  reason: z.string().nullable(),
  since: IsoDateTimeSchema,
});
export type FilmOrderView = z.infer<typeof FilmOrderViewSchema>;

/** A link to a file of a pull request, made reachable by the operator's upload command. */
export const MediaLinkViewSchema = z.object({ label: z.string().min(1), url: z.string().min(1) });
export type MediaLinkView = z.infer<typeof MediaLinkViewSchema>;

/** What keeps the ready notice of a pull request from going out. */
export const ReadyHoldViewSchema = z.discriminatedUnion('kind', [
  /** The checks of the head that have not completed; none named means that no check of the head is known yet. */
  z.object({ kind: z.literal('checks-running'), checks: z.array(z.string().min(1)) }),
  /** The checks of the head that failed or were cancelled, whether the merge requires them or not. */
  z.object({ kind: z.literal('checks-failed'), checks: z.array(z.string().min(1)) }),
  z.object({ kind: z.literal('films-pending'), scenarios: z.array(z.string().min(1)) }),
  z.object({ kind: z.literal('films-failed'), scenarios: z.array(z.string().min(1)) }),
]);
export type ReadyHoldView = z.infer<typeof ReadyHoldViewSchema>;

/** The notice that the pull request is ready to merge: sent for its head with the links it carried, held, or due. */
export const ReadyNoticeViewSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal(READY_NOTICE_STATUSES[0]),
    sentAt: IsoDateTimeSchema,
    headSha: z.string().min(1),
    links: z.array(MediaLinkViewSchema),
    /** The files whose upload failed, with the reason, so their link is missing. */
    failures: z.array(z.object({ label: z.string().min(1), reason: z.string().min(1) })),
  }),
  z.object({
    status: z.literal(READY_NOTICE_STATUSES[1]),
    holds: z.array(ReadyHoldViewSchema).min(1),
    /** When the checks the hold depends on were last read from the forge; null when they never were. */
    checksReadAt: IsoDateTimeSchema.nullable(),
  }),
  z.object({
    status: z.literal(READY_NOTICE_STATUSES[2]),
    /** When the checks that make the notice due were last read from the forge; null when they never were. */
    checksReadAt: IsoDateTimeSchema.nullable(),
  }),
  z.object({ status: z.literal(READY_NOTICE_STATUSES[3]) }),
]);
export type ReadyNoticeView = z.infer<typeof ReadyNoticeViewSchema>;

export const PullRequestViewSchema = z.object({
  number: IssueNumberSchema,
  title: z.string(),
  issueNumber: IssueNumberSchema,
  type: IssueTypeIdSchema,
  branch: z.string(),
  url: z.string(),
  headSha: z.string(),
  state: z.enum(PULL_REQUEST_STATES),
  openedAt: IsoDateTimeSchema,
  mergedAt: IsoDateTimeSchema.nullable(),
  /** The check runs of the head commit, as last read from the forge. */
  checks: readingOf(z.array(CheckRunViewSchema)),
  evidenceComplete: z.boolean(),
  missingEvidence: z.array(z.string()),
  evidence: z.array(EvidenceSchema),
  /** The scenarios recorded on this pull request. */
  films: z.array(FilmViewSchema),
  /** The scenarios ordered for it, whichever way they ended or wait. */
  filmOrders: z.array(FilmOrderViewSchema),
  /** The notice that the pull request is ready to merge, with the links to its media. */
  readyNotice: ReadyNoticeViewSchema,
  /** The gestures the project's orchestrator made on this pull request, newest first. */
  delegated: z.array(DelegatedDecisionViewSchema),
  reviewRounds: z.array(ReviewRoundSchema),
  externalFeedback: z.array(ExternalFeedbackSchema),
  files: z.array(ChangedFileSchema),
  mergeable: z.boolean(),
  mergeBlockers: z.array(z.string()),
});
export type PullRequestView = z.infer<typeof PullRequestViewSchema>;

export const WorkflowRunSchema = z.object({
  id: z.string(),
  workflow: z.string(),
  title: z.string(),
  branch: z.string(),
  sha: z.string(),
  trigger: z.string(),
  status: z.enum(WORKFLOW_STATUSES),
  conclusion: z.enum(CHECK_CONCLUSIONS).nullable(),
  actor: z.string().nullable(),
  startedAt: IsoDateTimeSchema,
  durationMs: CountSchema.nullable(),
  url: z.string(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

// ---------------------------------------------------------------- delivery

/** A commit of the base branch that a deployment brought, or that an environment still waits for. */
export const DeliveredCommitSchema = z.object({
  sha: z.string(),
  /** The first line of the commit's message. */
  headline: z.string(),
  /** Who made the commit, as the repository records it. */
  author: z.string(),
  committedAt: IsoDateTimeSchema,
  /** The pull request of the factory that was squash-merged as this commit; null for any other commit. */
  pullRequestNumber: IssueNumberSchema.nullable(),
  /** The issue that pull request closes. */
  issueNumber: IssueNumberSchema.nullable(),
});
export type DeliveredCommit = z.infer<typeof DeliveredCommitSchema>;

export const DeploymentSchema = z.object({
  id: z.string(),
  version: z.string(),
  ref: z.string(),
  sha: z.string(),
  deployedAt: IsoDateTimeSchema,
  /** Who started the deployment, when the forge says. */
  actor: z.string().nullable(),
  outcome: z.enum(DEPLOYMENT_OUTCOMES),
  workflowUrl: z.string().nullable(),
  /** The commits this deployment brought, read from the project's clone; null when the clone cannot say, an empty list when it brought none. */
  changes: z.array(DeliveredCommitSchema).nullable(),
});
export type Deployment = z.infer<typeof DeploymentSchema>;

export const HealthSampleSchema = z.object({
  at: IsoDateTimeSchema,
  ok: z.boolean(),
  statusCode: CountSchema.nullable(),
  latencyMs: CountSchema.nullable(),
  detail: z.string(),
});
export type HealthSample = z.infer<typeof HealthSampleSchema>;

export const HealthCheckViewSchema = z.object({
  name: z.string(),
  url: z.string(),
  latest: HealthSampleSchema.nullable(),
  /** Samples of the last day, oldest first. */
  series: z.array(HealthSampleSchema),
});
export type HealthCheckView = z.infer<typeof HealthCheckViewSchema>;

export const EnvironmentViewSchema = z.object({
  name: z.string().min(1),
  production: z.boolean(),
  promotion: z.enum(PROMOTION_POLICIES),
  status: z.enum(ENVIRONMENT_STATUSES),
  /** Null when the project declares no deployment source for this environment. */
  deployments: readingOf(
    z.object({
      current: DeploymentSchema.nullable(),
      history: z.array(DeploymentSchema),
      /** The commits of the base branch the current deployment lacks; null when nothing is deployed or the clone cannot say. */
      pending: z.array(DeliveredCommitSchema).nullable(),
    }),
  ).nullable(),
  health: z.array(HealthCheckViewSchema),
  redeployable: z.boolean(),
  workflowUrl: z.string().nullable(),
});
export type EnvironmentView = z.infer<typeof EnvironmentViewSchema>;

export const ReleaseCommitSchema = z.object({
  sha: z.string(),
  message: z.string(),
  /** The commit's author login, when the forge says. */
  author: z.string().nullable(),
  pullRequestNumber: IssueNumberSchema.nullable(),
  issueNumber: IssueNumberSchema.nullable(),
  attribution: z.enum(COMMIT_ATTRIBUTIONS),
  /** The automation the project names, for a change attributed to one. */
  automation: z.string().nullable(),
  auditId: z.string().nullable(),
  evidenceComplete: z.boolean().nullable(),
});
export type ReleaseCommit = z.infer<typeof ReleaseCommitSchema>;

export const ReleaseHealthCheckViewSchema = z.object({ environment: z.string(), name: z.string(), passed: z.boolean(), detail: z.string() });
export type ReleaseHealthCheckView = z.infer<typeof ReleaseHealthCheckViewSchema>;

export const ReleaseGateViewSchema = z.object({
  promotable: z.boolean(),
  blockingReasons: z.array(z.string()),
  evaluatedAt: IsoDateTimeSchema.nullable(),
});
export type ReleaseGateView = z.infer<typeof ReleaseGateViewSchema>;

export const ReleaseViewSchema = z.object({
  id: z.string().min(1),
  state: z.enum(RELEASE_STATES),
  source: z.enum(RELEASE_SOURCES),
  /** The release pull request or the tag, with the time the forge created it. */
  ref: z.string(),
  title: z.string(),
  pullRequestNumber: IssueNumberSchema.nullable(),
  createdAt: IsoDateTimeSchema.nullable(),
  /** When the factory noticed the release, which is not when it was created. */
  detectedAt: IsoDateTimeSchema,
  cutAt: IsoDateTimeSchema.nullable(),
  promotedAt: IsoDateTimeSchema.nullable(),
  verifiedAt: IsoDateTimeSchema.nullable(),
  /** A release pull request whose version is already published: shown, never pending. */
  supersededBy: z.string().nullable(),
  commits: z.array(ReleaseCommitSchema),
  gate: ReleaseGateViewSchema,
  health: z.array(ReleaseHealthCheckViewSchema),
  productionWorkflowUrl: z.string().nullable(),
  report: z.string(),
});
export type ReleaseView = z.infer<typeof ReleaseViewSchema>;

// ---------------------------------------------------------------- audits

export const AuditFindingViewSchema = z.object({
  level: z.enum(AUDIT_FINDING_LEVELS),
  statement: z.string(),
  evidence: z.string(),
});
export type AuditFindingView = z.infer<typeof AuditFindingViewSchema>;

export const AuditConclusionViewSchema = z.object({
  runId: z.string(),
  summary: z.string(),
  findings: z.array(AuditFindingViewSchema),
  proposedFix: z.string().nullable(),
});
export type AuditConclusionView = z.infer<typeof AuditConclusionViewSchema>;

export const AuditIssueDraftViewSchema = z.object({ title: z.string(), body: z.string() });
export type AuditIssueDraftView = z.infer<typeof AuditIssueDraftViewSchema>;

export const AuditViewSchema = z.object({
  id: z.string().min(1),
  commitSha: z.string(),
  reason: z.enum(AUDIT_REASONS),
  commitMessage: z.string(),
  authorLogin: z.string().nullable(),
  pullRequestNumber: IssueNumberSchema.nullable(),
  /** The forge's page of the change's pull request. */
  pullRequestUrl: z.string().nullable(),
  branch: z.string().nullable(),
  state: z.enum(AUDIT_STATES),
  detectedAt: IsoDateTimeSchema,
  /** The files the change touched, as read from the forge; null until they are read. */
  changedFiles: z.array(z.string()).nullable(),
  /** The issue type whose paths the change touches first, once its files are read. */
  suggestedType: IssueTypeIdSchema.nullable(),
  releaseId: z.string().nullable(),
  conclusion: AuditConclusionViewSchema.nullable(),
  failureCount: CountSchema,
  lastFailure: z.string().nullable(),
  draft: AuditIssueDraftViewSchema.nullable(),
  publishedIssueNumber: IssueNumberSchema.nullable(),
  /** The page the forge gives the issue published from the audit; the factory does not list that issue, so this is where its number leads. */
  publishedIssueUrl: z.string().nullable(),
  /** When the issue was published from the audit; null before it was. */
  publishedIssueAt: IsoDateTimeSchema.nullable(),
  resolved: z.boolean(),
  resolutionNote: z.string().nullable(),
});
export type AuditView = z.infer<typeof AuditViewSchema>;

/** A change of another automation of the repository, recorded without an audit. */
export const SkippedChangeViewSchema = z.object({
  commitSha: z.string(),
  automation: z.string(),
  commitMessage: z.string(),
  authorLogin: z.string().nullable(),
  pullRequestNumber: IssueNumberSchema.nullable(),
  /** The forge's page of the change's pull request. */
  pullRequestUrl: z.string().nullable(),
  branch: z.string().nullable(),
  recordedAt: IsoDateTimeSchema,
});
export type SkippedChangeView = z.infer<typeof SkippedChangeViewSchema>;

// ---------------------------------------------------------------- knowledge

export const KnowledgeDocumentSchema = z.object({ path: z.string(), title: z.string(), bytes: CountSchema });
export type KnowledgeDocument = z.infer<typeof KnowledgeDocumentSchema>;

export const KnowledgeSourceViewSchema = z.object({
  kind: z.enum(KNOWLEDGE_SOURCE_KINDS),
  location: z.string(),
  documents: readingOf(z.array(KnowledgeDocumentSchema)),
});
export type KnowledgeSourceView = z.infer<typeof KnowledgeSourceViewSchema>;

// ---------------------------------------------------------------- references

/** Where the snapshot of a reference stands, and the commit it names. */
export const ReferenceSnapshotSchema = z.object({
  status: z.enum(REFERENCE_SNAPSHOT_STATUSES),
  /** The commit of the snapshot when it is ready, the one the source's ref resolves to when it is not built yet, otherwise null. */
  commit: z.string().min(1).nullable(),
});
export type ReferenceSnapshot = z.infer<typeof ReferenceSnapshotSchema>;

/** A repository the project's specifications cite, with its own reading: one unreadable snapshot leaves the others in place. */
export const ReferenceViewSchema = z.object({
  name: z.string().min(1),
  repository: z.string().min(1),
  ref: z.string().min(1),
  snapshot: readingOf(ReferenceSnapshotSchema),
});
export type ReferenceView = z.infer<typeof ReferenceViewSchema>;

// ---------------------------------------------------------------- tools

/** A tool the installation or a project checks, listed whether or not it was checked yet. */
/** One run of a tool's login or keep-alive: how it ended, never what it printed. */
export const ToolSessionViewSchema = z.object({
  at: IsoDateTimeSchema,
  outcome: z.enum(TOOL_SESSION_OUTCOMES),
  detail: z.string(),
  operator: z.string(),
});
export type ToolSessionView = z.infer<typeof ToolSessionViewSchema>;

export const ToolViewSchema = z.object({
  name: z.string().min(1),
  scope: z.enum(TOOL_SCOPES),
  builtIn: z.boolean(),
  description: z.string().nullable(),
  /** Null until the tool is checked for the first time. */
  status: z.enum(TOOL_STATUSES).nullable(),
  version: z.string().nullable(),
  detail: z.string().nullable(),
  fixCommand: z.string().nullable(),
  installHint: z.string().nullable(),
  checkedAt: IsoDateTimeSchema.nullable(),
  /** The login `tools.login` starts, as the configuration declares it; null when the tool declares none. */
  loginCommand: z.string().nullable(),
  lastLogin: ToolSessionViewSchema.nullable(),
  /** The command the factory runs on a schedule to keep the tool's session alive, and its last run. */
  keepAlive: z.object({ command: z.string(), everyMinutes: z.number().positive(), last: ToolSessionViewSchema.nullable() }).nullable(),
});
export type ToolView = z.infer<typeof ToolViewSchema>;

// ---------------------------------------------------------------- settings

export const RoleSettingSchema = z.object({
  role: z.enum(AGENT_ROLES),
  model: z.string().min(1),
  effort: z.enum(EFFORT_LEVELS),
  maxBudgetUsd: AmountSchema,
  maxTurns: CountSchema,
  timeoutMinutes: CountSchema,
});
export type RoleSetting = z.infer<typeof RoleSettingSchema>;

export const IssueTypeInfoSchema = z.object({
  id: IssueTypeIdSchema,
  label: z.string().min(1),
  proof: z.enum(PROOF_STRATEGIES),
  checks: z.string(),
  commitType: z.string(),
  commitScope: z.string().nullable(),
});
export type IssueTypeInfo = z.infer<typeof IssueTypeInfoSchema>;

export const NamedCommandViewSchema = z.object({ name: z.string(), run: z.string(), network: z.string().nullable() });
export type NamedCommandView = z.infer<typeof NamedCommandViewSchema>;

export const ProjectSettingsViewSchema = z.object({
  roles: z.array(RoleSettingSchema),
  /** The roles whose prompt the project overrides. */
  overriddenPrompts: z.array(z.enum(AGENT_ROLES)),
  concurrency: z.object({ issues: CountSchema, ceiling: CountSchema }),
  setup: z.array(NamedCommandViewSchema),
  gate: z.object({
    beforeAcceptance: z.array(NamedCommandViewSchema),
    afterAcceptance: z.array(NamedCommandViewSchema),
    timeoutMinutes: CountSchema,
  }),
  /** Names of the variables passed to check commands; values stay on the machine. */
  environmentVariables: z.array(z.string()),
  labels: z.object({ factory: z.string(), validated: z.string(), audit: z.string(), kindPrefix: z.string() }),
  branchPrefix: z.string(),
  automations: z.array(z.object({ name: z.string(), branches: z.array(z.string()), authors: z.array(z.string()) })),
  releaseModel: z.enum(RELEASE_MODEL_KINDS),
  /** The films of the project's pull requests; null when the project declares no film command. */
  films: z.object({ timeZone: z.string().min(1), timeoutMinutes: CountSchema, tools: z.array(z.string().min(1)) }).nullable(),
  /** What the project delegates to its orchestrator. */
  autonomy: AutonomyViewSchema,
});
export type ProjectSettingsView = z.infer<typeof ProjectSettingsViewSchema>;

export const NotificationChannelViewSchema = z.object({
  kind: z.enum(NOTIFICATION_CHANNEL_KINDS),
  /** False when the environment variable that holds the channel's secret is not set. */
  configured: z.boolean(),
});
export type NotificationChannelView = z.infer<typeof NotificationChannelViewSchema>;

export const InstallationSettingsViewSchema = z.object({
  models: z.array(z.string()),
  defaultRoles: z.array(RoleSettingSchema),
  resources: z.object({
    minimumFreeMemoryPercent: PercentSchema,
    pauseAbovePressure: z.enum(PAUSE_ABOVE_PRESSURE_LEVELS),
    maxConcurrentRuns: CountSchema,
  }),
  notifications: z.array(NotificationChannelViewSchema),
  remoteAccess: z.enum(['none', 'tailscale']),
  /** The configuration file and what its last reload left pending: settings that apply only after a restart, or the reason it was refused. */
  configuration: z.object({
    path: z.string(),
    restartRequired: z.array(z.string()),
    reloadFailure: z.object({ at: IsoDateTimeSchema, reason: z.string() }).nullable(),
  }),
});
export type InstallationSettingsView = z.infer<typeof InstallationSettingsViewSchema>;

// ---------------------------------------------------------------- usage, costs, resources

export const UsageLimitViewSchema = z.object({
  kind: z.enum(USAGE_LIMIT_KINDS),
  /** The model of a weekly limit scoped to one model. */
  scope: z.string().nullable(),
  utilization: RatioSchema,
  resetsAt: IsoDateTimeSchema.nullable(),
  freshness: z.enum(USAGE_FRESHNESS),
  /** The utilization at which the factory pauses for this limit. */
  pauseAt: RatioSchema,
});
export type UsageLimitView = z.infer<typeof UsageLimitViewSchema>;

export const UsageAccountViewSchema = z.object({
  name: z.string().min(1),
  billing: z.enum(BILLING_MODES),
  /** Who the account is logged in as, from its last usage report; null until one names it. */
  identity: z.object({ email: z.string().nullable(), organization: z.string().nullable(), plan: z.string().nullable() }).nullable(),
  limits: z.array(UsageLimitViewSchema),
  source: z.enum(USAGE_SOURCES).nullable(),
  readAt: IsoDateTimeSchema.nullable(),
  lastFailure: z.object({ at: IsoDateTimeSchema, reason: z.string() }).nullable(),
});
export type UsageAccountView = z.infer<typeof UsageAccountViewSchema>;

export const UsageViewSchema = z.object({
  accounts: z.array(UsageAccountViewSchema),
  refreshMinutes: CountSchema,
  staleAfterMinutes: CountSchema,
});
export type UsageView = z.infer<typeof UsageViewSchema>;

export const DailyCostSchema = z.object({ date: IsoDateSchema, costUsd: AmountSchema, runs: CountSchema, tokens: TokenTotalsSchema });
export type DailyCost = z.infer<typeof DailyCostSchema>;

export const CostEntrySchema = z.object({ key: z.string(), costUsd: AmountSchema, runs: CountSchema, tokens: TokenTotalsSchema });
export type CostEntry = z.infer<typeof CostEntrySchema>;

export const DailyCapViewSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('none') }), z.object({ kind: z.literal('usd'), amount: AmountSchema })]);
export type DailyCapView = z.infer<typeof DailyCapViewSchema>;

export const CostsViewSchema = z.object({
  /** What the dollar figures mean; under a subscription they are the API price of the same usage. */
  basis: z.enum(COST_BASIS_VIEWS),
  today: z.object({ date: IsoDateSchema, costUsd: AmountSchema, runs: CountSchema }),
  monthToDateUsd: AmountSchema,
  dailyCap: DailyCapViewSchema,
  perRunCapUsd: AmountSchema.nullable(),
  tokens: TokenTotalsSchema,
  daily: z.array(DailyCostSchema),
  byProject: z.array(CostEntrySchema),
  byRole: z.array(CostEntrySchema),
  byModel: z.array(CostEntrySchema),
  byIssue: z.array(CostEntrySchema.extend({ project: ProjectIdSchema, issueNumber: IssueNumberSchema })),
});
export type CostsView = z.infer<typeof CostsViewSchema>;

export const ResourceSampleSchema = z.object({ freeMemoryPercent: PercentSchema, pressure: z.enum(MEMORY_PRESSURES) });
export type ResourceSample = z.infer<typeof ResourceSampleSchema>;

export const ResourcesViewSchema = z.object({
  sample: readingOf(ResourceSampleSchema),
  minimumFreeMemoryPercent: PercentSchema,
  pauseAbovePressure: z.enum(PAUSE_ABOVE_PRESSURE_LEVELS),
  schedulingPaused: z.boolean(),
});
export type ResourcesView = z.infer<typeof ResourcesViewSchema>;

// ---------------------------------------------------------------- projects

/** An issue that keeps a worktree of the project's pool, with the pull request it waits at, if any. */
export const WorktreeHolderViewSchema = z.object({
  issueNumber: IssueNumberSchema,
  state: z.enum(ISSUE_STATES).nullable(),
  pullRequestNumber: IssueNumberSchema.nullable(),
});
export type WorktreeHolderView = z.infer<typeof WorktreeHolderViewSchema>;

/** Validated issues that wait only because every worktree of the project's pool is held. */
export const WorktreeShortageViewSchema = z.object({
  /** When the condition began; later changes of who waits or who holds do not move it. */
  since: IsoDateTimeSchema,
  poolSize: CountSchema,
  /** The issues that would start if a worktree were free. */
  waiting: z.array(IssueNumberSchema),
  holders: z.array(WorktreeHolderViewSchema),
});
export type WorktreeShortageView = z.infer<typeof WorktreeShortageViewSchema>;

/** What the project's scheduler records besides its pauses. */
export const ProjectSchedulerViewSchema = z.object({
  worktreeShortage: WorktreeShortageViewSchema.nullable(),
});
export type ProjectSchedulerView = z.infer<typeof ProjectSchedulerViewSchema>;

/**
 * The tool the films of a project wait for while its check fails: they stay queued, and none fails, until every tool
 * the project lists passes.
 */
export const FilmToolWaitViewSchema = z.object({
  tool: z.string().min(1),
  /** Whether the installation declares the tool or the project does: it tells which tools list the tool is checked from. */
  scope: z.enum(TOOL_SCOPES),
  status: z.enum(TOOL_FAILURE_STATUSES),
  /** What the check printed, as the tool's check gave it. */
  detail: z.string(),
  /** The login the tool declares, which the cockpit starts; null when it declares none. */
  loginCommand: z.string().nullable(),
  /** What the check says to run when it fails; null when it says nothing. */
  fixCommand: z.string().nullable(),
  /** When the films began to wait. */
  since: IsoDateTimeSchema,
  /** When the tool was last read failing. */
  checkedAt: IsoDateTimeSchema,
});
export type FilmToolWaitView = z.infer<typeof FilmToolWaitViewSchema>;

export const ProjectViewSchema = z.object({
  id: ProjectIdSchema,
  name: z.string().min(1),
  repository: z.string().min(1),
  forge: z.object({ kind: z.enum(FORGE_KINDS), url: z.string().nullable() }),
  baseBranch: z.string().min(1),
  /** The project's own pauses, on top of the installation's. */
  pauses: z.array(PauseViewSchema),
  scheduler: ProjectSchedulerViewSchema,
  /** Null while the films of the project wait for no tool. */
  filmToolWait: FilmToolWaitViewSchema.nullable(),
  issueTypes: z.array(IssueTypeInfoSchema),
  requests: z.array(RequestViewSchema),
  issues: z.array(IssueViewSchema),
  pullRequests: z.array(PullRequestViewSchema),
  /** Null when the project's forge has no workflow runs. */
  workflows: readingOf(z.array(WorkflowRunSchema)).nullable(),
  environments: z.array(EnvironmentViewSchema),
  releases: z.array(ReleaseViewSchema),
  audits: z.array(AuditViewSchema),
  skippedChanges: z.array(SkippedChangeViewSchema),
  knowledge: z.array(KnowledgeSourceViewSchema),
  references: z.array(ReferenceViewSchema),
  tools: z.array(ToolViewSchema),
  settings: ProjectSettingsViewSchema,
  /** The gestures the project's orchestrator made in place of the operator, newest first; the oldest are left out. */
  delegatedDecisions: z.array(DelegatedDecisionViewSchema),
});
export type ProjectView = z.infer<typeof ProjectViewSchema>;

export const CockpitSnapshotSchema = z.object({
  sequence: CountSchema,
  generatedAt: IsoDateTimeSchema,
  installation: InstallationInfoSchema,
  /** The latest events of the installation, newest first, for the activity feed. */
  activity: z.array(StreamEventSchema),
  projects: z.array(ProjectViewSchema),
  runs: z.array(RunViewSchema),
  usage: UsageViewSchema,
  costs: CostsViewSchema,
  resources: ResourcesViewSchema,
  tools: z.array(ToolViewSchema),
  settings: InstallationSettingsViewSchema,
});
export type CockpitSnapshot = z.infer<typeof CockpitSnapshotSchema>;
