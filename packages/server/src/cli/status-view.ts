import type { IssueStatus } from '@agent-factory/application';
import type { CostsView } from '@agent-factory/cockpit';

const NONE = 'none';
const COST_DECIMALS = 2;
const COST_BASIS_NOTES: Readonly<Record<CostsView['basis'], string>> = {
  'subscription-equivalent': 'what the same usage would cost on the API; the subscription pays for it',
  metered: 'charged to the API key',
  mixed: 'API prices; part of the usage is paid by a subscription',
};

function gateLine(status: IssueStatus): string {
  const gate = status.lastGate;
  if (gate === null) return NONE;
  const failed = gate.result.steps.filter((step) => step.outcome === 'failed').map((step) => step.name);
  return `attempt ${gate.attempt + 1} ${gate.result.passed ? 'passed' : `failed (${failed.join(', ')})`}`;
}

function reviewLine(status: IssueStatus): string {
  const review = status.lastReview;
  if (review === null) return NONE;
  const blocking = review.findings.filter((finding) => finding.severity === 'blocking').length;
  return `attempt ${review.attempt + 1}: ${review.findings.length} finding(s), ${blocking} blocking`;
}

export function renderIssueStatus(project: string, status: IssueStatus, costBasis: CostsView['basis']): readonly string[] {
  const { attempts } = status;
  return [
    `${project}#${status.issueNumber}${status.title === null ? '' : `: ${status.title}`}`,
    `State: ${status.state ?? 'unknown'}`,
    ...(status.escalationReason === null ? [] : [`Needs human: ${status.escalationReason}`]),
    `Branch: ${status.branch ?? NONE}`,
    `Worktree: ${status.worktreePath ?? NONE}`,
    `Before proof: ${status.beforeProof ?? NONE}`,
    `Frozen checks: ${status.frozenChecks.length === 0 ? NONE : status.frozenChecks.join(', ')}`,
    `Implementer attempts: ${attempts.total} (${attempts.resumed} resumed, ${attempts.escalated} escalated)`,
    `Last gate: ${gateLine(status)}`,
    `Last review: ${reviewLine(status)}`,
    `Pull request: ${status.pullRequest === null ? NONE : `#${status.pullRequest.number} ${status.pullRequest.url}`}`,
    ...(status.mergeSha === null ? [] : [`Merged as: ${status.mergeSha}`]),
    `Agent cost: $${status.costUsd.toFixed(COST_DECIMALS)} (${COST_BASIS_NOTES[costBasis]})`,
  ];
}
