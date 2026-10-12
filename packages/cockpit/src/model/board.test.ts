import { describe, expect, it } from 'vitest';
import { HOUR_MS, WEEK_MS } from '../i18n/formatters.ts';
import { mapProject, mapRuns } from '../test/fixtures/mutate.ts';
import { fixtureSnapshot, TEST_NOW } from '../test/render.tsx';
import { BOARD_COLUMNS, deriveBoard, EMPTY_BOARD_FILTER, filterBoard } from './board.ts';

const board = () => deriveBoard(fixtureSnapshot(), TEST_NOW);
const keys = (column: (typeof BOARD_COLUMNS)[number], source = board()) => source.columns[column].map((card) => card.key);

describe('deriveBoard', () => {
  it('places every visible card in the column of its state', () => {
    const derived = board();
    expect(keys('needs-human', derived)).toEqual(['storefront:issue:49']);
    expect(keys('pull-requests', derived).toSorted()).toEqual(['ledger:pr:22', 'storefront:pr:57', 'storefront:pr:60', 'storefront:pr:62']);
    expect(derived.columns.requests.map((card) => card.kind)).toEqual(Array(7).fill('request'));
    expect(derived.total).toBe(BOARD_COLUMNS.reduce((sum, column) => sum + derived.columns[column].length, 0));
  });

  it('puts what waits for the operator first, then agents at work, then the most recent', () => {
    const requests = board().columns.requests;
    expect(requests.slice(0, 5).every((card) => card.attention !== null)).toBe(true);
    const implementation = board().columns.implementation;
    expect(implementation[0]?.key).toBe('storefront:issue:45');
  });

  it('absorbs the issue of an open pull request into the card of the pull request', () => {
    expect(keys('pull-requests')).not.toContain('storefront:issue:52');
    const card = board().columns['pull-requests'].find((candidate) => candidate.key === 'storefront:pr:57');
    expect(card).toMatchObject({ kind: 'pull-request', issueNumber: 52, mergeable: true, evidenceComplete: true, checksMark: 'success', attention: 'merge' });
  });

  it('marks the checks of a pull request failed for a failure the change caused, not for one the base branch shares', () => {
    const checksMarkOf = (snapshot = fixtureSnapshot()) => deriveBoard(snapshot, TEST_NOW).columns['pull-requests'].find((card) => card.key === 'storefront:pr:62');
    expect(checksMarkOf()).toMatchObject({ checksMark: 'failed' });
    const sharedOnly = mapProject(fixtureSnapshot(), 'storefront', (project) => ({
      ...project,
      pullRequests: project.pullRequests.map((pullRequest) =>
        pullRequest.number === 62
          ? { ...pullRequest, checks: { ...pullRequest.checks, value: (pullRequest.checks.value ?? []).filter((check) => check.conclusion !== 'failure' || check.failsOnBase) } }
          : pullRequest,
      ),
    }));
    expect(checksMarkOf(sharedOnly)).toMatchObject({ checksMark: 'running' });
    const settled = mapProject(sharedOnly, 'storefront', (project) => ({
      ...project,
      pullRequests: project.pullRequests.map((pullRequest) =>
        pullRequest.number === 62 ? { ...pullRequest, checks: { ...pullRequest.checks, value: (pullRequest.checks.value ?? []).filter((check) => check.conclusion !== 'pending') } } : pullRequest,
      ),
    }));
    expect(checksMarkOf(settled)).toMatchObject({ checksMark: 'success' });
  });

  it('keeps an issue whose pull request is closed or whose pull request is absent as an issue card', () => {
    const snapshot = mapProject(fixtureSnapshot(), 'storefront', (project) => ({ ...project, pullRequests: project.pullRequests.filter((pullRequest) => pullRequest.number !== 57) }));
    const derived = deriveBoard(snapshot, TEST_NOW);
    expect(derived.columns['pull-requests'].map((card) => card.key)).toContain('storefront:issue:52');
  });

  it('shows the delivered work of the last week only', () => {
    const later = deriveBoard(fixtureSnapshot(), TEST_NOW + WEEK_MS);
    expect(later.columns.delivered).toEqual([]);
    expect(board().columns.delivered.length).toBeGreaterThan(0);
  });

  it('leaves abandoned issues and settled requests off the board', () => {
    const all = BOARD_COLUMNS.flatMap((column) => keys(column));
    expect(all).not.toContain('storefront:issue:79');
    expect(all).not.toContain('storefront:request:R-17');
    expect(all).not.toContain('storefront:request:R-12');
  });

  it('attaches the live run of an issue to its card, with the question it asks', () => {
    const live = board().columns.implementation.find((card) => card.key === 'storefront:issue:45');
    expect(live).toMatchObject({ liveRunId: 'run_7f3a2c', role: 'implementer', runningSubagents: 2 });
    const escalated = board().columns['needs-human'][0];
    expect(escalated).toMatchObject({ attention: 'question', liveRunId: 'run_5d0911' });
    expect(escalated?.detail).toMatch(/promo-savings/);
  });

  it('says which issues a blocked issue waits for, never the ones that are merged', () => {
    const blocked = board().columns.specs.find((card) => card.key === 'storefront:issue:70');
    expect(blocked).toMatchObject({ kind: 'issue', blockedBy: [61] });
    const snapshot = mapProject(fixtureSnapshot(), 'storefront', (project) => ({
      ...project,
      issues: project.issues.map((issue) => (issue.number === 61 ? { ...issue, state: 'merged' as const } : issue)),
    }));
    const derived = deriveBoard(snapshot, TEST_NOW);
    expect(derived.columns.specs.find((card) => card.key === 'storefront:issue:70')).toMatchObject({ blockedBy: [] });
  });

  it('marks a card live only while its run is alive', () => {
    const snapshot = mapRuns(fixtureSnapshot(), (runs) => runs.map((run) => (run.id === 'run_7f3a2c' ? { ...run, status: 'stopped' as const } : run)));
    const card = deriveBoard(snapshot, TEST_NOW).columns.implementation.find((candidate) => candidate.key === 'storefront:issue:45');
    expect(card?.liveRunId).toBeNull();
  });

  it('keeps an old delivery off the board by the time it was last touched', () => {
    const snapshot = mapProject(fixtureSnapshot(), 'storefront', (project) => ({
      ...project,
      issues: project.issues.map((issue) => (issue.number === 41 ? { ...issue, updatedAt: new Date(TEST_NOW - WEEK_MS - HOUR_MS).toISOString() } : issue)),
    }));
    expect(keys('delivered', deriveBoard(snapshot, TEST_NOW))).not.toContain('storefront:issue:41');
  });
});

describe('filterBoard', () => {
  it('keeps the cards of one project', () => {
    const filtered = filterBoard(board(), { ...EMPTY_BOARD_FILTER, project: 'ledger' });
    expect(BOARD_COLUMNS.flatMap((column) => filtered.columns[column]).every((card) => card.project === 'ledger')).toBe(true);
    expect(filtered.total).toBeGreaterThan(0);
  });

  it('matches every word of the query against the title, the reference and the branch', () => {
    expect(filterBoard(board(), { ...EMPTY_BOARD_FILTER, query: 'order history' }).total).toBeGreaterThan(0);
    expect(filterBoard(board(), { ...EMPTY_BOARD_FILTER, query: 'order zebra' }).total).toBe(0);
    expect(filterBoard(board(), { ...EMPTY_BOARD_FILTER, query: '#45' }).total).toBe(1);
  });

  it('keeps one kind of card, or only what needs the operator', () => {
    const requests = filterBoard(board(), { ...EMPTY_BOARD_FILTER, kinds: ['request'] });
    expect(BOARD_COLUMNS.flatMap((column) => requests.columns[column]).every((card) => card.kind === 'request')).toBe(true);
    const attention = filterBoard(board(), { ...EMPTY_BOARD_FILTER, attentionOnly: true });
    expect(BOARD_COLUMNS.flatMap((column) => attention.columns[column]).every((card) => card.attention !== null)).toBe(true);
  });
});
