import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../../test/render.tsx';
import {
  basisOfRuns,
  FINISHED_PAGE_SIZE,
  filterRuns,
  groupRuns,
  isFiltering,
  matchesTerms,
  NO_RUN_FILTER,
  pageOfFinished,
  resolveProjectFilter,
  runPath,
  runSearchText,
  searchTerms,
} from './run-list-model.ts';
import { aRun } from './run-test-support.ts';

const textOf = (run: { id: string; model: string }) => `${run.id} ${run.model}`;

describe('resolveProjectFilter', () => {
  const projects = [{ id: 'storefront' }, { id: 'ledger' }];

  it('keeps a project the installation knows', () => {
    expect(resolveProjectFilter(projects, 'ledger')).toBe('ledger');
  });

  it('filters nothing for a project it does not know, or when none is asked', () => {
    expect(resolveProjectFilter(projects, 'gone')).toBeNull();
    expect(resolveProjectFilter(projects, null)).toBeNull();
  });
});

describe('text filter', () => {
  it('splits a query into lower-case terms', () => {
    expect(searchTerms('  Implementer   #45 ')).toEqual(['implementer', '#45']);
    expect(searchTerms('   ')).toEqual([]);
  });

  it('asks for every term, whatever the case', () => {
    expect(matchesTerms('Implementer · #45 sonnet', ['implementer', '45'])).toBe(true);
    expect(matchesTerms('Implementer · #45 sonnet', ['implementer', 'opus'])).toBe(false);
    expect(matchesTerms('anything', [])).toBe(true);
  });

  it('looks at the run, its role by id and by name, its model and its subject', () => {
    const run = aRun({ id: 'run_7f3a2c', role: 'acceptance-author', model: 'claude-opus-5-5' });
    const text = runSearchText(run, { roleLabel: 'Checks author', subject: { reference: '#45', title: 'Order history status filter' } });
    for (const term of ['run_7f3a2c', 'acceptance-author', 'checks author', 'claude-opus-5-5', '#45', 'status filter']) expect(matchesTerms(text, [term])).toBe(true);
  });

  it('copes with a subject whose title the snapshot no longer holds', () => {
    const text = runSearchText(aRun(), { roleLabel: 'Implementer', subject: { reference: '#45', title: null } });
    expect(text).not.toContain('null');
  });
});

describe('filterRuns', () => {
  const runs = [aRun({ id: 'a', project: 'storefront' }), aRun({ id: 'b', project: 'ledger' }), aRun({ id: 'c', project: null, model: 'claude-haiku-5-5' })];

  it('keeps every run when nothing filters', () => {
    expect(filterRuns(runs, NO_RUN_FILTER, textOf).map((run) => run.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the runs of one project, never those of the installation', () => {
    expect(filterRuns(runs, { project: 'ledger', query: '' }, textOf).map((run) => run.id)).toEqual(['b']);
  });

  it('combines the project and the text', () => {
    expect(filterRuns(runs, { project: null, query: 'haiku' }, textOf).map((run) => run.id)).toEqual(['c']);
    expect(filterRuns(runs, { project: 'ledger', query: 'haiku' }, textOf)).toEqual([]);
  });

  it('knows when a filter is active', () => {
    expect(isFiltering(NO_RUN_FILTER)).toBe(false);
    expect(isFiltering({ project: null, query: '  ' })).toBe(false);
    expect(isFiltering({ project: 'ledger', query: '' })).toBe(true);
    expect(isFiltering({ project: null, query: 'opus' })).toBe(true);
  });
});

describe('groupRuns', () => {
  it('puts the live runs first, the most recently started on top of each group', () => {
    const runs = [
      aRun({ id: 'old-finished', startedAt: '2026-10-10T08:00:00.000Z' }),
      aRun({ id: 'waiting', status: 'waiting', startedAt: '2026-10-12T09:01:00.000Z' }),
      aRun({ id: 'new-finished', startedAt: '2026-10-11T08:00:00.000Z' }),
      aRun({ id: 'running', status: 'running', startedAt: '2026-10-12T09:46:00.000Z' }),
    ];
    const groups = groupRuns(runs);
    expect(groups.live.map((run) => run.id)).toEqual(['running', 'waiting']);
    expect(groups.finished.map((run) => run.id)).toEqual(['new-finished', 'old-finished']);
  });
});

describe('pageOfFinished', () => {
  const finished = Array.from({ length: FINISHED_PAGE_SIZE * 2 + 5 }, (_, index) => aRun({ id: `run_${index}` }));

  it('shows one page, and counts what is left', () => {
    const page = pageOfFinished(finished, 1, null);
    expect(page.shown).toHaveLength(FINISHED_PAGE_SIZE);
    expect(page.remaining).toBe(FINISHED_PAGE_SIZE + 5);
  });

  it('shows more pages on request, up to everything', () => {
    expect(pageOfFinished(finished, 2, null).remaining).toBe(5);
    expect(pageOfFinished(finished, 3, null)).toEqual({ shown: finished, remaining: 0 });
  });

  it('reaches the run being looked at even when it lies beyond the page', () => {
    const page = pageOfFinished(finished, 1, `run_${FINISHED_PAGE_SIZE + 9}`);
    expect(page.shown).toHaveLength(FINISHED_PAGE_SIZE + 10);
    expect(page.shown.at(-1)?.id).toBe(`run_${FINISHED_PAGE_SIZE + 9}`);
  });

  it('ignores a selection that is not among the finished runs', () => {
    expect(pageOfFinished(finished, 1, 'a-live-run').shown).toHaveLength(FINISHED_PAGE_SIZE);
  });
});

describe('runPath', () => {
  it('keeps the project the list is filtered on', () => {
    expect(runPath('run_7f3a2c', null)).toBe('/runs/run_7f3a2c');
    expect(runPath('run_7f3a2c', 'ledger')).toBe('/runs/run_7f3a2c?project=ledger');
  });
});

describe('basisOfRuns', () => {
  const snapshot = fixtureSnapshot();

  it('is the basis the runs share', () => {
    expect(basisOfRuns(snapshot, [{ account: 'personal' }, { account: 'personal' }])).toBe('subscription-equivalent');
    expect(basisOfRuns(snapshot, [{ account: 'shared' }])).toBe('metered');
  });

  it('is a mix when the runs do not share one', () => {
    expect(basisOfRuns(snapshot, [{ account: 'personal' }, { account: 'shared' }])).toBe('mixed');
  });

  it('follows the installation for a run whose account is unknown', () => {
    expect(basisOfRuns(snapshot, [{ account: null }])).toBe(snapshot.costs.basis);
  });

  it('is nothing when there is no run to show', () => {
    expect(basisOfRuns(snapshot, [])).toBeNull();
  });
});
