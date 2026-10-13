export const CHALLENGE_VERDICTS = ['keep', 'adjust', 'split', 'ask', 'decline'] as const;
export type ChallengeVerdict = (typeof CHALLENGE_VERDICTS)[number];

export const RUN_STATUSES = ['running', 'waiting', 'succeeded', 'failed', 'stopped'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const AGENT_RUN_OUTCOMES = ['success', 'decision-requested', 'max-turns', 'budget-exceeded', 'error', 'timeout', 'aborted'] as const;
export type AgentRunOutcome = (typeof AGENT_RUN_OUTCOMES)[number];

export const RUN_SUBJECT_KINDS = ['issue', 'request', 'audit', 'release'] as const;
export type RunSubjectKind = (typeof RUN_SUBJECT_KINDS)[number];

export const SUBAGENT_STATUSES = ['running', 'done', 'failed'] as const;
export type SubagentStatus = (typeof SUBAGENT_STATUSES)[number];

export const BEFORE_RESULTS = ['failed', 'passed', 'scored', 'not-run'] as const;
export type BeforeResult = (typeof BEFORE_RESULTS)[number];

export const ATTEMPT_KINDS = ['session', 'correction', 'fresh-session'] as const;
export type AttemptKind = (typeof ATTEMPT_KINDS)[number];

export const ATTEMPT_OUTCOMES = ['running', 'passed', 'gate-failed', 'review-failed', 'error'] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

export const PULL_REQUEST_STATES = ['open', 'merged', 'closed'] as const;
export type PullRequestState = (typeof PULL_REQUEST_STATES)[number];

export const CHECK_CONCLUSIONS = ['success', 'failure', 'pending', 'neutral', 'skipped', 'cancelled'] as const;
export type CheckConclusion = (typeof CHECK_CONCLUSIONS)[number];

export const EVIDENCE_KINDS = ['image-compare', 'recording', 'red-green', 'acceptance-tests', 'eval-scores', 'report'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const CHECK_RUN_OUTCOMES = ['passed', 'failed'] as const;
export type CheckRunOutcome = (typeof CHECK_RUN_OUTCOMES)[number];

/** How an environment is doing, from its latest deployment and health probes; unknown when nothing was read. */
export const ENVIRONMENT_STATUSES = ['healthy', 'degraded', 'deploying', 'down', 'unknown'] as const;
export type EnvironmentStatus = (typeof ENVIRONMENT_STATUSES)[number];

export const DEPLOYMENT_OUTCOMES = ['success', 'failure', 'in-progress'] as const;
export type DeploymentOutcome = (typeof DEPLOYMENT_OUTCOMES)[number];

export const WORKFLOW_STATUSES = ['queued', 'in_progress', 'completed'] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

/** Who brought a change to the base branch: the factory, another automation the project names, or someone audited. */
export const COMMIT_ATTRIBUTIONS = ['factory-merge', 'automation', 'audit'] as const;
export type CommitAttribution = (typeof COMMIT_ATTRIBUTIONS)[number];

export const AUDIT_FINDING_LEVELS = ['intent', 'idea', 'method'] as const;
export type AuditFindingLevel = (typeof AUDIT_FINDING_LEVELS)[number];

export const MEMORY_PRESSURES = ['normal', 'warn', 'critical'] as const;
export type MemoryPressure = (typeof MEMORY_PRESSURES)[number];

export { TOOL_FAILURE_STATUSES, TOOL_STATUSES } from '@agent-factory/domain';
export type { ToolFailureStatus, ToolName, ToolStatus } from '@agent-factory/domain';

export { REFERENCE_SNAPSHOT_STATUSES } from '@agent-factory/domain';
export type { ReferenceSnapshotStatus } from '@agent-factory/domain';

/** Live drives real repositories; demo plays fictional projects with the fake CLI; rehearsal uses local forges only. */
export const INSTALLATION_MODES = ['live', 'demo', 'rehearsal'] as const;
export type InstallationMode = (typeof INSTALLATION_MODES)[number];

export const FORGE_KINDS = ['github', 'local'] as const;
export type ForgeKind = (typeof FORGE_KINDS)[number];

export const PAUSE_SCOPES = ['installation', 'project'] as const;
export type PauseScope = (typeof PAUSE_SCOPES)[number];

/** What the cost figures mean: the API price of subscription usage, the metered price, or both mixed. */
export const COST_BASIS_VIEWS = ['subscription-equivalent', 'metered', 'mixed'] as const;
export type CostBasisView = (typeof COST_BASIS_VIEWS)[number];

export const KNOWLEDGE_SOURCE_KINDS = ['path', 'repository'] as const;
export type KnowledgeSourceKind = (typeof KNOWLEDGE_SOURCE_KINDS)[number];

export const RELEASE_SOURCES = ['pull-request', 'tag'] as const;
export type ReleaseSource = (typeof RELEASE_SOURCES)[number];

export const NOTIFICATION_CHANNEL_KINDS = ['system', 'google-chat', 'slack', 'webhook'] as const;
export type NotificationChannelKind = (typeof NOTIFICATION_CHANNEL_KINDS)[number];

export const TOOL_SCOPES = ['installation', 'project'] as const;
export type ToolScope = (typeof TOOL_SCOPES)[number];

export { DELEGABLE_GESTURES, MERGE_CONDITIONS } from '@agent-factory/domain';
export type { DelegableGesture, MergeCondition } from '@agent-factory/domain';

/** What a gesture of the delegate acted on. */
export const DELEGATED_TARGET_KINDS = ['issue', 'pull-request'] as const;
export type DelegatedTargetKind = (typeof DELEGATED_TARGET_KINDS)[number];

/** What the ready notice of a pull request is: sent for its head, held by something, due at the next tick, or not applicable. */
export const READY_NOTICE_STATUSES = ['sent', 'held', 'due', 'none'] as const;
export type ReadyNoticeStatus = (typeof READY_NOTICE_STATUSES)[number];
