import { ISSUE_STATES } from '@agent-factory/domain';
import type { IssueState } from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import type { AcceptanceCheck, IssueView } from '../../contract/index.ts';
import { issueView } from '../../test/fixtures/seeds.ts';
import type { IssueGroup } from './issue-model.ts';
import {
  attemptMark,
  beforeResultTone,
  costEntryOf,
  cycleOf,
  dependenciesOf,
  dependencyCycles,
  dependentsOf,
  filterIssues,
  isBlockingDependency,
  isFiltering,
  ISSUE_GROUPS,
  issuesInGroup,
  issueTypeIds,
  matchesQuery,
  NO_ISSUE_FILTER,
  pipelineProgress,
  PIPELINE_STAGES,
  shortHash,
  sortIssues,
  startAvailability,
  unmergedDependencies,
} from './issue-model.ts';

const MOMENT = '2026-10-12T09:00:00.000Z';

function issue(number: number, state: IssueState, overrides: Partial<IssueView> = {}): IssueView {
  return issueView({
    number,
    title: `Issue ${number}`,
    type: 'feature',
    state,
    spec: { need: 'A need', acceptanceCriteria: ['A criterion'], outOfScope: [], expectedProof: 'A proof' },
    createdAt: MOMENT,
    updatedAt: MOMENT,
    url: `https://forge.example.com/issues/${number}`,
    ...overrides,
  });
}

function check(overrides: Partial<AcceptanceCheck> = {}): AcceptanceCheck {
  return {
    path: 'tests/example.test.ts',
    runner: 'vitest',
    sha256: null,
    onBase: 'fails',
    before: { result: 'failed', detail: '', score: null, screenshotUrl: null },
    ...overrides,
  };
}

describe('issue groups', () => {
  const GROUP_OF_STATE: Readonly<Record<IssueState, IssueGroup>> = {
    'spec-draft': 'attention',
    'spec-validated': 'queued',
    blocked: 'queued',
    'authoring-checks': 'active',
    'checks-frozen': 'active',
    'rewriting-check': 'active',
    implementing: 'active',
    gating: 'active',
    reviewing: 'active',
    'producing-evidence': 'active',
    'pr-open': 'active',
    ci: 'active',
    'ready-to-merge': 'attention',
    merged: 'delivered',
    'in-dev': 'delivered',
    'in-release': 'delivered',
    'in-prep': 'delivered',
    'in-prod': 'delivered',
    closed: 'delivered',
    abandoned: 'abandoned',
    'needs-human': 'attention',
  };
  const SPECIFIC_GROUPS = ISSUE_GROUPS.filter((group) => group !== 'all');

  it('place every state of the lifecycle in exactly one group besides "all"', () => {
    for (const state of ISSUE_STATES) {
      const groups = SPECIFIC_GROUPS.filter((group) => issuesInGroup([issue(1, state)], group).length === 1);
      expect(groups, state).toEqual([GROUP_OF_STATE[state]]);
    }
  });

  it('keep every issue in the "all" group', () => {
    const issues = ISSUE_STATES.map((state, index) => issue(index + 1, state));
    expect(issuesInGroup(issues, 'all')).toHaveLength(ISSUE_STATES.length);
  });
});

describe('filtering', () => {
  const issues = [
    issue(44, 'implementing', { title: 'Paginate the order history', type: 'api' }),
    issue(144, 'closed', { title: 'Round the tax', type: 'fix' }),
    issue(7, 'spec-draft', { title: 'Order history filters', type: 'ui' }),
  ];

  it('matches the title whatever the case', () => {
    expect(filterIssues(issues, { ...NO_ISSUE_FILTER, query: 'ORDER HISTORY' }).map((entry) => entry.number)).toEqual([44, 7]);
  });

  it('matches a number, with or without the leading hash, as a part of the number', () => {
    expect(filterIssues(issues, { ...NO_ISSUE_FILTER, query: '#44' }).map((entry) => entry.number)).toEqual([44, 144]);
    expect(filterIssues(issues, { ...NO_ISSUE_FILTER, query: '7' }).map((entry) => entry.number)).toEqual([7]);
  });

  it('ignores the spaces around the text', () => {
    expect(matchesQuery(issues[0] as IssueView, '   paginate ')).toBe(true);
  });

  it('combines the group, the type and the text', () => {
    expect(filterIssues(issues, { group: 'active', type: 'api', query: 'history' }).map((entry) => entry.number)).toEqual([44]);
    expect(filterIssues(issues, { group: 'active', type: 'ui', query: '' })).toEqual([]);
  });

  it('keeps every issue when nothing is asked', () => {
    expect(filterIssues(issues, NO_ISSUE_FILTER)).toHaveLength(3);
  });

  it('tells whether a filter narrows anything', () => {
    expect(isFiltering(NO_ISSUE_FILTER)).toBe(false);
    expect(isFiltering({ ...NO_ISSUE_FILTER, query: '   ' })).toBe(false);
    expect(isFiltering({ ...NO_ISSUE_FILTER, group: 'queued' })).toBe(true);
    expect(isFiltering({ ...NO_ISSUE_FILTER, type: 'fix' })).toBe(true);
    expect(isFiltering({ ...NO_ISSUE_FILTER, query: 'x' })).toBe(true);
  });

  it('sorts the most recent number first without touching the input', () => {
    const shuffled = [issue(3, 'closed'), issue(10, 'closed'), issue(1, 'closed')];
    expect(sortIssues(shuffled).map((entry) => entry.number)).toEqual([10, 3, 1]);
    expect(shuffled.map((entry) => entry.number)).toEqual([3, 10, 1]);
  });

  it('lists the declared types, then the types the issues carry that nobody declared', () => {
    const project = {
      issueTypes: [
        { id: 'feature', label: 'type:feature', proof: 'none' as const, checks: '', commitType: 'feat', commitScope: null },
        { id: 'fix', label: 'type:fix', proof: 'none' as const, checks: '', commitType: 'fix', commitScope: null },
      ],
      issues: [issue(1, 'closed', { type: 'fix' }), issue(2, 'closed', { type: 'billing' }), issue(3, 'closed', { type: 'billing' })],
    };
    expect(issueTypeIds(project)).toEqual(['feature', 'fix', 'billing']);
  });
});

describe('dependencies', () => {
  const issues = [issue(1, 'merged'), issue(2, 'implementing'), issue(3, 'spec-validated', { dependsOn: [1, 2, 9, 2] }), issue(4, 'blocked', { dependsOn: [3] })];

  it('separates what the project holds from what it does not, without repeating a number', () => {
    const { held, missing } = dependenciesOf(issues[2] as IssueView, issues);
    expect(held.map((entry) => entry.number)).toEqual([1, 2]);
    expect(missing).toEqual([9]);
  });

  it('finds what waits for an issue', () => {
    expect(dependentsOf({ number: 3 }, issues).map((entry) => entry.number)).toEqual([4]);
    expect(dependentsOf({ number: 4 }, issues)).toEqual([]);
  });

  it('counts as unmerged only the dependencies the project holds that are not merged', () => {
    expect(unmergedDependencies(issues[2] as IssueView, issues).map((entry) => entry.number)).toEqual([2]);
  });

  it('calls a dependency blocking when the issue that waits is blocked and the dependency is not merged', () => {
    expect(isBlockingDependency({ state: 'implementing' }, { state: 'blocked' })).toBe(true);
    expect(isBlockingDependency({ state: 'merged' }, { state: 'blocked' })).toBe(false);
    expect(isBlockingDependency({ state: 'implementing' }, { state: 'spec-validated' })).toBe(false);
  });

  it('finds the groups of issues that wait for each other and the one an issue belongs to', () => {
    const circular = [issue(1, 'spec-validated', { dependsOn: [2] }), issue(2, 'blocked', { dependsOn: [1] }), issue(3, 'spec-validated', { dependsOn: [3] }), issue(4, 'merged')];
    const cycles = dependencyCycles(circular);
    expect(cycles).toEqual([[1, 2], [3]]);
    expect(cycleOf({ number: 2 }, cycles)).toEqual([1, 2]);
    expect(cycleOf({ number: 4 }, cycles)).toBeNull();
    expect(dependencyCycles(issues)).toEqual([]);
  });
});

describe('startAvailability', () => {
  const issues = [issue(1, 'merged'), issue(2, 'implementing'), issue(3, 'in-prod')];

  it('offers nothing to an issue that is not queued', () => {
    for (const state of ISSUE_STATES.filter((candidate) => candidate !== 'spec-validated')) {
      expect(startAvailability(issue(10, state), issues), state).toEqual({ kind: 'unavailable' });
    }
  });

  it('is ready when everything the issue waits for is merged or beyond, or not held by the project', () => {
    expect(startAvailability(issue(10, 'spec-validated'), issues)).toEqual({ kind: 'ready' });
    expect(startAvailability(issue(10, 'spec-validated', { dependsOn: [1, 3, 99] }), issues)).toEqual({ kind: 'ready' });
  });

  it('waits on the dependencies that are not merged yet', () => {
    const availability = startAvailability(issue(10, 'spec-validated', { dependsOn: [1, 2] }), issues);
    expect(availability.kind).toBe('waiting');
    expect(availability.kind === 'waiting' ? availability.on.map((entry) => entry.number) : []).toEqual([2]);
  });
});

describe('pipelineProgress', () => {
  const statusesOf = (state: IssueState, resumeTarget: IssueState | null = null) => pipelineProgress({ state, resumeTarget }).map((stage) => stage.status);

  it('lists the stages in order', () => {
    expect(pipelineProgress({ state: 'spec-draft', resumeTarget: null }).map((stage) => stage.id)).toEqual(PIPELINE_STAGES.map((stage) => stage.id));
  });

  it('marks the stages behind as done, the stage of the state as current and the rest as upcoming', () => {
    expect(statusesOf('reviewing')).toEqual(['done', 'done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('puts the first stage as current for a draft', () => {
    expect(statusesOf('spec-draft')[0]).toBe('current');
  });

  it('shows an escalated issue stuck at the stage it stopped in', () => {
    expect(statusesOf('needs-human', 'implementing')).toEqual(['done', 'done', 'stuck', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('gives an escalated issue with no resume point no position', () => {
    expect(statusesOf('needs-human', null)).toEqual(Array<string>(PIPELINE_STAGES.length).fill('upcoming'));
  });

  it('gives an abandoned issue no position', () => {
    expect(statusesOf('abandoned')).toEqual(Array<string>(PIPELINE_STAGES.length).fill('upcoming'));
  });

  it('shows a closed issue as having passed every stage', () => {
    expect(statusesOf('closed')).toEqual(Array<string>(PIPELINE_STAGES.length).fill('done'));
  });

  it('knows a stage for every state that has one', () => {
    const staged = new Set<string>(PIPELINE_STAGES.flatMap((stage) => [...stage.states]));
    expect(ISSUE_STATES.filter((state) => !staged.has(state))).toEqual(['abandoned', 'needs-human']);
  });
});

describe('beforeResultTone', () => {
  it('trusts a check of new behaviour to fail on the base and a check of kept behaviour to pass', () => {
    expect(beforeResultTone(check({ onBase: 'fails', before: { result: 'failed', detail: '', score: null, screenshotUrl: null } }))).toBe('success');
    expect(beforeResultTone(check({ onBase: 'fails', before: { result: 'passed', detail: '', score: null, screenshotUrl: null } }))).toBe('failed');
    expect(beforeResultTone(check({ onBase: 'passes', before: { result: 'passed', detail: '', score: null, screenshotUrl: null } }))).toBe('success');
    expect(beforeResultTone(check({ onBase: 'passes', before: { result: 'failed', detail: '', score: null, screenshotUrl: null } }))).toBe('failed');
  });

  it('expects a check to fail on the base when its expectation is not set', () => {
    expect(beforeResultTone(check({ onBase: null, before: { result: 'failed', detail: '', score: null, screenshotUrl: null } }))).toBe('success');
    expect(beforeResultTone(check({ onBase: null, before: { result: 'passed', detail: '', score: null, screenshotUrl: null } }))).toBe('failed');
  });

  it('judges neither a score nor a check that was not run', () => {
    expect(beforeResultTone(check({ before: { result: 'scored', detail: '', score: 0.4, screenshotUrl: null } }))).toBe('accent');
    expect(beforeResultTone(check({ before: { result: 'not-run', detail: '', score: null, screenshotUrl: null } }))).toBe('idle');
  });
});

describe('small helpers', () => {
  it('marks an attempt by how it ended', () => {
    expect(attemptMark('running')).toBe('running');
    expect(attemptMark('passed')).toBe('success');
    expect(attemptMark('gate-failed')).toBe('failed');
    expect(attemptMark('review-failed')).toBe('failed');
    expect(attemptMark('error')).toBe('failed');
  });

  it('shortens a content hash to a prefix', () => {
    expect(shortHash('a'.repeat(64))).toBe('a'.repeat(12));
    expect(shortHash('abc')).toBe('abc');
  });

  it('finds the cost entry of an issue of one project, never of another project with the same number', () => {
    const tokens = { input: 1, output: 1, cacheRead: 0, cacheCreation: 0, withoutCache: 2, withCache: 2 };
    const entries = [
      { key: 'a', project: 'storefront', issueNumber: 12, costUsd: 1, runs: 1, tokens },
      { key: 'b', project: 'ledger', issueNumber: 12, costUsd: 2, runs: 2, tokens },
    ];
    expect(costEntryOf(entries, 'ledger', 12)?.runs).toBe(2);
    expect(costEntryOf(entries, 'ledger', 13)).toBeNull();
  });
});
