import { describe, expect, it } from 'vitest';
import type { ChallengeItem, ChallengeReport, ProposedSpec, RequestView } from '../../contract/index.ts';
import { requestView } from '../../test/fixtures/seeds.ts';
import {
  canAcceptSpecs,
  canDeclineRequest,
  groupRequests,
  initialSpecSelection,
  isSpecOpen,
  orderedRequests,
  requestGroupOf,
  sourcePositions,
  specIdsToAccept,
  verdictCounts,
} from './request-model.ts';

const MOMENT = Date.parse('2026-10-12T09:00:00.000Z');
const MINUTE_MS = 60_000;

function request(id: string, state: RequestView['state'], minutesAgo: number, overrides: Partial<RequestView> = {}): RequestView {
  return requestView({
    id,
    title: `Request ${id}`,
    requester: 'Dana Reyes',
    channel: 'email',
    receivedAt: new Date(MOMENT - 60 * MINUTE_MS).toISOString(),
    updatedAt: new Date(MOMENT - minutesAgo * MINUTE_MS).toISOString(),
    state,
    body: 'Text of the request',
    ...overrides,
  });
}

function spec(id: string, overrides: Partial<ProposedSpec> = {}): ProposedSpec {
  return {
    id,
    itemIds: [],
    title: `Spec ${id}`,
    type: 'feature',
    need: 'A need',
    acceptanceCriteria: ['A criterion'],
    outOfScope: [],
    expectedProof: 'A proof',
    problems: [],
    issueNumber: null,
    ...overrides,
  };
}

function item(id: string, verdict: ChallengeItem['verdict']): ChallengeItem {
  return { id, title: `Item ${id}`, verdict, currentState: '', intent: '', idea: '', method: '', reason: '', question: null, sources: [] };
}

function report(specs: readonly ProposedSpec[], items: readonly ChallengeItem[] = []): ChallengeReport {
  return { runId: null, completedAt: '2026-10-12T08:00:00.000Z', summary: 'Summary', items: [...items], specs: [...specs], reply: '' };
}

describe('request groups', () => {
  it('put the requests that wait for the operator first, then those in progress, then the closed ones', () => {
    const groups = groupRequests([
      request('R-1', 'accepted', 1),
      request('R-2', 'challenging', 2),
      request('R-3', 'received', 30),
      request('R-4', 'declined', 3),
      request('R-5', 'challenged', 10),
      request('R-6', 'waiting-requester', 4),
    ]);
    expect(groups.attention.map((entry) => entry.id)).toEqual(['R-5', 'R-3']);
    expect(groups.inProgress.map((entry) => entry.id)).toEqual(['R-2', 'R-6']);
    expect(groups.closed.map((entry) => entry.id)).toEqual(['R-1', 'R-4']);
    expect(orderedRequests(groups).map((entry) => entry.id)).toEqual(['R-5', 'R-3', 'R-2', 'R-6', 'R-1', 'R-4']);
  });

  it('sort each group by the last update, the most recent first', () => {
    const { attention } = groupRequests([request('R-1', 'received', 50), request('R-2', 'received', 5), request('R-3', 'received', 20)]);
    expect(attention.map((entry) => entry.id)).toEqual(['R-2', 'R-3', 'R-1']);
  });

  it('are empty for no request', () => {
    expect(orderedRequests(groupRequests([]))).toEqual([]);
  });

  it('put every state in one group', () => {
    expect(requestGroupOf({ state: 'received' })).toBe('attention');
    expect(requestGroupOf({ state: 'challenged' })).toBe('attention');
    expect(requestGroupOf({ state: 'challenging' })).toBe('inProgress');
    expect(requestGroupOf({ state: 'waiting-requester' })).toBe('inProgress');
    expect(requestGroupOf({ state: 'accepted' })).toBe('closed');
    expect(requestGroupOf({ state: 'declined' })).toBe('closed');
  });
});

describe('what the lifecycle allows', () => {
  it('declines and accepts only a challenged request', () => {
    for (const state of ['received', 'challenging', 'waiting-requester', 'accepted', 'declined'] as const) {
      expect(canDeclineRequest({ state }), state).toBe(false);
      expect(canAcceptSpecs({ state }), state).toBe(false);
    }
    expect(canDeclineRequest({ state: 'challenged' })).toBe(true);
    expect(canAcceptSpecs({ state: 'challenged' })).toBe(true);
  });

  it('keeps open the specs of a challenged request that have no issue yet', () => {
    expect(isSpecOpen({ state: 'challenged' }, { issueNumber: null })).toBe(true);
    expect(isSpecOpen({ state: 'challenged' }, { issueNumber: 12 })).toBe(false);
    expect(isSpecOpen({ state: 'accepted' }, { issueNumber: null })).toBe(false);
  });
});

describe('spec selection', () => {
  const specs = [spec('a'), spec('b', { problems: ['A problem'] }), spec('c', { issueNumber: 40 }), spec('d')];

  it('ticks at first the specs without an issue that have no problem', () => {
    expect([...initialSpecSelection(report(specs))]).toEqual(['a', 'd']);
  });

  it('accepts the ticked specs in the order of the report, whatever the order they were ticked in', () => {
    const challenged = request('R-1', 'challenged', 1, { challenge: report(specs) });
    expect(specIdsToAccept(challenged, new Set(['d', 'b', 'a']))).toEqual(['a', 'b', 'd']);
  });

  it('never accepts a spec that already has an issue', () => {
    const challenged = request('R-1', 'challenged', 1, { challenge: report(specs) });
    expect(specIdsToAccept(challenged, new Set(['a', 'c']))).toEqual(['a']);
  });

  it('accepts nothing once the request is no longer awaiting the decision', () => {
    const accepted = request('R-1', 'accepted', 1, { challenge: report(specs) });
    expect(specIdsToAccept(accepted, new Set(['a', 'd']))).toEqual([]);
  });

  it('accepts nothing without a challenge', () => {
    expect(specIdsToAccept(request('R-1', 'challenged', 1), new Set(['a']))).toEqual([]);
  });
});

describe('challenge report', () => {
  it('numbers from one the points a spec answers, skipping the ones the report does not hold', () => {
    const items = [item('x', 'keep'), item('y', 'adjust'), item('z', 'split')];
    expect(sourcePositions({ itemIds: ['z', 'x', 'unknown'] }, items)).toEqual([3, 1]);
    expect(sourcePositions({ itemIds: [] }, items)).toEqual([]);
  });

  it('counts the points per verdict in the order of the verdicts, leaving out the ones nobody got', () => {
    const items = [item('1', 'decline'), item('2', 'keep'), item('3', 'keep'), item('4', 'ask')];
    expect(verdictCounts({ items })).toEqual([
      { verdict: 'keep', count: 2 },
      { verdict: 'ask', count: 1 },
      { verdict: 'decline', count: 1 },
    ]);
    expect(verdictCounts({ items: [] })).toEqual([]);
  });
});
