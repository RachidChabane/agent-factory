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

export const CHECK_KINDS = ['playwright', 'unit', 'integration', 'evaluation', 'policy', 'migration'] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

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

export const EVIDENCE_KINDS = ['image-compare', 'recording', 'red-green', 'eval-scores', 'report'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const CHECK_RUN_OUTCOMES = ['passed', 'failed'] as const;
export type CheckRunOutcome = (typeof CHECK_RUN_OUTCOMES)[number];

export const ENVIRONMENTS = ['dev', 'prep', 'prod'] as const;
export type EnvironmentName = (typeof ENVIRONMENTS)[number];

export const REDEPLOYABLE_ENVIRONMENTS: readonly EnvironmentName[] = ['dev', 'prep'];

export const ENVIRONMENT_STATUSES = ['healthy', 'degraded', 'deploying', 'down'] as const;
export type EnvironmentStatus = (typeof ENVIRONMENT_STATUSES)[number];

export const DEPLOYMENT_OUTCOMES = ['success', 'failure', 'in-progress'] as const;
export type DeploymentOutcome = (typeof DEPLOYMENT_OUTCOMES)[number];

export const WORKFLOW_TRIGGERS = ['push', 'pull_request', 'workflow_dispatch', 'schedule', 'release'] as const;
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];

export const WORKFLOW_STATUSES = ['queued', 'in_progress', 'completed'] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const COMMIT_ATTRIBUTIONS = ['factory-merge', 'automation', 'audit'] as const;
export type CommitAttribution = (typeof COMMIT_ATTRIBUTIONS)[number];

export const AUDIT_FINDING_LEVELS = ['intent', 'idea', 'method'] as const;
export type AuditFindingLevel = (typeof AUDIT_FINDING_LEVELS)[number];

export const METRIC_UNITS = ['percent', 'milliseconds', 'usd', 'count'] as const;
export type MetricUnit = (typeof METRIC_UNITS)[number];

export const FEEDBACK_RATINGS = ['up', 'down'] as const;
export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];

export const POD_STATUSES = ['running', 'pending', 'crash-loop', 'terminated'] as const;
export type PodStatus = (typeof POD_STATUSES)[number];

export const ALERT_SEVERITIES = ['critical', 'warning', 'info'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATES = ['triggered', 'resolved'] as const;
export type AlertState = (typeof ALERT_STATES)[number];

export const MEMORY_PRESSURES = ['normal', 'warn', 'critical'] as const;
export type MemoryPressure = (typeof MEMORY_PRESSURES)[number];

export { TOOL_NAMES, TOOL_STATUSES } from '@agent-factory/domain';
export type { ToolName, ToolStatus } from '@agent-factory/domain';

export const DECISION_STATUSES = ['accepted', 'proposed', 'superseded'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const SOURCE_KINDS = ['repository', 'documentation', 'design', 'dashboard', 'channel'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
