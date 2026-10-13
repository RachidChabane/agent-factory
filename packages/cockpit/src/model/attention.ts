import { ISSUE_ESCALATION_STATE } from '@agent-factory/domain';
import type { AuditView, CockpitSnapshot, IssueView, ProjectView, PullRequestView, ReleaseView, RequestView, RunView } from '../contract/index.ts';
import { toEpoch } from '../i18n/formatters.ts';
import { shortSha } from './identifiers.ts';
import { isLiveRun } from './projects.ts';
import { paths } from './routes.ts';
import { describeRunSubject } from './subjects.ts';

export const ATTENTION_PRIORITIES = [
  'needs-human',
  'question',
  'merge',
  'release',
  'audit',
  'challenge-review',
  'spec',
  'new-request',
] as const;
export type AttentionKind = (typeof ATTENTION_PRIORITIES)[number];

export interface AttentionItem {
  readonly key: string;
  readonly kind: AttentionKind;
  /** The project the item belongs to; null for work of the installation itself. */
  readonly project: string | null;
  readonly reference: string;
  readonly title: string;
  readonly detail: string | null;
  readonly href: string;
  readonly at: string;
}

const MERGE_ORDER_STATES: readonly IssueView['state'][] = ['pr-open', 'ci'];
const RELEASE_STATES_FOR_OPERATOR: readonly ReleaseView['state'][] = ['blocked', 'promotable'];

export function awaitsMergeOrder(issue: IssueView, pullRequest: PullRequestView | undefined, hasLiveRun: boolean): boolean {
  if (issue.state === 'ready-to-merge') return pullRequest === undefined || pullRequest.state === 'open';
  if (!MERGE_ORDER_STATES.includes(issue.state) || hasLiveRun || pullRequest === undefined) return false;
  return pullRequest.state === 'open' && pullRequest.mergeable;
}

export function auditNeedsOperator(audit: Pick<AuditView, 'state' | 'resolved'>): boolean {
  return (audit.state === 'challenge' || audit.state === 'rewrite') && !audit.resolved;
}

export function releaseNeedsOperator(release: Pick<ReleaseView, 'state' | 'supersededBy'>): boolean {
  return release.supersededBy === null && RELEASE_STATES_FOR_OPERATOR.includes(release.state);
}

function issueItems(project: ProjectView, liveIssueNumbers: ReadonlySet<number>): AttentionItem[] {
  const pullRequests = new Map(project.pullRequests.map((pullRequest) => [pullRequest.issueNumber, pullRequest]));
  const items: AttentionItem[] = [];
  for (const issue of project.issues) {
    const base = { project: project.id, reference: `#${issue.number}`, title: issue.title, at: issue.updatedAt, detail: null };
    const pullRequest = pullRequests.get(issue.number);
    if (issue.state === ISSUE_ESCALATION_STATE) {
      items.push({ ...base, key: `${project.id}:issue:${issue.number}`, kind: 'needs-human', href: paths.issue(project.id, issue.number), detail: issue.escalation?.reason ?? null });
    } else if (awaitsMergeOrder(issue, pullRequest, liveIssueNumbers.has(issue.number)) && pullRequest !== undefined) {
      items.push({ ...base, key: `${project.id}:issue:${issue.number}`, kind: 'merge', reference: `PR #${pullRequest.number}`, title: pullRequest.title, href: paths.mergePullRequest(project.id, pullRequest.number) });
    } else if (issue.state === 'spec-draft') {
      items.push({ ...base, key: `${project.id}:issue:${issue.number}`, kind: 'spec', href: paths.issue(project.id, issue.number) });
    }
  }
  return items;
}

function requestItems(project: ProjectView): AttentionItem[] {
  return project.requests.flatMap((request: RequestView): AttentionItem[] => {
    const base = {
      key: `${project.id}:request:${request.id}`,
      project: project.id,
      reference: request.id,
      title: request.title,
      detail: request.challenge?.summary ?? null,
      href: paths.request(project.id, request.id),
      at: request.updatedAt,
    };
    if (request.state === 'received') return [{ ...base, kind: 'new-request' }];
    if (request.state === 'challenged') return [{ ...base, kind: 'challenge-review' }];
    return [];
  });
}

function releaseItems(project: ProjectView): AttentionItem[] {
  return project.releases
    .filter(releaseNeedsOperator)
    .map((release) => ({
      key: `${project.id}:release:${release.id}`,
      kind: 'release' as const,
      project: project.id,
      reference: release.id,
      title: release.title,
      detail: release.gate.blockingReasons[0] ?? null,
      href: paths.release(project.id, release.id),
      at: release.verifiedAt ?? release.promotedAt ?? release.gate.evaluatedAt ?? release.cutAt ?? release.detectedAt,
    }));
}

function auditItems(project: ProjectView): AttentionItem[] {
  return project.audits.filter(auditNeedsOperator).map((audit) => ({
    key: `${project.id}:audit:${audit.id}`,
    kind: 'audit' as const,
    project: project.id,
    reference: shortSha(audit.commitSha),
    title: audit.commitMessage,
    detail: audit.conclusion?.summary ?? null,
    href: paths.audit(project.id, audit.id),
    at: audit.detectedAt,
  }));
}

function questionItems(snapshot: Pick<CockpitSnapshot, 'runs' | 'projects'>): AttentionItem[] {
  return snapshot.runs.flatMap((run: RunView): AttentionItem[] => {
    if (run.pendingQuestion === null || !isLiveRun(run)) return [];
    return [
      {
        key: `run:${run.id}`,
        kind: 'question',
        project: run.project,
        reference: describeRunSubject(snapshot, run).reference,
        title: run.pendingQuestion.text,
        detail: null,
        href: paths.run(run.id),
        at: run.pendingQuestion.askedAt,
      },
    ];
  });
}

function priority(kind: AttentionKind): number {
  return ATTENTION_PRIORITIES.indexOf(kind);
}

function liveIssueNumbers(snapshot: Pick<CockpitSnapshot, 'runs'>, project: string): ReadonlySet<number> {
  return new Set(
    snapshot.runs.filter((run) => run.project === project && run.subject.kind === 'issue' && isLiveRun(run)).map((run) => Number(run.subject.id)),
  );
}

/** What waits for the operator, most urgent first, across one project or the whole installation. */
export function deriveAttention(snapshot: Pick<CockpitSnapshot, 'projects' | 'runs'>, project: string | null = null): readonly AttentionItem[] {
  const projects = project === null ? snapshot.projects : snapshot.projects.filter((candidate) => candidate.id === project);
  const items = [
    ...projects.flatMap((candidate) => [
      ...issueItems(candidate, liveIssueNumbers(snapshot, candidate.id)),
      ...requestItems(candidate),
      ...releaseItems(candidate),
      ...auditItems(candidate),
    ]),
    ...questionItems(snapshot).filter((item) => project === null || item.project === project),
  ];
  return items.toSorted((left, right) => priority(left.kind) - priority(right.kind) || toEpoch(right.at) - toEpoch(left.at));
}
