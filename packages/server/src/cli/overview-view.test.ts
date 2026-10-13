import { describe, expect, it } from 'vitest';
import type { FilmToolWait } from '@agent-factory/application';
import { renderOverview, type InstallationOverview, type ProjectOverview } from './overview-view.ts';

const NOW = new Date('2026-10-12T11:00:00.000Z');
const SINCE = new Date('2026-10-12T08:00:00.000Z');
const CHECKED = new Date('2026-10-12T10:56:00.000Z');

const WAIT: FilmToolWait = {
  tool: 'vault',
  scope: 'installation',
  status: 'unauthenticated',
  detail: 'token expired',
  loginCommand: 'vault login -method=oidc',
  fixCommand: null,
  since: SINCE,
  checkedAt: CHECKED,
};

function project(filmToolWait: FilmToolWait | null): ProjectOverview {
  return { id: 'storefront', name: 'Storefront', forge: 'GitHub example-org/storefront', issuesByState: new Map(), pauses: [], filmToolWait };
}

function overviewOf(projects: readonly ProjectOverview[]): InstallationOverview {
  return {
    home: '/factory',
    configPath: '/factory/config.yaml',
    factoryProcess: 4242,
    cockpitUrl: 'http://127.0.0.1:7430',
    hazards: [],
    maxConcurrentRuns: 1,
    pauses: [],
    usage: { accounts: [], refreshMinutes: 10, staleAfterMinutes: 30 },
    projects,
  };
}

describe('the overview of the installation', () => {
  it('tells the tool the films of a project wait for, since when, when it was last read and how to log in', () => {
    const lines = renderOverview(overviewOf([project(WAIT)]), NOW);
    const at = lines.indexOf('  storefront (Storefront) on GitHub example-org/storefront');
    expect(lines.slice(at + 1, at + 4)).toEqual([
      '    films wait for the tool vault (unauthenticated: token expired)',
      '      since 2026-10-12T08:00:00.000Z (3 h ago), checked 2026-10-12T10:56:00.000Z (4 min ago); log in with: vault login -method=oidc',
      '    no issue taken by the factory yet',
    ]);
  });

  it('gives the fix command of the check when the tool declares no login, and nothing when it gives none', () => {
    const fix = renderOverview(overviewOf([project({ ...WAIT, loginCommand: null, fixCommand: 'brew install vault' })]), NOW).join('\n');
    expect(fix).toContain('; fix with: brew install vault');
    const none = renderOverview(overviewOf([project({ ...WAIT, loginCommand: null, detail: '' })]), NOW).join('\n');
    expect(none).toContain('films wait for the tool vault (unauthenticated)');
    expect(none).not.toContain('log in with');
    expect(none).not.toContain('fix with');
  });

  it('says nothing of films for a project whose films wait for no tool', () => {
    expect(renderOverview(overviewOf([project(null)]), NOW).join('\n')).not.toContain('films wait');
  });
});
