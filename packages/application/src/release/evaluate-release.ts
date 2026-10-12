import {
  attributeCommit,
  type AttributionRules,
  evaluateReleaseGate,
  UNRESOLVED_VERDICT_STATES,
  type MergedPullRequestEvidence,
  type ReleaseAudit,
} from '@agent-factory/domain';
import { loadAudits, type AuditRecord } from '../audit/audit-projection.ts';
import type { CommitSummary, EventStore, GitHubGateway } from '../ports.ts';
import {
  PULL_REQUEST_OPENED_EVENT,
  PULL_REQUEST_SUBJECT_PREFIX,
  PullRequestOpenedPayloadSchema,
  RELEASE_EVALUATED_EVENT,
  releaseSubject,
  type ReleaseEvaluatedPayload,
} from './events.ts';
import type { HealthProbe } from './health-probe.ts';
import {
  renderReleaseAuditReport,
  type ReleaseAuditEntry,
  type ReleaseChange,
  type ReleaseEvidenceEntry,
} from './release-report.ts';

export interface ReleaseDescriptor {
  readonly releaseId: string;
  readonly branch: string;
  readonly baseSha: string | null;
}

export interface EvaluateReleaseDependencies {
  readonly events: EventStore;
  readonly github: GitHubGateway;
  readonly health: HealthProbe;
  readonly rules: AttributionRules;
}

export interface ReleaseEvaluation {
  readonly promotable: boolean;
  readonly blockingReasons: readonly string[];
  readonly report: string;
}

const FIRST_SEQUENCE = 0;
const ISSUE_CLOSED = 'closed';
const AUDITED_ATTRIBUTION = 'audit';

async function recordedEvidence(events: EventStore): Promise<ReadonlyMap<number, boolean>> {
  const records = await events.read(PULL_REQUEST_SUBJECT_PREFIX, FIRST_SEQUENCE);
  const byNumber = new Map<number, boolean>();
  for (const record of records) {
    if (record.type !== PULL_REQUEST_OPENED_EVENT) continue;
    const payload = PullRequestOpenedPayloadSchema.parse(record.payload);
    byNumber.set(payload.number, payload.evidenceComplete);
  }
  return byNumber;
}

function toChange(commit: CommitSummary, rules: AttributionRules): ReleaseChange {
  return {
    sha: commit.sha,
    message: commit.message,
    pullRequestNumber: commit.pullRequestNumber,
    attribution: attributeCommit(commit, rules),
  };
}

async function isResolved(github: GitHubGateway, audit: AuditRecord): Promise<boolean> {
  if (audit.resolved) return true;
  if (!UNRESOLVED_VERDICT_STATES.includes(audit.state)) return false;
  if (audit.publishedIssueNumber === null) return false;
  return (await github.getIssue(audit.publishedIssueNumber)).state === ISSUE_CLOSED;
}

function factoryPullRequestNumbers(changes: readonly ReleaseChange[]): readonly number[] {
  const numbers = changes
    .filter((change) => change.attribution.kind === 'factory-merge')
    .flatMap((change) => (change.pullRequestNumber === null ? [] : [change.pullRequestNumber]));
  return [...new Set(numbers)];
}

export async function evaluateRelease(
  dependencies: EvaluateReleaseDependencies,
  release: ReleaseDescriptor,
): Promise<ReleaseEvaluation> {
  const { events, github, health } = dependencies;
  const commits = await github.commitsSince(release.branch, release.baseSha);
  const changes = commits.map((commit) => toChange(commit, dependencies.rules));
  const commitShas = commits.map((commit) => commit.sha);
  const inRelease = new Set(commitShas);

  const evidenceByNumber = await recordedEvidence(events);
  const evidence: ReleaseEvidenceEntry[] = factoryPullRequestNumbers(changes).map((number) => ({
    number,
    evidenceComplete: evidenceByNumber.get(number) ?? false,
    recorded: evidenceByNumber.has(number),
  }));
  const mergedPullRequests: MergedPullRequestEvidence[] = evidence.map(({ number, evidenceComplete }) => ({ number, evidenceComplete }));

  const audits = (await loadAudits(events)).filter((audit) => inRelease.has(audit.commitSha));
  const resolutions = await Promise.all(audits.map((audit) => isResolved(github, audit)));
  const releaseAudits: ReleaseAudit[] = audits.map((audit, index) => ({
    commitSha: audit.commitSha,
    state: audit.state,
    resolved: resolutions[index] ?? false,
  }));
  const auditEntries: ReleaseAuditEntry[] = audits.map((audit, index) => ({
    commitSha: audit.commitSha,
    state: audit.state,
    summary: audit.conclusion?.summary ?? null,
    resolved: resolutions[index] ?? false,
    issueNumber: audit.publishedIssueNumber,
  }));

  const healthChecks = await health.check();
  const gate = evaluateReleaseGate({ commitShas, audits: releaseAudits, mergedPullRequests, prepHealthChecks: healthChecks });
  const report = renderReleaseAuditReport({
    releaseId: release.releaseId,
    changes,
    evidence,
    audits: auditEntries,
    health: healthChecks,
    gate,
  });

  const payload: ReleaseEvaluatedPayload = {
    releaseId: release.releaseId,
    promotable: gate.promotable,
    blockingReasons: [...gate.blockingReasons],
    commitShas,
    report,
    commits: commits.map((commit, index) => ({
      sha: commit.sha,
      message: commit.message,
      author: commit.authorLogin,
      pullRequestNumber: commit.pullRequestNumber,
      attribution: changes[index]?.attribution.kind ?? AUDITED_ATTRIBUTION,
    })),
    health: healthChecks.map((check) => ({ name: check.name, passed: check.passed, detail: check.detail })),
  };
  await events.append(RELEASE_EVALUATED_EVENT, releaseSubject(release.releaseId), payload);
  return { promotable: gate.promotable, blockingReasons: gate.blockingReasons, report };
}
