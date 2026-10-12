import type { AuditState, BaseTestResult, BranchTestResult, IssueState, ReferenceSnapshotStatus, ReleaseState, RequestState, UsageFreshness } from '@agent-factory/domain';
import { ACTIVE_PIPELINE_STATES, ISSUE_ABANDONED_STATE, MERGED_OR_BEYOND_STATES } from '@agent-factory/domain';
import type {
  AuditView,
  CheckConclusion,
  DeploymentOutcome,
  EnvironmentStatus,
  PullRequestState,
  RunStatus,
  ToolStatus,
  WorkflowRun,
} from '../contract/index.ts';

export const STATUS_MARKS = ['running', 'waiting', 'success', 'failed', 'blocked', 'idle'] as const;
export type StatusMark = (typeof STATUS_MARKS)[number];

export function issueMark(state: IssueState): StatusMark {
  if (state === 'needs-human') return 'failed';
  if (state === 'spec-draft' || state === 'ready-to-merge') return 'waiting';
  if (state === 'blocked') return 'blocked';
  if (state === ISSUE_ABANDONED_STATE) return 'blocked';
  if (ACTIVE_PIPELINE_STATES.includes(state)) return 'running';
  if (MERGED_OR_BEYOND_STATES.includes(state)) return 'success';
  return 'idle';
}

const REQUEST_MARKS: Readonly<Record<RequestState, StatusMark>> = {
  received: 'waiting',
  challenging: 'running',
  challenged: 'waiting',
  'waiting-requester': 'idle',
  accepted: 'success',
  declined: 'blocked',
};

export function requestMark(state: RequestState): StatusMark {
  return REQUEST_MARKS[state];
}

const RUN_MARKS: Readonly<Record<RunStatus, StatusMark>> = {
  running: 'running',
  waiting: 'waiting',
  succeeded: 'success',
  failed: 'failed',
  stopped: 'blocked',
};

export function runMark(status: RunStatus): StatusMark {
  return RUN_MARKS[status];
}

export function auditMark(audit: Pick<AuditView, 'state' | 'resolved'>): StatusMark {
  const marks: Readonly<Record<AuditState, StatusMark>> = {
    detected: 'idle',
    auditing: 'running',
    keep: 'success',
    challenge: audit.resolved ? 'success' : 'waiting',
    rewrite: audit.resolved ? 'success' : 'failed',
  };
  return marks[audit.state];
}

const RELEASE_MARKS: Readonly<Record<ReleaseState, StatusMark>> = {
  open: 'idle',
  cut: 'running',
  auditing: 'running',
  blocked: 'blocked',
  promotable: 'waiting',
  promoted: 'running',
  verified: 'success',
};

/** A release another version has overtaken is settled history, whatever state it was left in. */
export function releaseMark(state: ReleaseState, supersededBy: string | null = null): StatusMark {
  return supersededBy === null ? RELEASE_MARKS[state] : 'idle';
}

const PULL_REQUEST_MARKS: Readonly<Record<PullRequestState, StatusMark>> = { open: 'running', merged: 'success', closed: 'blocked' };

export function pullRequestMark(state: PullRequestState): StatusMark {
  return PULL_REQUEST_MARKS[state];
}

const CONCLUSION_MARKS: Readonly<Record<CheckConclusion, StatusMark>> = {
  success: 'success',
  failure: 'failed',
  pending: 'running',
  neutral: 'idle',
  skipped: 'idle',
  cancelled: 'blocked',
};

export function conclusionMark(conclusion: CheckConclusion): StatusMark {
  return CONCLUSION_MARKS[conclusion];
}

export function workflowMark(run: Pick<WorkflowRun, 'status' | 'conclusion'>): StatusMark {
  if (run.status !== 'completed') return 'running';
  return run.conclusion === null ? 'idle' : conclusionMark(run.conclusion);
}

const DEPLOYMENT_MARKS: Readonly<Record<DeploymentOutcome, StatusMark>> = {
  success: 'success',
  failure: 'failed',
  'in-progress': 'running',
};

export function deploymentMark(outcome: DeploymentOutcome): StatusMark {
  return DEPLOYMENT_MARKS[outcome];
}

const ENVIRONMENT_MARKS: Readonly<Record<EnvironmentStatus, StatusMark>> = {
  healthy: 'success',
  degraded: 'waiting',
  deploying: 'running',
  down: 'failed',
  unknown: 'idle',
};

export function environmentMark(status: EnvironmentStatus): StatusMark {
  return ENVIRONMENT_MARKS[status];
}

const TOOL_MARKS: Readonly<Record<ToolStatus, StatusMark>> = {
  connected: 'success',
  unauthenticated: 'waiting',
  missing: 'blocked',
  error: 'failed',
};

/** A tool never checked has no status to show: it is idle, not broken. */
export function toolMark(status: ToolStatus | null): StatusMark {
  return status === null ? 'idle' : TOOL_MARKS[status];
}

const REFERENCE_MARKS: Readonly<Record<ReferenceSnapshotStatus, StatusMark>> = { ready: 'success', 'missing-ref': 'blocked', 'not-built': 'waiting' };

/** A snapshot never read has no state to show: it is idle, not broken. */
export function referenceMark(status: ReferenceSnapshotStatus | null): StatusMark {
  return status === null ? 'idle' : REFERENCE_MARKS[status];
}

const FRESHNESS_MARKS: Readonly<Record<UsageFreshness, StatusMark>> = { fresh: 'success', stale: 'waiting', 'window-reset': 'idle' };

export function freshnessMark(freshness: UsageFreshness): StatusMark {
  return FRESHNESS_MARKS[freshness];
}

export function checksSummaryMark(conclusions: readonly CheckConclusion[]): StatusMark {
  if (conclusions.includes('failure')) return 'failed';
  if (conclusions.includes('pending')) return 'running';
  if (conclusions.length === 0) return 'idle';
  return 'success';
}

const BASE_TEST_MARKS: Readonly<Record<BaseTestResult, StatusMark>> = {
  'red-assertion': 'failed',
  'red-error': 'blocked',
  green: 'success',
  skipped: 'idle',
};

const BRANCH_TEST_MARKS: Readonly<Record<BranchTestResult, StatusMark>> = {
  green: 'success',
  red: 'failed',
  skipped: 'blocked',
  missing: 'blocked',
  'not-run': 'idle',
};

export function baseTestMark(result: BaseTestResult): StatusMark {
  return BASE_TEST_MARKS[result];
}

export function branchTestMark(result: BranchTestResult): StatusMark {
  return BRANCH_TEST_MARKS[result];
}
