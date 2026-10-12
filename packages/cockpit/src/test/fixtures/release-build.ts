import { evaluateReleaseGate } from '@agent-factory/domain';
import type {
  AuditView,
  CommitAttribution,
  PullRequestView,
  ReleaseCommit,
  ReleaseHealthCheckView,
  ReleaseSource,
  ReleaseView,
} from '../../contract/index.ts';
import type { ReleaseState } from '@agent-factory/domain';
import { releaseView } from './seeds.ts';

const SHORT_SHA_LENGTH = 7;
const NONE_TEXT = 'none';

export interface ReleaseCommitSeed {
  readonly sha: string;
  readonly message: string;
  readonly author: string | null;
  readonly pullRequestNumber: number | null;
  readonly attribution: CommitAttribution;
  readonly automation: string | null;
}

export interface ReleaseSpec {
  readonly id: string;
  readonly state: ReleaseState;
  readonly source: ReleaseSource;
  readonly ref: string;
  readonly title: string;
  readonly pullRequestNumber: number | null;
  readonly createdAt: string | null;
  readonly detectedAt: string;
  readonly cutAt: string | null;
  readonly promotedAt: string | null;
  readonly verifiedAt: string | null;
  readonly supersededBy: string | null;
  readonly commits: readonly ReleaseCommitSeed[];
  /** When the gate was last evaluated; null for a release that was never evaluated. */
  readonly evaluatedAt: string | null;
  readonly health: readonly ReleaseHealthCheckView[];
  readonly productionWorkflowUrl: string | null;
}

export interface ReleaseContext {
  readonly audits: readonly AuditView[];
  readonly pullRequests: readonly PullRequestView[];
  readonly healthRequired: boolean;
}

function short(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH);
}

function commitOf(seed: ReleaseCommitSeed, context: ReleaseContext): ReleaseCommit {
  const pullRequest = context.pullRequests.find((candidate) => candidate.number === seed.pullRequestNumber);
  const factoryMerge = seed.attribution === 'factory-merge';
  return {
    sha: seed.sha,
    message: seed.message,
    author: seed.author,
    pullRequestNumber: seed.pullRequestNumber,
    issueNumber: factoryMerge ? (pullRequest?.issueNumber ?? null) : null,
    attribution: seed.attribution,
    automation: seed.automation,
    auditId: context.audits.find((audit) => audit.commitSha === seed.sha)?.id ?? null,
    evidenceComplete: factoryMerge ? (pullRequest?.evidenceComplete ?? null) : null,
  };
}

function originOf(commit: ReleaseCommit, audits: readonly AuditView[]): string {
  if (commit.attribution === 'factory-merge') return 'factory';
  if (commit.attribution === 'automation') return `${commit.automation ?? 'automation'}, not audited`;
  return `audited (${audits.find((audit) => audit.id === commit.auditId)?.reason ?? 'direct-push'})`;
}

function reportOf(id: string, commits: readonly ReleaseCommit[], audits: readonly AuditView[], health: readonly ReleaseHealthCheckView[], promotable: boolean, reasons: readonly string[]): string {
  const section = (title: string, lines: readonly string[]): string => [`## ${title}`, ...(lines.length === 0 ? [NONE_TEXT] : lines)].join('\n');
  const changes = commits.map((commit) => {
    const pullRequest = commit.pullRequestNumber === null ? 'no pull request' : `#${commit.pullRequestNumber}`;
    return `- \`${short(commit.sha)}\` ${commit.message} (${pullRequest}, ${originOf(commit, audits)})`;
  });
  const evidence = commits
    .filter((commit) => commit.evidenceComplete !== null)
    .map((commit) => `- #${commit.pullRequestNumber}: evidence ${commit.evidenceComplete === true ? 'complete' : 'incomplete'}`);
  const auditLines = audits
    .filter((audit) => commits.some((commit) => commit.sha === audit.commitSha))
    .map((audit) => `- \`${short(audit.commitSha)}\`: ${audit.state}, ${audit.resolved ? 'resolved' : 'unresolved'}${audit.conclusion === null ? '' : ` - ${audit.conclusion.summary}`}`);
  const healthLines = health.map((check) => `- ${check.environment}, ${check.name}: ${check.passed ? 'pass' : 'fail'} (${check.detail})`);
  return (
    [
      `# Release audit report: ${id}`,
      section('Gate', promotable ? ['Promotable.'] : ['Not promotable.', ...reasons.map((reason) => `- ${reason}`)]),
      section('Changes', changes),
      section('Evidence', evidence),
      section('Audits', auditLines),
      section('Health before production', healthLines),
    ].join('\n\n') + '\n'
  );
}

/** A release whose gate verdict and report are worked out from its commits, their audits and their pull requests. */
export function releaseFrom(spec: ReleaseSpec, context: ReleaseContext): ReleaseView {
  const commits = spec.commits.map((seed) => commitOf(seed, context));
  const base = {
    id: spec.id,
    state: spec.state,
    source: spec.source,
    ref: spec.ref,
    title: spec.title,
    pullRequestNumber: spec.pullRequestNumber,
    createdAt: spec.createdAt,
    detectedAt: spec.detectedAt,
    cutAt: spec.cutAt,
    promotedAt: spec.promotedAt,
    verifiedAt: spec.verifiedAt,
    supersededBy: spec.supersededBy,
    commits,
    health: [...spec.health],
    productionWorkflowUrl: spec.productionWorkflowUrl,
  };
  if (spec.evaluatedAt === null) return releaseView(base);
  const shas = commits.map((commit) => commit.sha);
  const verdict = evaluateReleaseGate({
    commitShas: shas,
    audits: context.audits.filter((audit) => shas.includes(audit.commitSha)).map((audit) => ({ commitSha: audit.commitSha, state: audit.state, resolved: audit.resolved })),
    mergedPullRequests: commits.flatMap((commit) =>
      commit.attribution === 'factory-merge' && commit.pullRequestNumber !== null && commit.evidenceComplete !== null
        ? [{ number: commit.pullRequestNumber, evidenceComplete: commit.evidenceComplete }]
        : [],
    ),
    healthRequired: context.healthRequired,
    healthChecks: spec.health.map((check) => ({ environment: check.environment, name: check.name, passed: check.passed })),
  });
  return releaseView({
    ...base,
    gate: { promotable: verdict.promotable, blockingReasons: [...verdict.blockingReasons], evaluatedAt: spec.evaluatedAt },
    report: reportOf(spec.id, commits, context.audits, spec.health, verdict.promotable, verdict.blockingReasons),
  });
}
