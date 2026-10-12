import { describe, expect, it } from 'vitest';
import { paths, projectOfPath, sectionOfPath } from './routes.ts';

describe('paths', () => {
  it('keeps the project sub-paths that notification links point at', () => {
    expect(paths.issue('storefront', 232)).toBe('/projects/storefront/issues/232');
    expect(paths.pullRequest('storefront', 57)).toBe('/projects/storefront/pull-requests/57');
    expect(paths.mergePullRequest('storefront', 57)).toBe('/projects/storefront/pull-requests/57?merge=1');
    expect(paths.audit('storefront', 'A-15')).toBe('/projects/storefront/audits/A-15');
    expect(paths.release('storefront', '1.9.0')).toBe('/projects/storefront/releases/1.9.0');
    expect(paths.request('storefront', 'R-18')).toBe('/projects/storefront/requests/R-18');
  });

  it('addresses the pages of one project and the pages of the installation', () => {
    expect(paths.project('ledger')).toBe('/projects/ledger');
    expect(paths.delivery('ledger')).toBe('/projects/ledger/delivery');
    expect(paths.knowledge('ledger')).toBe('/projects/ledger/knowledge');
    expect(paths.projectSettings('ledger')).toBe('/projects/ledger/settings');
    expect([paths.board(), paths.runs(), paths.usage(), paths.settings()]).toEqual(['/', '/runs', '/usage', '/settings']);
    expect(paths.run('run_7f3a2c')).toBe('/runs/run_7f3a2c');
  });

  it('carries the project of the run list and of the board in the query', () => {
    expect(paths.runs('ledger')).toBe('/runs?project=ledger');
    expect(paths.board('ledger')).toBe('/?project=ledger');
  });

  it('encodes identifiers', () => {
    expect(paths.request('store front', 'R/1')).toBe('/projects/store%20front/requests/R%2F1');
  });

  it('opens the graph of the issues and the new request dialog from the address', () => {
    expect(paths.issueGraph('storefront')).toBe('/projects/storefront/issues?view=graph');
    expect(paths.newRequest('storefront')).toBe('/projects/storefront/requests?new=1');
  });
});

describe('addresses read back', () => {
  it('finds the project and the section of a pathname', () => {
    expect(projectOfPath('/projects/storefront/issues/12')).toBe('storefront');
    expect(sectionOfPath('/projects/storefront/issues/12')).toBe('issues');
    expect(sectionOfPath('/projects/storefront/pull-requests')).toBe('pull-requests');
    expect(sectionOfPath('/projects/storefront')).toBeNull();
    expect(projectOfPath('/runs')).toBeNull();
    expect(sectionOfPath('/runs')).toBeNull();
    expect(projectOfPath('/projects/store%20front/delivery')).toBe('store front');
  });
});
