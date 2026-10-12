/** The id of one of the issue types a project declares (see issue-types.ts). */
export type IssueType = string;

export const ISSUE_STATES = [
  'spec-draft',
  'spec-validated',
  'blocked',
  'authoring-checks',
  'checks-frozen',
  'rewriting-check',
  'implementing',
  'gating',
  'reviewing',
  'producing-evidence',
  'pr-open',
  'ci',
  'ready-to-merge',
  'merged',
  'in-dev',
  'in-release',
  'in-prep',
  'in-prod',
  'closed',
  'abandoned',
  'needs-human',
] as const;
export type IssueState = (typeof ISSUE_STATES)[number];

export const AGENT_ROLES = [
  'challenger',
  'acceptance-author',
  'implementer',
  'reviewer',
  'auditor',
  'release-auditor',
  'summarizer',
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export const COMMIT_KINDS = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore'] as const;
export type CommitKind = (typeof COMMIT_KINDS)[number];

export interface IssueSpec {
  readonly number: number;
  readonly title: string;
  readonly type: IssueType;
  readonly need: string;
  readonly acceptanceCriteria: readonly string[];
  readonly outOfScope: readonly string[];
  readonly expectedProof: string;
  readonly dependsOn: readonly number[];
  readonly commitKind: CommitKind | null;
  /** The film scenarios the pull request must show, recorded by the factory once it is open. */
  readonly films: readonly string[];
}

export interface FrozenCheck {
  readonly path: string;
  readonly sha256: string;
}

export const BEFORE_PROOF_KINDS = ['fails-on-base', 'base-score', 'none'] as const;
export type BeforeProofKind = (typeof BEFORE_PROOF_KINDS)[number];

export const REVIEW_SEVERITIES = ['blocking', 'non-blocking'] as const;
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

export const REVIEW_CATEGORIES = [
  'criteria-coverage',
  'scope-creep',
  'check-integrity',
  'correctness',
  'security',
  'repository-rules',
] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export interface ReviewFinding {
  readonly severity: ReviewSeverity;
  readonly category: ReviewCategory;
  readonly file: string | null;
  readonly line: number | null;
  readonly summary: string;
}

export const GATE_STEP_OUTCOMES = ['passed', 'failed', 'skipped'] as const;
export type GateStepOutcome = (typeof GATE_STEP_OUTCOMES)[number];

export interface GateStepResult {
  readonly name: string;
  readonly outcome: GateStepOutcome;
  readonly detail: string;
}

export interface GateResult {
  readonly passed: boolean;
  readonly steps: readonly GateStepResult[];
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}

export const RATE_LIMIT_WINDOWS = ['five_hour', 'seven_day'] as const;
export type RateLimitWindow = (typeof RATE_LIMIT_WINDOWS)[number];

export interface RateLimitSnapshot {
  readonly window: RateLimitWindow;
  readonly utilization: number;
  readonly resetsAt: Date;
}

export const AUDIT_VERDICTS = ['keep', 'challenge', 'rewrite'] as const;
export type AuditVerdict = (typeof AUDIT_VERDICTS)[number];
