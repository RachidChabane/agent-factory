import type { AgentRole, IssueState, RequestState } from '@agent-factory/domain';
import { MERGED_OR_BEYOND_STATES } from '@agent-factory/domain';
import type { CockpitSnapshot, IssueView, ProjectView, PullRequestView, RequestView, RunView } from '../contract/index.ts';
import { toEpoch, WEEK_MS } from '../i18n/formatters.ts';
import type { AttentionKind } from './attention.ts';
import { ATTENTION_PRIORITIES, awaitsMergeOrder } from './attention.ts';
import { blamedConclusion } from './checks.ts';
import type { StaleThresholds } from './freshness.ts';
import { isStaleReading } from './freshness.ts';
import { isLiveRun } from './projects.ts';
import { paths } from './routes.ts';
import type { StatusMark } from './status.ts';
import { checksSummaryMark, issueMark, pullRequestMark, requestMark } from './status.ts';

/** The pipeline, left to right: a request becomes a spec, checks, an implementation, a pull request, a delivery. */
export const BOARD_COLUMNS = ['requests', 'specs', 'checks', 'implementation', 'pull-requests', 'needs-human', 'delivered'] as const;
export type BoardColumnId = (typeof BOARD_COLUMNS)[number];

export const BOARD_ITEM_KINDS = ['request', 'issue', 'pull-request'] as const;
export type BoardItemKind = (typeof BOARD_ITEM_KINDS)[number];

export const DELIVERED_WINDOW_MS = WEEK_MS;

const ISSUE_COLUMNS: Readonly<Record<IssueState, BoardColumnId | null>> = {
  'spec-draft': 'specs',
  'spec-validated': 'specs',
  blocked: 'specs',
  'authoring-checks': 'checks',
  'checks-frozen': 'checks',
  'rewriting-check': 'checks',
  implementing: 'implementation',
  gating: 'implementation',
  reviewing: 'implementation',
  'producing-evidence': 'implementation',
  'pr-open': 'pull-requests',
  ci: 'pull-requests',
  'ready-to-merge': 'pull-requests',
  merged: 'delivered',
  'in-dev': 'delivered',
  'in-release': 'delivered',
  'in-prep': 'delivered',
  'in-prod': 'delivered',
  closed: 'delivered',
  abandoned: null,
  'needs-human': 'needs-human',
};

const REQUEST_COLUMNS: Readonly<Record<RequestState, BoardColumnId | null>> = {
  received: 'requests',
  challenging: 'requests',
  challenged: 'requests',
  'waiting-requester': 'requests',
  accepted: null,
  declined: null,
};

const PULL_REQUEST_ISSUE_STATES: readonly IssueState[] = ['pr-open', 'ci', 'ready-to-merge'];

interface CardBase {
  readonly key: string;
  readonly project: string;
  readonly column: BoardColumnId;
  readonly mark: StatusMark;
  readonly reference: string;
  readonly title: string;
  /** What the agent working on the card said last, the question it asks, or why a human is needed. */
  readonly detail: string | null;
  readonly detailFromAgent: boolean;
  readonly owner: string | null;
  readonly role: AgentRole | null;
  readonly liveRunId: string | null;
  readonly runningSubagents: number;
  readonly branch: string | null;
  readonly updatedAt: string;
  readonly href: string;
  readonly attention: AttentionKind | null;
  readonly issueType: string | null;
  readonly searchText: string;
}

export interface IssueCard extends CardBase {
  readonly kind: 'issue';
  readonly state: IssueState;
  readonly number: number;
  readonly attempt: number | null;
  readonly blockedBy: readonly number[];
  readonly paused: boolean;
}

export interface PullRequestCard extends CardBase {
  readonly kind: 'pull-request';
  readonly number: number;
  readonly issueNumber: number;
  readonly state: PullRequestView['state'];
  readonly issueState: IssueState;
  readonly mergeable: boolean;
  readonly evidenceComplete: boolean;
  readonly checksMark: StatusMark;
  /** What the cockpit knows of the checks: never read, read recently, or read too long ago to be current. */
  readonly checksReading: 'unread' | 'fresh' | 'stale';
}

export interface RequestCard extends CardBase {
  readonly kind: 'request';
  readonly state: RequestState;
  readonly points: number;
}

export type BoardCard = IssueCard | PullRequestCard | RequestCard;

export interface Board {
  readonly columns: Readonly<Record<BoardColumnId, readonly BoardCard[]>>;
  readonly total: number;
}

function latestRun(runs: readonly RunView[]): RunView | null {
  return runs.reduce<RunView | null>((latest, run) => (latest === null || toEpoch(run.startedAt) > toEpoch(latest.startedAt) ? run : latest), null);
}

function searchText(parts: readonly (string | null)[]): string {
  return parts
    .filter((part): part is string => part !== null)
    .join(' ')
    .toLowerCase();
}

function latestTimestamp(first: string, second: string | null): string {
  return second !== null && toEpoch(second) > toEpoch(first) ? second : first;
}

function runsOfSubject(runs: readonly RunView[], project: string, kind: RunView['subject']['kind'], id: string): readonly RunView[] {
  return runs.filter((run) => run.project === project && run.subject.kind === kind && run.subject.id === id);
}

interface LiveFacts {
  readonly live: RunView | null;
  readonly latest: RunView | null;
}

function liveFacts(runs: readonly RunView[]): LiveFacts {
  return { live: latestRun(runs.filter(isLiveRun)), latest: latestRun(runs) };
}

function agentFields(facts: LiveFacts): Pick<CardBase, 'role' | 'liveRunId' | 'runningSubagents'> {
  const run = facts.live ?? facts.latest;
  return {
    role: run?.role ?? null,
    liveRunId: facts.live?.id ?? null,
    runningSubagents: facts.live?.subagents.filter((subagent) => subagent.status === 'running').length ?? 0,
  };
}

function pendingQuestionOf(facts: LiveFacts): NonNullable<RunView['pendingQuestion']> | null {
  return facts.live?.pendingQuestion ?? null;
}

function agentDetail(facts: LiveFacts): Pick<CardBase, 'detail' | 'detailFromAgent'> {
  const question = pendingQuestionOf(facts);
  if (question !== null) return { detail: question.text, detailFromAgent: true };
  const line = (facts.live ?? facts.latest)?.lastLine ?? null;
  return { detail: line, detailFromAgent: line !== null };
}

function unmergedDependencies(issue: IssueView, project: ProjectView): readonly number[] {
  return issue.dependsOn.filter((number) => {
    const dependency = project.issues.find((entry) => entry.number === number);
    return dependency !== undefined && !MERGED_OR_BEYOND_STATES.includes(dependency.state);
  });
}

function issueAttention(issue: IssueView, facts: LiveFacts, pullRequest: PullRequestView | undefined): AttentionKind | null {
  if (pendingQuestionOf(facts) !== null) return 'question';
  if (issue.state === 'needs-human') return 'needs-human';
  if (awaitsMergeOrder(issue, pullRequest, facts.live !== null)) return 'merge';
  if (issue.state === 'spec-draft') return 'spec';
  return null;
}

function issueCardMark(issue: IssueView, facts: LiveFacts, attention: AttentionKind | null): StatusMark {
  if (attention === 'question' || attention === 'merge') return 'waiting';
  if (facts.live !== null && issue.state !== 'needs-human') return 'running';
  return issueMark(issue.state);
}

function issueCard(issue: IssueView, project: ProjectView, runs: readonly RunView[], pullRequest: PullRequestView | undefined): IssueCard | null {
  const column = ISSUE_COLUMNS[issue.state];
  if (column === null) return null;
  const facts = liveFacts(runsOfSubject(runs, project.id, 'issue', String(issue.number)));
  const attention = issueAttention(issue, facts, pullRequest);
  const escalation = issue.state === 'needs-human' ? (issue.escalation?.reason ?? null) : null;
  const agent = agentDetail(facts);
  const useEscalation = escalation !== null && pendingQuestionOf(facts) === null;
  return {
    kind: 'issue',
    key: `${project.id}:issue:${issue.number}`,
    project: project.id,
    column,
    mark: issueCardMark(issue, facts, attention),
    reference: `#${issue.number}`,
    title: issue.title,
    state: issue.state,
    number: issue.number,
    attempt: facts.live !== null && facts.live.attempt > 1 ? facts.live.attempt : null,
    blockedBy: issue.state === 'blocked' ? unmergedDependencies(issue, project) : [],
    paused: issue.paused,
    ...agentFields(facts),
    ...(useEscalation ? { detail: escalation, detailFromAgent: false } : agent),
    owner: null,
    branch: issue.branch,
    updatedAt: latestTimestamp(issue.updatedAt, facts.live?.startedAt ?? null),
    href: paths.issue(project.id, issue.number),
    attention,
    issueType: issue.type,
    searchText: searchText([`#${issue.number}`, issue.title, issue.branch, issue.state, issue.type, project.id, facts.live?.role ?? null]),
  };
}

function checksReadingOf(pullRequest: PullRequestView, now: number, thresholds: StaleThresholds): PullRequestCard['checksReading'] {
  const { value, readAt } = pullRequest.checks;
  if (value === null) return 'unread';
  return isStaleReading(readAt, now, thresholds, 'forge') ? 'stale' : 'fresh';
}

function pullRequestCard(pullRequest: PullRequestView, issue: IssueView, project: ProjectView, runs: readonly RunView[], context: BoardContext): PullRequestCard {
  const facts = liveFacts(runsOfSubject(runs, project.id, 'issue', String(issue.number)));
  const attention = awaitsMergeOrder(issue, pullRequest, facts.live !== null) ? 'merge' : null;
  const conclusions = pullRequest.checks.value?.map(blamedConclusion) ?? [];
  return {
    kind: 'pull-request',
    key: `${project.id}:pr:${pullRequest.number}`,
    project: project.id,
    column: 'pull-requests',
    mark: attention === 'merge' ? 'waiting' : facts.live !== null ? 'running' : pullRequestMark(pullRequest.state),
    reference: `PR #${pullRequest.number}`,
    title: pullRequest.title,
    number: pullRequest.number,
    issueNumber: issue.number,
    state: pullRequest.state,
    issueState: issue.state,
    mergeable: pullRequest.mergeable,
    evidenceComplete: pullRequest.evidenceComplete,
    checksMark: checksSummaryMark(conclusions),
    checksReading: checksReadingOf(pullRequest, context.now, context.thresholds),
    ...agentFields(facts),
    ...agentDetail(facts),
    owner: null,
    branch: pullRequest.branch,
    updatedAt: latestTimestamp(issue.updatedAt, facts.live?.startedAt ?? null),
    href: paths.pullRequest(project.id, pullRequest.number),
    attention,
    issueType: pullRequest.type,
    searchText: searchText([`PR #${pullRequest.number}`, `#${issue.number}`, pullRequest.title, pullRequest.branch, pullRequest.type, project.id]),
  };
}

function requestAttention(request: RequestView, facts: LiveFacts): AttentionKind | null {
  if (pendingQuestionOf(facts) !== null) return 'question';
  if (request.state === 'received') return 'new-request';
  return request.state === 'challenged' ? 'challenge-review' : null;
}

function requestCard(request: RequestView, project: ProjectView, runs: readonly RunView[]): RequestCard | null {
  const column = REQUEST_COLUMNS[request.state];
  if (column === null) return null;
  const facts = liveFacts(runsOfSubject(runs, project.id, 'request', request.id));
  const attention = requestAttention(request, facts);
  const agent = agentDetail(facts);
  return {
    kind: 'request',
    key: `${project.id}:request:${request.id}`,
    project: project.id,
    column,
    mark: facts.live !== null ? 'running' : requestMark(request.state),
    reference: request.id,
    title: request.title,
    state: request.state,
    points: request.challenge?.items.length ?? 0,
    ...agentFields(facts),
    detail: agent.detail ?? request.challenge?.summary ?? request.body,
    detailFromAgent: agent.detailFromAgent,
    owner: request.requester,
    branch: null,
    updatedAt: request.updatedAt,
    href: paths.request(project.id, request.id),
    attention,
    issueType: null,
    searchText: searchText([request.id, request.title, request.requester, request.state, project.id]),
  };
}

interface BoardContext {
  readonly now: number;
  readonly thresholds: StaleThresholds;
}

function projectCards(project: ProjectView, runs: readonly RunView[], context: BoardContext): BoardCard[] {
  const pullRequests = new Map(project.pullRequests.map((pullRequest) => [pullRequest.issueNumber, pullRequest]));
  const cards: BoardCard[] = [];
  for (const request of project.requests) {
    const card = requestCard(request, project, runs);
    if (card !== null) cards.push(card);
  }
  for (const issue of project.issues) {
    const pullRequest = pullRequests.get(issue.number);
    if (pullRequest !== undefined && pullRequest.state === 'open' && PULL_REQUEST_ISSUE_STATES.includes(issue.state)) {
      cards.push(pullRequestCard(pullRequest, issue, project, runs, context));
      continue;
    }
    const card = issueCard(issue, project, runs, pullRequest);
    if (card !== null) cards.push(card);
  }
  return cards;
}

type BoardSource = Pick<CockpitSnapshot, 'projects' | 'runs'> & { readonly installation: Pick<CockpitSnapshot['installation'], 'staleAfterMs'> };

export function deriveBoardCards(snapshot: BoardSource, now: number): readonly BoardCard[] {
  const context: BoardContext = { now, thresholds: snapshot.installation.staleAfterMs };
  return snapshot.projects.flatMap((project) => projectCards(project, snapshot.runs, context));
}

function attentionRank(card: BoardCard): number {
  return card.attention === null ? ATTENTION_PRIORITIES.length : ATTENTION_PRIORITIES.indexOf(card.attention);
}

function byUrgency(left: BoardCard, right: BoardCard): number {
  return (
    attentionRank(left) - attentionRank(right) ||
    Number(right.liveRunId !== null) - Number(left.liveRunId !== null) ||
    toEpoch(right.updatedAt) - toEpoch(left.updatedAt)
  );
}

export function deriveBoard(snapshot: BoardSource, now: number): Board {
  const visible = deriveBoardCards(snapshot, now).filter((card) => card.column !== 'delivered' || now - toEpoch(card.updatedAt) <= DELIVERED_WINDOW_MS);
  const columns: Record<BoardColumnId, BoardCard[]> = {
    requests: [],
    specs: [],
    checks: [],
    implementation: [],
    'pull-requests': [],
    'needs-human': [],
    delivered: [],
  };
  for (const card of visible) columns[card.column].push(card);
  for (const column of BOARD_COLUMNS) columns[column].sort(byUrgency);
  return { columns, total: visible.length };
}

export interface BoardFilter {
  readonly project: string | null;
  readonly query: string;
  readonly kinds: readonly BoardItemKind[];
  readonly attentionOnly: boolean;
}

export const EMPTY_BOARD_FILTER: BoardFilter = { project: null, query: '', kinds: [], attentionOnly: false };

export function matchesFilter(card: BoardCard, filter: BoardFilter): boolean {
  if (filter.project !== null && card.project !== filter.project) return false;
  const terms = filter.query.trim().toLowerCase().split(/\s+/).filter((term) => term.length > 0);
  if (!terms.every((term) => card.searchText.includes(term))) return false;
  if (filter.kinds.length > 0 && !filter.kinds.includes(card.kind)) return false;
  if (filter.attentionOnly && card.attention === null) return false;
  return true;
}

export function filterBoard(board: Board, filter: BoardFilter): Board {
  const columns: Record<BoardColumnId, readonly BoardCard[]> = {
    requests: [],
    specs: [],
    checks: [],
    implementation: [],
    'pull-requests': [],
    'needs-human': [],
    delivered: [],
  };
  let total = 0;
  for (const column of BOARD_COLUMNS) {
    const cards = board.columns[column].filter((card) => matchesFilter(card, filter));
    columns[column] = cards;
    total += cards.length;
  }
  return { columns, total };
}
