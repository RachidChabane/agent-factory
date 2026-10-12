import type { RequestState } from '@agent-factory/domain';
import type { ChallengeItem, ChallengeReport, ChallengeVerdict, ProposedSpec, RequestView } from '../../contract/index.ts';
import { CHALLENGE_VERDICTS } from '../../contract/index.ts';
import { toEpoch } from '../../i18n/formatters.ts';

export const REQUEST_GROUPS = ['attention', 'inProgress', 'closed'] as const;
export type RequestGroup = (typeof REQUEST_GROUPS)[number];

const GROUP_OF_STATE: Readonly<Record<RequestState, RequestGroup>> = {
  received: 'attention',
  challenged: 'attention',
  challenging: 'inProgress',
  'waiting-requester': 'inProgress',
  accepted: 'closed',
  declined: 'closed',
};

export function requestGroupOf(request: Pick<RequestView, 'state'>): RequestGroup {
  return GROUP_OF_STATE[request.state];
}

function byRecency(left: RequestView, right: RequestView): number {
  return toEpoch(right.updatedAt) - toEpoch(left.updatedAt);
}

/** Requests grouped by what they ask of the operator, the most recently updated first within a group. */
export function groupRequests(requests: readonly RequestView[]): Readonly<Record<RequestGroup, readonly RequestView[]>> {
  return {
    attention: requests.filter((request) => requestGroupOf(request) === 'attention').toSorted(byRecency),
    inProgress: requests.filter((request) => requestGroupOf(request) === 'inProgress').toSorted(byRecency),
    closed: requests.filter((request) => requestGroupOf(request) === 'closed').toSorted(byRecency),
  };
}

export function orderedRequests(groups: Readonly<Record<RequestGroup, readonly RequestView[]>>): readonly RequestView[] {
  return REQUEST_GROUPS.flatMap((group) => groups[group]);
}

/** Only a challenged request is declined: the lifecycle leads from there to the declined state. */
export function canDeclineRequest(request: Pick<RequestView, 'state'>): boolean {
  return request.state === 'challenged';
}

export function canAcceptSpecs(request: Pick<RequestView, 'state'>): boolean {
  return request.state === 'challenged';
}

/** Whether a proposed spec may still be kept or edited: its request awaits the decision and no issue was made from it. */
export function isSpecOpen(request: Pick<RequestView, 'state'>, spec: Pick<ProposedSpec, 'issueNumber'>): boolean {
  return canAcceptSpecs(request) && spec.issueNumber === null;
}

/** The specs ticked at first: those without an issue yet that the challenger found no problem with. */
export function initialSpecSelection(report: Pick<ChallengeReport, 'specs'>): ReadonlySet<string> {
  return new Set(report.specs.filter((spec) => spec.issueNumber === null && spec.problems.length === 0).map((spec) => spec.id));
}

/** The ids to accept, in the order of the report: the ticked specs that are still open. */
export function specIdsToAccept(request: RequestView, selection: ReadonlySet<string>): string[] {
  const specs = request.challenge?.specs ?? [];
  return specs.filter((spec) => selection.has(spec.id) && isSpecOpen(request, spec)).map((spec) => spec.id);
}

export function sourcePositions(spec: Pick<ProposedSpec, 'itemIds'>, items: readonly Pick<ChallengeItem, 'id'>[]): readonly number[] {
  return spec.itemIds.map((id) => items.findIndex((item) => item.id === id) + 1).filter((position) => position > 0);
}

export interface VerdictCount {
  readonly verdict: ChallengeVerdict;
  readonly count: number;
}

export function verdictCounts(report: Pick<ChallengeReport, 'items'>): readonly VerdictCount[] {
  return CHALLENGE_VERDICTS.map((verdict) => ({ verdict, count: report.items.filter((item) => item.verdict === verdict).length })).filter((entry) => entry.count > 0);
}
