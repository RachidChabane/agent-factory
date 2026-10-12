import type { AgentRole, IssueType } from '@agent-factory/domain';
import { ISSUE_ABANDONED_STATE, MERGED_OR_BEYOND_STATES } from '@agent-factory/domain';
import type {
  AuditView,
  CockpitSnapshot,
  IssueView,
  PullRequestView,
  ReleaseView,
  RequestView,
  RunView,
} from '../contract/index.ts';
import { plural, shortSha, toEpoch, WEEK_MS } from '../format/format.ts';
import {
  AUDIT_REASON_LABELS,
  AUDIT_STATE_LABELS,
  ISSUE_STATE_LABELS,
  RELEASE_STATE_LABELS,
  REQUEST_STATE_LABELS,
  ROLE_LABELS,
  RUN_STATUS_LABELS,
} from '../i18n/labels.ts';
import { translateGateReason } from '../i18n/reasons.ts';
import { paths } from './routes.ts';
import type { StatusMark } from './status.ts';
import { auditMark, issueMark, releaseMark, requestMark, runMark } from './status.ts';

export const BOARD_COLUMNS = ['needs-you', 'in-progress', 'done'] as const;
export type BoardColumnId = (typeof BOARD_COLUMNS)[number];

export const BOARD_COLUMN_TITLES: Readonly<Record<BoardColumnId, string>> = {
  'needs-you': 'Vous concerne',
  'in-progress': 'En activité',
  done: 'Terminé',
};

export const BOARD_ITEM_KINDS = ['request', 'issue', 'run', 'audit', 'release'] as const;
export type BoardItemKind = (typeof BOARD_ITEM_KINDS)[number];

export const BOARD_ITEM_KIND_LABELS: Readonly<Record<BoardItemKind, string>> = {
  request: 'Demandes',
  issue: 'Issues',
  run: 'Runs',
  audit: 'Audits',
  release: 'Releases',
};

export const DONE_WINDOW_MS = WEEK_MS;

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

export const ATTENTION_LABELS: Readonly<Record<AttentionKind, string>> = {
  'needs-human': 'Intervention requise',
  question: 'Question de l’agent',
  merge: 'Merge à ordonner',
  release: 'Release à traiter',
  audit: 'Audit à traiter',
  'challenge-review': 'Challenge à relire',
  spec: 'Spec à valider',
  'new-request': 'Challenge à lancer',
};

export interface BoardCard {
  readonly key: string;
  readonly kind: BoardItemKind;
  readonly column: BoardColumnId;
  readonly mark: StatusMark;
  readonly reference: string;
  readonly title: string;
  readonly step: string;
  readonly detail: string | null;
  readonly detailFromAgent: boolean;
  readonly owner: string | null;
  readonly role: AgentRole | null;
  readonly live: boolean;
  readonly branch: string | null;
  readonly updatedAt: string;
  readonly subagentCount: number;
  readonly href: string;
  readonly attention: AttentionKind | null;
  readonly issueType: IssueType | null;
  readonly searchText: string;
}

export interface Board {
  readonly columns: Readonly<Record<BoardColumnId, readonly BoardCard[]>>;
  readonly total: number;
}

const LIVE_RUN_STATUSES: readonly RunView['status'][] = ['running', 'waiting'];

function isLive(run: RunView): boolean {
  return LIVE_RUN_STATUSES.includes(run.status);
}

function latestRun(runs: readonly RunView[]): RunView | null {
  return runs.reduce<RunView | null>(
    (latest, run) => (latest === null || toEpoch(run.startedAt) > toEpoch(latest.startedAt) ? run : latest),
    null,
  );
}

function runsBySubject(runs: readonly RunView[]): ReadonlyMap<string, readonly RunView[]> {
  const grouped = new Map<string, RunView[]>();
  for (const run of runs) {
    const key = `${run.subject.kind}:${run.subject.id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), run]);
  }
  return grouped;
}

function searchText(parts: readonly (string | null)[]): string {
  return parts
    .filter((part): part is string => part !== null)
    .join(' ')
    .toLocaleLowerCase('fr-FR');
}

interface RunFacts {
  readonly live: RunView | null;
  readonly latest: RunView | null;
}

function runFacts(runs: readonly RunView[] | undefined): RunFacts {
  const list = runs ?? [];
  return { live: latestRun(list.filter(isLive)), latest: latestRun(list) };
}

function liveFields(facts: RunFacts): Pick<BoardCard, 'role' | 'live' | 'subagentCount' | 'detail' | 'detailFromAgent'> {
  const run = facts.live ?? facts.latest;
  const detail = run?.lastLine ?? null;
  return {
    role: run?.role ?? null,
    live: facts.live !== null,
    subagentCount: facts.live?.subagents.filter((subagent) => subagent.status === 'running').length ?? 0,
    detail,
    detailFromAgent: detail !== null,
  };
}

function withDetail(live: ReturnType<typeof liveFields>, override: string | null): Pick<BoardCard, 'detail' | 'detailFromAgent'> {
  return override === null ? { detail: live.detail, detailFromAgent: live.detailFromAgent } : { detail: override, detailFromAgent: false };
}

const MERGE_ORDER_STATES: readonly IssueView['state'][] = ['pr-open', 'ci'];

function awaitsMergeOrder(issue: IssueView, live: RunView | null, pullRequest: PullRequestView | undefined): boolean {
  if (issue.state === 'ready-to-merge') return true;
  if (!MERGE_ORDER_STATES.includes(issue.state) || live !== null || pullRequest === undefined) return false;
  return pullRequest.state === 'open' && pullRequest.mergeable;
}

function issueColumn(issue: IssueView, live: RunView | null, pullRequest: PullRequestView | undefined): { column: BoardColumnId; attention: AttentionKind | null } {
  if (live !== null && live.pendingQuestion !== null) return { column: 'needs-you', attention: 'question' };
  if (issue.state === 'needs-human') return { column: 'needs-you', attention: 'needs-human' };
  if (awaitsMergeOrder(issue, live, pullRequest)) return { column: 'needs-you', attention: 'merge' };
  if (issue.state === 'spec-draft') return { column: 'needs-you', attention: 'spec' };
  if (MERGED_OR_BEYOND_STATES.includes(issue.state) || issue.state === ISSUE_ABANDONED_STATE) return { column: 'done', attention: null };
  return { column: 'in-progress', attention: null };
}

function issueStep(issue: IssueView, live: RunView | null, pullRequest: PullRequestView | undefined): string {
  const parts = [ISSUE_STATE_LABELS[issue.state]];
  if (live !== null) parts.push(ROLE_LABELS[live.role]);
  if (live !== null && live.attempt > 1) parts.push(`tentative ${live.attempt}`);
  if (pullRequest !== undefined) parts.push(`PR #${pullRequest.number}`);
  if (issue.state === 'blocked' && issue.dependsOn.length > 0) {
    parts.push(`attend ${issue.dependsOn.map((number) => `#${number}`).join(', ')}`);
  }
  return parts.join(' · ');
}

function issueHref(issue: IssueView, live: RunView | null, pullRequest: PullRequestView | undefined): string {
  if (live !== null) return paths.run(live.id);
  if (awaitsMergeOrder(issue, live, pullRequest) && pullRequest !== undefined) return paths.pullRequest(pullRequest.number);
  return paths.issue(issue.number);
}

function issueCardMark(issue: IssueView, live: RunView | null, attention: AttentionKind | null): StatusMark {
  if (attention === 'question' || attention === 'merge') return 'waiting';
  if (live !== null && issue.state !== 'needs-human') return 'running';
  return issueMark(issue.state);
}

function latestTimestamp(first: string, second: string | null): string {
  return second !== null && toEpoch(second) > toEpoch(first) ? second : first;
}

function issueCard(issue: IssueView, facts: RunFacts, pullRequest: PullRequestView | undefined): BoardCard {
  const { column, attention } = issueColumn(issue, facts.live, pullRequest);
  const live = liveFields(facts);
  const question = facts.live?.pendingQuestion ?? null;
  const escalation = issue.state === 'needs-human' && question === null ? (issue.escalation?.reason ?? null) : null;
  const mark = issueCardMark(issue, facts.live, attention);
  return {
    key: `issue:${issue.number}`,
    kind: 'issue',
    column,
    mark,
    reference: `#${issue.number}`,
    title: issue.title,
    step: issueStep(issue, facts.live, pullRequest),
    ...live,
    ...(question === null ? withDetail(live, escalation) : { detail: question.text, detailFromAgent: true }),
    owner: null,
    branch: issue.branch,
    updatedAt: latestTimestamp(issue.updatedAt, facts.live?.startedAt ?? null),
    href: issueHref(issue, facts.live, pullRequest),
    attention,
    issueType: issue.type,
    searchText: searchText([
      `#${issue.number}`,
      issue.title,
      issue.branch,
      ISSUE_STATE_LABELS[issue.state],
      live.role === null ? null : ROLE_LABELS[live.role],
      issue.type,
    ]),
  };
}

function requestColumn(request: RequestView): { column: BoardColumnId; attention: AttentionKind | null } {
  switch (request.state) {
    case 'received':
      return { column: 'needs-you', attention: 'new-request' };
    case 'challenged':
      return { column: 'needs-you', attention: 'challenge-review' };
    case 'challenging':
    case 'waiting-requester':
      return { column: 'in-progress', attention: null };
    case 'accepted':
    case 'declined':
      return { column: 'done', attention: null };
  }
}

function requestCard(request: RequestView, facts: RunFacts): BoardCard {
  const { column, attention } = requestColumn(request);
  const live = liveFields(facts);
  const itemCount = request.challenge?.items.length ?? 0;
  const stepParts = [REQUEST_STATE_LABELS[request.state], request.requester];
  if (itemCount > 0) stepParts.push(`${itemCount} points`);
  return {
    key: `request:${request.id}`,
    kind: 'request',
    column,
    mark: facts.live !== null ? 'running' : requestMark(request.state),
    reference: request.id,
    title: request.title,
    step: stepParts.join(' · '),
    ...live,
    ...withDetail(live, facts.live === null ? (request.challenge?.summary ?? request.body) : null),
    owner: request.requester,
    branch: null,
    updatedAt: request.updatedAt,
    href: paths.request(request.id),
    attention,
    issueType: null,
    searchText: searchText([request.id, request.title, request.requester, REQUEST_STATE_LABELS[request.state]]),
  };
}

function auditNeedsOperator(audit: AuditView): boolean {
  return (audit.state === 'challenge' || audit.state === 'rewrite') && !audit.resolved;
}

function auditCard(audit: AuditView, facts: RunFacts): BoardCard {
  const live = liveFields(facts);
  const needsOperator = auditNeedsOperator(audit);
  const settled = audit.state === 'keep' || audit.resolved;
  return {
    key: `audit:${audit.id}`,
    kind: 'audit',
    column: needsOperator ? 'needs-you' : settled ? 'done' : 'in-progress',
    mark: facts.live !== null ? 'running' : auditMark(audit),
    reference: shortSha(audit.commitSha),
    title: audit.commitMessage,
    step: [AUDIT_STATE_LABELS[audit.state], AUDIT_REASON_LABELS[audit.reason], audit.authorName ?? audit.authorLogin]
      .filter((part): part is string => part !== null)
      .join(' · '),
    ...live,
    ...withDetail(live, audit.conclusion?.summary ?? null),
    owner: audit.authorName ?? audit.authorLogin,
    branch: audit.branch,
    updatedAt: audit.detectedAt,
    href: paths.audit(audit.id),
    attention: needsOperator ? 'audit' : null,
    issueType: audit.suggestedType,
    searchText: searchText([audit.id, audit.commitMessage, audit.authorLogin, audit.authorName, audit.branch, audit.commitSha]),
  };
}

function releaseUpdatedAt(release: ReleaseView): string {
  return release.verifiedAt ?? release.promotedAt ?? release.gate.evaluatedAt ?? release.cutAt ?? release.createdAt;
}

function releaseCard(release: ReleaseView, facts: RunFacts): BoardCard {
  const live = liveFields(facts);
  const needsOperator = release.state === 'blocked' || release.state === 'promotable';
  const firstReason = release.gate.blockingReasons[0] ?? null;
  return {
    key: `release:${release.id}`,
    kind: 'release',
    column: needsOperator ? 'needs-you' : release.state === 'verified' ? 'done' : 'in-progress',
    mark: facts.live !== null ? 'running' : releaseMark(release.state),
    reference: release.id,
    title: `Release ${release.id}`,
    step: [RELEASE_STATE_LABELS[release.state], plural(release.commits.length, 'commit', 'commits')].join(' · '),
    ...live,
    ...withDetail(live, firstReason === null ? null : translateGateReason(firstReason)),
    owner: null,
    branch: release.branch,
    updatedAt: releaseUpdatedAt(release),
    href: paths.release(release.id),
    attention: needsOperator ? 'release' : null,
    issueType: null,
    searchText: searchText([release.id, release.branch, RELEASE_STATE_LABELS[release.state]]),
  };
}

function orphanRunCard(run: RunView): BoardCard {
  const live = isLive(run);
  return {
    key: `run:${run.id}`,
    kind: 'run',
    column: run.pendingQuestion !== null ? 'needs-you' : live ? 'in-progress' : 'done',
    mark: runMark(run.status),
    reference: run.id,
    title: `${ROLE_LABELS[run.role]} · ${run.subject.kind} ${run.subject.id}`,
    step: RUN_STATUS_LABELS[run.status],
    detail: run.lastLine,
    detailFromAgent: run.lastLine !== null,
    owner: null,
    role: run.role,
    live,
    branch: run.branch,
    updatedAt: run.endedAt ?? run.startedAt,
    subagentCount: run.subagents.filter((subagent) => subagent.status === 'running').length,
    href: paths.run(run.id),
    attention: run.pendingQuestion !== null ? 'question' : null,
    issueType: null,
    searchText: searchText([run.id, run.role, ROLE_LABELS[run.role], run.branch, run.lastLine]),
  };
}

function attentionRank(card: BoardCard): number {
  return card.attention === null ? ATTENTION_PRIORITIES.length : ATTENTION_PRIORITIES.indexOf(card.attention);
}

function byRecency(left: BoardCard, right: BoardCard): number {
  return toEpoch(right.updatedAt) - toEpoch(left.updatedAt);
}

const COLUMN_ORDER: Readonly<Record<BoardColumnId, (left: BoardCard, right: BoardCard) => number>> = {
  'needs-you': (left, right) => attentionRank(left) - attentionRank(right) || byRecency(left, right),
  'in-progress': (left, right) => Number(right.live) - Number(left.live) || byRecency(left, right),
  done: byRecency,
};

export function deriveBoardCards(snapshot: CockpitSnapshot): readonly BoardCard[] {
  const grouped = runsBySubject(snapshot.runs);
  const pullRequests = new Map(snapshot.pullRequests.map((pullRequest) => [pullRequest.issueNumber, pullRequest]));
  const covered = new Set<string>();
  const facts = (kind: string, id: string): RunFacts => {
    covered.add(`${kind}:${id}`);
    return runFacts(grouped.get(`${kind}:${id}`));
  };
  const cards = [
    ...snapshot.requests.map((request) => requestCard(request, facts('request', request.id))),
    ...snapshot.issues.map((issue) => issueCard(issue, facts('issue', String(issue.number)), pullRequests.get(issue.number))),
    ...snapshot.audits.map((audit) => auditCard(audit, facts('audit', audit.id))),
    ...snapshot.releases.map((release) => releaseCard(release, facts('release', release.id))),
  ];
  const orphans = snapshot.runs.filter((run) => !covered.has(`${run.subject.kind}:${run.subject.id}`)).map(orphanRunCard);
  return [...cards, ...orphans];
}

export function deriveBoard(snapshot: CockpitSnapshot, now: number): Board {
  const visible = deriveBoardCards(snapshot).filter(
    (card) => card.column !== 'done' || now - toEpoch(card.updatedAt) <= DONE_WINDOW_MS,
  );
  const columns: Record<BoardColumnId, BoardCard[]> = { 'needs-you': [], 'in-progress': [], done: [] };
  for (const card of visible) columns[card.column].push(card);
  for (const column of BOARD_COLUMNS) columns[column].sort(COLUMN_ORDER[column]);
  return { columns, total: visible.length };
}

export interface BoardFilter {
  readonly query: string;
  readonly kinds: readonly BoardItemKind[];
  readonly roles: readonly AgentRole[];
}

export const EMPTY_BOARD_FILTER: BoardFilter = { query: '', kinds: [], roles: [] };

export function matchesFilter(card: BoardCard, filter: BoardFilter): boolean {
  const query = filter.query.trim().toLocaleLowerCase('fr-FR');
  if (query.length > 0 && !query.split(/\s+/).every((term) => card.searchText.includes(term))) return false;
  if (filter.kinds.length > 0 && !filter.kinds.includes(card.kind)) return false;
  if (filter.roles.length > 0 && (card.role === null || !filter.roles.includes(card.role))) return false;
  return true;
}

export function filterBoard(board: Board, filter: BoardFilter): Board {
  const columns: Record<BoardColumnId, readonly BoardCard[]> = {
    'needs-you': board.columns['needs-you'].filter((card) => matchesFilter(card, filter)),
    'in-progress': board.columns['in-progress'].filter((card) => matchesFilter(card, filter)),
    done: board.columns.done.filter((card) => matchesFilter(card, filter)),
  };
  return { columns, total: BOARD_COLUMNS.reduce((sum, column) => sum + columns[column].length, 0) };
}
