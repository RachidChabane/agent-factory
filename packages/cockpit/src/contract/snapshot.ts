import { z } from 'zod';
import {
  AGENT_ROLES,
  AUDIT_REASONS,
  BASE_EXPECTATIONS,
  BASE_TEST_RESULTS,
  BRANCH_TEST_RESULTS,
  AUDIT_STATES,
  BEFORE_PROOF_KINDS,
  EFFORT_LEVELS,
  ISSUE_STATES,
  PROOF_STRATEGIES,
  RELEASE_STATES,
  REQUEST_STATES,
  REVIEW_CATEGORIES,
  REVIEW_SEVERITIES,
  TEST_RUNNERS,
} from '@agent-factory/domain';
import {
  AmountSchema,
  CountSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  IssueNumberSchema,
  IssueTypeIdSchema,
  PercentSchema,
  SubscriptionWindowSchema,
  TokenUsageSchema,
} from './primitives.ts';
import {
  AGENT_RUN_OUTCOMES,
  ALERT_SEVERITIES,
  ALERT_STATES,
  ATTEMPT_KINDS,
  ATTEMPT_OUTCOMES,
  AUDIT_FINDING_LEVELS,
  BEFORE_RESULTS,
  CHALLENGE_VERDICTS,
  CHECK_CONCLUSIONS,
  CHECK_KINDS,
  CHECK_RUN_OUTCOMES,
  COMMIT_ATTRIBUTIONS,
  DECISION_STATUSES,
  DEPLOYMENT_OUTCOMES,
  ENVIRONMENT_STATUSES,
  ENVIRONMENTS,
  FEEDBACK_RATINGS,
  MEMORY_PRESSURES,
  METRIC_UNITS,
  POD_STATUSES,
  PULL_REQUEST_STATES,
  RUN_STATUSES,
  RUN_SUBJECT_KINDS,
  SOURCE_KINDS,
  SUBAGENT_STATUSES,
  TOOL_STATUSES,
  WORKFLOW_STATUSES,
  WORKFLOW_TRIGGERS,
} from './vocabulary.ts';

export const IssueTypeInfoSchema = z.object({ id: IssueTypeIdSchema, label: z.string().min(1), proof: z.enum(PROOF_STRATEGIES) });
export type IssueTypeInfo = z.infer<typeof IssueTypeInfoSchema>;

export const FactoryInfoSchema = z.object({
  repository: z.string().min(1),
  defaultBranch: z.string().min(1),
  operator: z.string().min(1),
  schedulerPaused: z.boolean(),
  /** The issue types of the project, in its order. */
  issueTypes: z.array(IssueTypeInfoSchema),
});
export type FactoryInfo = z.infer<typeof FactoryInfoSchema>;

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
  validated: z.boolean(),
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
  issueNumbers: z.array(IssueNumberSchema),
  declineReason: z.string().nullable(),
});
export type RequestView = z.infer<typeof RequestViewSchema>;

export const IssueSpecViewSchema = z.object({
  need: z.string(),
  acceptanceCriteria: z.array(z.string()),
  outOfScope: z.array(z.string()),
  expectedProof: z.string(),
});
export type IssueSpecView = z.infer<typeof IssueSpecViewSchema>;

export const AcceptanceCheckSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(CHECK_KINDS),
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
  dependsOn: z.array(IssueNumberSchema),
  requestId: z.string().nullable(),
  branch: z.string().nullable(),
  pullRequestNumber: IssueNumberSchema.nullable(),
  beforeProofKind: z.enum(BEFORE_PROOF_KINDS),
  checks: z.array(AcceptanceCheckSchema),
  checksFrozenAt: IsoDateTimeSchema.nullable(),
  attempts: z.array(AttemptSchema),
  escalation: EscalationSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  url: z.string(),
});
export type IssueView = z.infer<typeof IssueViewSchema>;

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
  role: z.enum(AGENT_ROLES),
  model: z.string(),
  effort: z.enum(EFFORT_LEVELS),
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
  label: z.string(),
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
    width: CountSchema,
    height: CountSchema,
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

export const ChangedFileSchema = z.object({
  path: z.string(),
  additions: CountSchema,
  deletions: CountSchema,
  patch: z.string(),
});
export type ChangedFile = z.infer<typeof ChangedFileSchema>;

export const CheckRunViewSchema = z.object({
  name: z.string(),
  conclusion: z.enum(CHECK_CONCLUSIONS),
  url: z.string(),
  durationMs: CountSchema.nullable(),
});
export type CheckRunView = z.infer<typeof CheckRunViewSchema>;

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
  checks: z.array(CheckRunViewSchema),
  evidenceComplete: z.boolean(),
  missingEvidence: z.array(z.string()),
  evidence: z.array(EvidenceSchema),
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
  trigger: z.enum(WORKFLOW_TRIGGERS),
  status: z.enum(WORKFLOW_STATUSES),
  conclusion: z.enum(CHECK_CONCLUSIONS).nullable(),
  actor: z.string(),
  startedAt: IsoDateTimeSchema,
  durationMs: CountSchema.nullable(),
  url: z.string(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

export const DeploymentSchema = z.object({
  id: z.string(),
  version: z.string(),
  sha: z.string(),
  deployedAt: IsoDateTimeSchema,
  actor: z.string(),
  outcome: z.enum(DEPLOYMENT_OUTCOMES),
  workflowUrl: z.string(),
});
export type Deployment = z.infer<typeof DeploymentSchema>;

export const EnvironmentViewSchema = z.object({
  name: z.enum(ENVIRONMENTS),
  url: z.string(),
  status: z.enum(ENVIRONMENT_STATUSES),
  current: DeploymentSchema.nullable(),
  history: z.array(DeploymentSchema),
});
export type EnvironmentView = z.infer<typeof EnvironmentViewSchema>;

export const ReleaseCommitSchema = z.object({
  sha: z.string(),
  message: z.string(),
  author: z.string(),
  pullRequestNumber: IssueNumberSchema.nullable(),
  issueNumber: IssueNumberSchema.nullable(),
  attribution: z.enum(COMMIT_ATTRIBUTIONS),
  auditId: z.string().nullable(),
  evidenceComplete: z.boolean().nullable(),
});
export type ReleaseCommit = z.infer<typeof ReleaseCommitSchema>;

export const PrepHealthCheckViewSchema = z.object({ name: z.string(), passed: z.boolean(), detail: z.string() });
export type PrepHealthCheckView = z.infer<typeof PrepHealthCheckViewSchema>;

export const ReleaseGateViewSchema = z.object({
  promotable: z.boolean(),
  blockingReasons: z.array(z.string()),
  evaluatedAt: IsoDateTimeSchema.nullable(),
});
export type ReleaseGateView = z.infer<typeof ReleaseGateViewSchema>;

export const ReleaseViewSchema = z.object({
  id: z.string().min(1),
  state: z.enum(RELEASE_STATES),
  branch: z.string(),
  createdAt: IsoDateTimeSchema,
  cutAt: IsoDateTimeSchema.nullable(),
  promotedAt: IsoDateTimeSchema.nullable(),
  verifiedAt: IsoDateTimeSchema.nullable(),
  commits: z.array(ReleaseCommitSchema),
  gate: ReleaseGateViewSchema,
  prepHealth: z.array(PrepHealthCheckViewSchema),
  productionWorkflowUrl: z.string(),
  report: z.string(),
});
export type ReleaseView = z.infer<typeof ReleaseViewSchema>;

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
  authorName: z.string().nullable(),
  pullRequestNumber: IssueNumberSchema.nullable(),
  branch: z.string().nullable(),
  state: z.enum(AUDIT_STATES),
  detectedAt: IsoDateTimeSchema,
  changedFiles: z.array(z.string()),
  suggestedType: IssueTypeIdSchema.nullable(),
  releaseId: z.string().nullable(),
  conclusion: AuditConclusionViewSchema.nullable(),
  failureCount: CountSchema,
  lastFailure: z.string().nullable(),
  draft: AuditIssueDraftViewSchema.nullable(),
  publishedIssueNumber: IssueNumberSchema.nullable(),
  resolved: z.boolean(),
  resolutionNote: z.string().nullable(),
});
export type AuditView = z.infer<typeof AuditViewSchema>;

export const MetricSeriesSchema = z.object({
  current: z.number(),
  unit: z.enum(METRIC_UNITS),
  points: z.array(z.number()),
  threshold: z.number().nullable(),
});
export type MetricSeries = z.infer<typeof MetricSeriesSchema>;

export const FeedbackEntrySchema = z.object({
  id: z.string(),
  at: IsoDateTimeSchema,
  rating: z.enum(FEEDBACK_RATINGS),
  comment: z.string(),
});
export type FeedbackEntry = z.infer<typeof FeedbackEntrySchema>;

export const PodViewSchema = z.object({
  name: z.string(),
  status: z.enum(POD_STATUSES),
  restarts: CountSchema,
  startedAt: IsoDateTimeSchema,
  version: z.string(),
});
export type PodView = z.infer<typeof PodViewSchema>;

export const AlertViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.enum(ALERT_SEVERITIES),
  status: z.enum(ALERT_STATES),
  triggeredAt: IsoDateTimeSchema,
  url: z.string(),
});
export type AlertView = z.infer<typeof AlertViewSchema>;

export const HealthEnvironmentSchema = z.object({
  environment: z.enum(ENVIRONMENTS),
  errorRate: MetricSeriesSchema,
  latencyP95: MetricSeriesSchema,
  llmCost: MetricSeriesSchema,
  requests: MetricSeriesSchema,
  feedback: z.object({ positive: CountSchema, negative: CountSchema, recent: z.array(FeedbackEntrySchema) }),
  pods: z.array(PodViewSchema),
  alerts: z.array(AlertViewSchema),
  datadogUrl: z.string(),
  sampledAt: IsoDateTimeSchema,
});
export type HealthEnvironment = z.infer<typeof HealthEnvironmentSchema>;

export const HealthViewSchema = z.object({
  seriesIntervalMinutes: CountSchema,
  environments: z.array(HealthEnvironmentSchema),
});
export type HealthView = z.infer<typeof HealthViewSchema>;

export const DailyCostSchema = z.object({
  date: IsoDateSchema,
  costUsd: AmountSchema,
  inputTokens: CountSchema,
  outputTokens: CountSchema,
  runs: CountSchema,
});
export type DailyCost = z.infer<typeof DailyCostSchema>;

export const CostEntrySchema = z.object({ key: z.string(), costUsd: AmountSchema, tokens: CountSchema, runs: CountSchema });
export type CostEntry = z.infer<typeof CostEntrySchema>;

export const CostCapsSchema = z.object({
  dailyUsd: AmountSchema,
  perRunUsd: AmountSchema,
  pauseAtUtilization: z.number().min(0).max(1),
});
export type CostCaps = z.infer<typeof CostCapsSchema>;

export const CostsViewSchema = z.object({
  monthToDateUsd: AmountSchema,
  daily: z.array(DailyCostSchema),
  byRole: z.array(z.object({ role: z.enum(AGENT_ROLES), costUsd: AmountSchema, tokens: CountSchema, runs: CountSchema })),
  byModel: z.array(CostEntrySchema),
  byIssue: z.array(z.object({ issueNumber: IssueNumberSchema, costUsd: AmountSchema, tokens: CountSchema, runs: CountSchema })),
  subscription: z.array(SubscriptionWindowSchema),
  caps: CostCapsSchema,
});
export type CostsView = z.infer<typeof CostsViewSchema>;

export const ResourceSampleSchema = z.object({
  freeMemoryPercent: PercentSchema,
  pressure: z.enum(MEMORY_PRESSURES),
  thresholdPercent: PercentSchema,
  schedulingPaused: z.boolean(),
  sampledAt: IsoDateTimeSchema,
});
export type ResourceSample = z.infer<typeof ResourceSampleSchema>;

export const KnowledgeViewSchema = z.object({
  refreshedAt: IsoDateTimeSchema,
  productAreas: z.array(
    z.object({ id: z.string(), name: z.string(), description: z.string(), paths: z.array(z.string()), owners: z.array(z.string()) }),
  ),
  screens: z.array(z.object({ id: z.string(), name: z.string(), route: z.string(), area: z.string(), description: z.string() })),
  decisions: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.enum(DECISION_STATUSES),
      date: IsoDateSchema,
      summary: z.string(),
      link: z.string(),
    }),
  ),
  sources: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(SOURCE_KINDS),
      location: z.string(),
      refreshedAt: IsoDateTimeSchema,
    }),
  ),
});
export type KnowledgeView = z.infer<typeof KnowledgeViewSchema>;

export const RoleSettingSchema = z.object({
  role: z.enum(AGENT_ROLES),
  model: z.string().min(1),
  effort: z.enum(EFFORT_LEVELS),
  maxBudgetUsd: AmountSchema,
  maxTurns: CountSchema,
});
export type RoleSetting = z.infer<typeof RoleSettingSchema>;

/** A tool the installation or the project checks: the built-in ones and those the configuration declares. */
export const ConfiguredToolSchema = z.object({ name: z.string().min(1), description: z.string().nullable() });
export type ConfiguredTool = z.infer<typeof ConfiguredToolSchema>;

export const ToolConnectionSchema = z.object({
  tool: z.string().min(1),
  status: z.enum(TOOL_STATUSES),
  version: z.string().nullable(),
  detail: z.string(),
  fixCommand: z.string().nullable(),
  checkedAt: IsoDateTimeSchema,
});
export type ToolConnection = z.infer<typeof ToolConnectionSchema>;

export const SettingsViewSchema = z.object({
  models: z.array(z.string()),
  roles: z.array(RoleSettingSchema),
  concurrency: z.object({ ceiling: CountSchema, maximum: CountSchema, active: CountSchema }),
  resourceGuard: z.object({ freeMemoryThresholdPercent: PercentSchema, pauseAbovePressure: z.enum(MEMORY_PRESSURES) }),
  /** Every tool to check, in the configured order, whether or not it was checked yet. */
  configuredTools: z.array(ConfiguredToolSchema),
  /** The latest check of each tool that was checked at least once. */
  tools: z.array(ToolConnectionSchema),
});
export type SettingsView = z.infer<typeof SettingsViewSchema>;

export const CockpitSnapshotSchema = z.object({
  sequence: CountSchema,
  generatedAt: IsoDateTimeSchema,
  factory: FactoryInfoSchema,
  requests: z.array(RequestViewSchema),
  issues: z.array(IssueViewSchema),
  runs: z.array(RunViewSchema),
  pullRequests: z.array(PullRequestViewSchema),
  workflows: z.array(WorkflowRunSchema),
  environments: z.array(EnvironmentViewSchema),
  releases: z.array(ReleaseViewSchema),
  audits: z.array(AuditViewSchema),
  health: HealthViewSchema,
  costs: CostsViewSchema,
  knowledge: KnowledgeViewSchema,
  settings: SettingsViewSchema,
  resources: ResourceSampleSchema,
});
export type CockpitSnapshot = z.infer<typeof CockpitSnapshotSchema>;
