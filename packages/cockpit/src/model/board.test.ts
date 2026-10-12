import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../format/format.ts';
import { fixtureSnapshot, TEST_NOW } from '../test/render.tsx';
import { deriveBoard, DONE_WINDOW_MS, EMPTY_BOARD_FILTER, filterBoard } from './board.ts';

describe('deriveBoard', () => {
  const board = deriveBoard(fixtureSnapshot(), TEST_NOW);
  const keys = (column: keyof typeof board.columns) => board.columns[column].map((card) => card.key);

  it('collects everything that waits on the operator in "Vous concerne", most urgent first', () => {
    expect(keys('needs-you')).toEqual([
      'issue:225',
      'issue:223',
      'release:storefront-v2.3.1',
      'audit:A-15',
      'request:R-17',
      'issue:232',
      'issue:231',
      'request:R-18',
    ]);
    expect(board.columns['needs-you'][0]).toMatchObject({ attention: 'question', mark: 'waiting', href: '/runs/run_5d0911' });
  });

  it('shows live agent runs on their work item with the agent glyph and the last log line', () => {
    const live = board.columns['in-progress'].filter((card) => card.live);
    expect(live.map((card) => card.key)).toEqual(['issue:230', 'issue:227']);
    expect(live[1]).toMatchObject({ role: 'implementer', mark: 'running', href: '/runs/run_7f3a2c', detailFromAgent: true });
  });

  it('keeps only the last seven days in "Terminé"', () => {
    expect(keys('done')).toEqual(expect.arrayContaining(['issue:221', 'issue:217', 'release:storefront-v2.3.0']));
    const later = deriveBoard(fixtureSnapshot(), TEST_NOW + DONE_WINDOW_MS - 5 * DAY_MS);
    const laterKeys = later.columns.done.map((card) => card.key);
    expect(laterKeys).toContain('issue:221');
    expect(laterKeys).not.toContain('issue:217');
    expect(laterKeys).not.toContain('release:storefront-v2.3.0');
  });

  it('translates the release blocking reason for the card preview', () => {
    const release = board.columns['needs-you'].find((card) => card.key === 'release:storefront-v2.3.1');
    expect(release?.detail).toBe('Audit « à challenger » ouvert sur le commit e27b4d9');
  });

  it('names an audit by the short sha of its commit, the way a commit is referred to everywhere else', () => {
    const snapshot = fixtureSnapshot();
    const audit = snapshot.audits.find((entry) => entry.id === 'A-15');
    const sha = 'c0ffee14802ab85811fbd907f94990dfa598b157';
    const real = deriveBoard({ ...snapshot, audits: snapshot.audits.map((entry) => (entry === audit ? { ...entry, id: sha, commitSha: sha } : entry)) }, TEST_NOW);
    expect(real.columns['needs-you'].find((card) => card.key === `audit:${sha}`)?.reference).toBe('c0ffee1');
    expect(audit).toBeDefined();
  });

  it('abandons an issue into "Terminé" without asking the operator anything', () => {
    const snapshot = fixtureSnapshot();
    const abandoned = deriveBoard({ ...snapshot, issues: snapshot.issues.map((issue) => (issue.number === 223 ? { ...issue, state: 'abandoned', resumeTarget: null } : issue)) }, TEST_NOW);
    const card = [...abandoned.columns.done, ...abandoned.columns['needs-you'], ...abandoned.columns['in-progress']].find((entry) => entry.key === 'issue:223');
    expect(card).toMatchObject({ column: 'done', attention: null, mark: 'blocked' });
  });

  it('asks the operator for the merge order of an open pull request that nothing blocks', () => {
    const snapshot = fixtureSnapshot();
    const pullRequest = snapshot.pullRequests.find((entry) => entry.state === 'open' && entry.mergeable);
    if (pullRequest === undefined) throw new Error('the fixture has no mergeable pull request');
    const issues = snapshot.issues.map((issue) => (issue.number === pullRequest.issueNumber ? { ...issue, state: 'pr-open' as const } : issue));
    const runs = snapshot.runs.filter((run) => run.subject.id !== String(pullRequest.issueNumber));
    const board = deriveBoard({ ...snapshot, issues, runs }, TEST_NOW);
    expect(board.columns['needs-you'].find((card) => card.key === `issue:${pullRequest.issueNumber}`)).toMatchObject({
      attention: 'merge',
      mark: 'waiting',
      href: `/pull-requests/${pullRequest.number}`,
    });
  });

  it('filters by text, kind and role', () => {
    expect(filterBoard(board, { ...EMPTY_BOARD_FILTER, query: 'savings' }).total).toBe(3);
    expect(filterBoard(board, { ...EMPTY_BOARD_FILTER, query: 'sam/brief' }).columns['needs-you'].map((card) => card.key)).toEqual(['audit:A-15']);
    expect(filterBoard(board, { ...EMPTY_BOARD_FILTER, kinds: ['audit'] }).total).toBe(3);
    expect(filterBoard(board, { ...EMPTY_BOARD_FILTER, roles: ['acceptance-author'] }).columns['in-progress'].map((card) => card.key)).toEqual(['issue:230']);
  });
});
