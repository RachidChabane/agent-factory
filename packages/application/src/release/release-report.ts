import type { AuditState, MergeAttribution, ReleaseGateResult } from '@agent-factory/domain';
import { SHORT_SHA_LENGTH } from '../audit/audit-issue-renderer.ts';
import type { HealthCheckResult } from './health-probe.ts';

export const NONE_TEXT = 'none';

export interface ReleaseChange {
  readonly sha: string;
  readonly message: string;
  readonly pullRequestNumber: number | null;
  readonly attribution: MergeAttribution;
}

export interface ReleaseEvidenceEntry {
  readonly number: number;
  readonly evidenceComplete: boolean;
  readonly recorded: boolean;
}

export interface ReleaseAuditEntry {
  readonly commitSha: string;
  readonly state: AuditState;
  readonly summary: string | null;
  readonly resolved: boolean;
  readonly issueNumber: number | null;
}

export interface ReleaseAuditReportInput {
  readonly releaseId: string;
  readonly changes: readonly ReleaseChange[];
  readonly evidence: readonly ReleaseEvidenceEntry[];
  readonly audits: readonly ReleaseAuditEntry[];
  readonly health: readonly HealthCheckResult[];
  readonly gate: ReleaseGateResult;
}

const short = (sha: string): string => sha.slice(0, SHORT_SHA_LENGTH);
const firstLine = (text: string): string => text.trim().split('\n')[0] ?? '';

function origin(change: ReleaseChange): string {
  switch (change.attribution.kind) {
    case 'factory-merge':
      return 'factory';
    case 'automation':
      return `${change.attribution.automation}, not audited`;
    case 'audit':
      return `audited (${change.attribution.reason})`;
  }
}

function section(title: string, lines: readonly string[]): string {
  return [`## ${title}`, ...(lines.length === 0 ? [NONE_TEXT] : lines)].join('\n');
}

function changeLines(changes: readonly ReleaseChange[]): string[] {
  return changes.map((change) => {
    const pullRequest = change.pullRequestNumber === null ? 'no pull request' : `#${change.pullRequestNumber}`;
    return `- \`${short(change.sha)}\` ${firstLine(change.message)} (${pullRequest}, ${origin(change)})`;
  });
}

function evidenceLines(evidence: readonly ReleaseEvidenceEntry[]): string[] {
  return evidence.map((entry) => {
    if (!entry.recorded) return `- #${entry.number}: no evidence recorded`;
    return `- #${entry.number}: evidence ${entry.evidenceComplete ? 'complete' : 'incomplete'}`;
  });
}

function auditLines(audits: readonly ReleaseAuditEntry[]): string[] {
  return audits.map((audit) => {
    const issue = audit.issueNumber === null ? '' : `, issue #${audit.issueNumber}`;
    const resolution = audit.resolved ? 'resolved' : 'unresolved';
    const summary = audit.summary === null ? '' : ` - ${audit.summary}`;
    return `- \`${short(audit.commitSha)}\`: ${audit.state}, ${resolution}${issue}${summary}`;
  });
}

function healthLines(health: readonly HealthCheckResult[]): string[] {
  return health.map((check) => `- ${check.name}: ${check.passed ? 'pass' : 'fail'} (${check.detail})`);
}

function gateLines(gate: ReleaseGateResult): string[] {
  if (gate.promotable) return ['Promotable.'];
  return ['Not promotable.', ...gate.blockingReasons.map((reason) => `- ${reason}`)];
}

export function renderReleaseAuditReport(input: ReleaseAuditReportInput): string {
  return [
    `# Release audit report: ${input.releaseId}`,
    section('Gate', gateLines(input.gate)),
    section('Changes', changeLines(input.changes)),
    section('Evidence', evidenceLines(input.evidence)),
    section('Audits', auditLines(input.audits)),
    section('PREP health', healthLines(input.health)),
  ].join('\n\n') + '\n';
}
