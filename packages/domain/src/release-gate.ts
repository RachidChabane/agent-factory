import type { AuditState } from './audit-lifecycle.ts';

export const OPEN_AUDIT_STATES: readonly AuditState[] = ['detected', 'auditing'];
export const UNRESOLVED_VERDICT_STATES: readonly AuditState[] = ['challenge', 'rewrite'];

export interface ReleaseAudit {
  readonly commitSha: string;
  readonly state: AuditState;
  readonly resolved: boolean;
}

export interface MergedPullRequestEvidence {
  readonly number: number;
  readonly evidenceComplete: boolean;
}

export interface PrepHealthCheck {
  readonly name: string;
  readonly passed: boolean;
}

export interface ReleaseGateInput {
  readonly commitShas: readonly string[];
  readonly audits: readonly ReleaseAudit[];
  readonly mergedPullRequests: readonly MergedPullRequestEvidence[];
  readonly prepHealthChecks: readonly PrepHealthCheck[];
}

export interface ReleaseGateResult {
  readonly promotable: boolean;
  readonly blockingReasons: readonly string[];
}

export const REASON_NO_PREP_CHECKS = 'no PREP health check has been recorded';

function isOpenAudit(audit: ReleaseAudit): boolean {
  if (OPEN_AUDIT_STATES.includes(audit.state)) return true;
  return UNRESOLVED_VERDICT_STATES.includes(audit.state) && !audit.resolved;
}

export function evaluateReleaseGate(input: ReleaseGateInput): ReleaseGateResult {
  const commits = new Set(input.commitShas);
  const blockingReasons: string[] = [];

  for (const audit of input.audits) {
    if (commits.has(audit.commitSha) && isOpenAudit(audit)) {
      blockingReasons.push(`audit ${audit.state} is open on commit ${audit.commitSha}`);
    }
  }
  for (const pullRequest of input.mergedPullRequests) {
    if (!pullRequest.evidenceComplete) {
      blockingReasons.push(`pull request #${pullRequest.number} has incomplete evidence`);
    }
  }
  if (input.prepHealthChecks.length === 0) {
    blockingReasons.push(REASON_NO_PREP_CHECKS);
  }
  for (const check of input.prepHealthChecks) {
    if (!check.passed) blockingReasons.push(`PREP health check ${check.name} failed`);
  }
  return { promotable: blockingReasons.length === 0, blockingReasons };
}
