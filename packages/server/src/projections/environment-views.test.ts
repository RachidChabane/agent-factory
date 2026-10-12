import { describe, expect, it } from 'vitest';
import { EnvironmentViewSchema } from '@agent-factory/cockpit';
import type { RepositoryCommit } from '@agent-factory/adapters';
import type { DeploymentRecord, HealthSample } from '@agent-factory/application';
import type { EnvironmentConfig } from '../config/agent-factory-config.ts';
import { environmentView, type EnvironmentDeployments, type MergedPullRequests } from './environment-views.ts';

const READ_AT = new Date('2026-10-10T09:01:00Z');
const TAGS: ReadonlySet<string> = new Set(['storefront-v1.10.0', 'storefront-v1.9.0']);
const NO_CHANGES: EnvironmentDeployments['changes'] = new Map();
const NOTHING_MERGED: MergedPullRequests = new Map();

function commit(overrides: Partial<RepositoryCommit>): RepositoryCommit {
  return { sha: 'a'.repeat(40), message: 'feat(cockpit): show the delivery\n\nbody', authorName: 'Dana Reyes', committedAt: new Date('2026-10-09T14:00:00Z'), ...overrides };
}

function record(overrides: Partial<DeploymentRecord>): DeploymentRecord {
  return {
    id: '1',
    environment: 'storefront-staging',
    ref: 'storefront-v1.10.0',
    sha: '7d6a1940e7911099bec5ae19fad205c7fb0404cb',
    createdAt: new Date('2026-10-09T14:09:58Z'),
    creator: 'release-engineer',
    state: 'success',
    logUrl: 'https://github.com/example-org/storefront/actions/runs/1',
    environmentUrl: 'https://staging.storefront.example.com',
    ...overrides,
  };
}

function environment(overrides: Partial<EnvironmentConfig> = {}): EnvironmentConfig {
  return {
    name: 'staging',
    production: false,
    promotion: 'automatic',
    deployments: { kind: 'github', environment: 'storefront-staging' },
    health: [{ name: 'web', url: 'https://staging.storefront.example.com/healthz' }],
    wakeUpMs: 0,
    redeploy: { workflow: 'deploy.yml', inputs: { environment: '{{target}}' } },
    workflowUrl: null,
    ...overrides,
  };
}

function sample(minutesAgo: number, ok: boolean, check = 'web'): HealthSample {
  return {
    environment: 'staging',
    check,
    url: `https://staging.storefront.example.com/${check}/healthz`,
    at: new Date(READ_AT.getTime() - minutesAgo * 60_000),
    ok,
    statusCode: ok ? 200 : 503,
    latencyMs: 120,
    detail: ok ? 'HTTP 200' : 'HTTP 503',
  };
}

describe('the view of an environment', () => {
  it('shows the last successful deployment as current, named by its tag, and a running deployment as deploying', () => {
    const deployments: EnvironmentDeployments = {
      tags: TAGS,
      records: [
        record({ id: '3', ref: 'main', sha: 'c'.repeat(40), state: 'in-progress', createdAt: new Date('2026-10-10T09:00:00Z') }),
        record({ id: '2' }),
        record({ id: '1', ref: 'storefront-v1.9.0', state: 'inactive', createdAt: new Date('2026-10-01T09:00:00Z') }),
      ],
      changes: NO_CHANGES,
      pending: null,
    };
    const view = EnvironmentViewSchema.parse(environmentView(environment(), { value: deployments, readAt: READ_AT, error: null }, new Map(), NOTHING_MERGED));
    expect(view).toMatchObject({ name: 'staging', status: 'deploying', production: false, redeployable: true });
    expect(view.deployments).toMatchObject({ readAt: READ_AT.toISOString(), value: { current: { id: '2', version: 'storefront-v1.10.0', outcome: 'success', actor: 'release-engineer' } } });
    expect(view.deployments?.value?.history.map((entry) => [entry.version, entry.outcome])).toEqual([
      ['ccccccc', 'in-progress'],
      ['storefront-v1.10.0', 'success'],
      ['storefront-v1.9.0', 'success'],
    ]);
  });

  it('takes its status from the latest health sample of each check: healthy, degraded or down', () => {
    const twoChecks = environment({ health: [{ name: 'web', url: 'https://staging.storefront.example.com/healthz' }, { name: 'api', url: 'https://api.staging.storefront.example.com/healthz' }] });
    const status = (web: boolean, api: boolean) =>
      environmentView(twoChecks, null, new Map([['web', [sample(10, !web), sample(5, web)]], ['api', [sample(5, api, 'api')]]]), NOTHING_MERGED).status;
    expect(status(true, true)).toBe('healthy');
    expect(status(true, false)).toBe('degraded');
    expect(status(false, false)).toBe('down');
    const view = environmentView(twoChecks, null, new Map([['web', [sample(10, false), sample(5, true)]]]), NOTHING_MERGED);
    expect(view.health.map((check) => [check.name, check.latest?.ok ?? null, check.series.length])).toEqual([
      ['web', true, 2],
      ['api', null, 0],
    ]);
  });

  it('stays unknown, not healthy and not empty, while nothing has been read', () => {
    const view = environmentView(environment(), { value: null, readAt: null, error: null }, new Map(), NOTHING_MERGED);
    expect(view.status).toBe('unknown');
    expect(view.deployments).toEqual({ value: null, readAt: null, error: null });
    expect(environmentView(environment({ deployments: { kind: 'none' } }), null, new Map(), NOTHING_MERGED).deployments).toBeNull();
  });

  it('never offers to redeploy production, whatever its configuration says', () => {
    const production = environment({ name: 'production', production: true, promotion: 'manual' });
    expect(environmentView(production, null, new Map(), NOTHING_MERGED)).toMatchObject({ production: true, redeployable: false });
    expect(environmentView(environment({ name: 'prod', redeploy: { workflow: 'deploy.yml', inputs: {} } }), null, new Map(), NOTHING_MERGED).redeployable).toBe(false);
  });
  it('carries the commits each deployment brought and those waiting behind the current one, linked to their pull requests by the merge commit', () => {
    const delivered = commit({ sha: 'd'.repeat(40) });
    const direct = commit({ sha: 'e'.repeat(40), authorName: 'Riley Chen', message: 'fix: later' });
    const waiting = commit({ sha: 'f'.repeat(40) });
    const merged: MergedPullRequests = new Map([[delivered.sha, { pullRequestNumber: 12, issueNumber: 7 }]]);
    const deployments: EnvironmentDeployments = {
      tags: TAGS,
      records: [record({ id: '2' }), record({ id: '1', state: 'inactive' }), record({ id: '0', state: 'inactive' })],
      changes: new Map([
        ['2', [delivered, direct]],
        ['1', []],
      ]),
      pending: [waiting],
    };
    const view = EnvironmentViewSchema.parse(environmentView(environment(), { value: deployments, readAt: READ_AT, error: null }, new Map(), merged));
    expect(view.deployments?.value?.current?.changes).toEqual([
      { sha: delivered.sha, headline: 'feat(cockpit): show the delivery', author: 'Dana Reyes', committedAt: '2026-10-09T14:00:00.000Z', pullRequestNumber: 12, issueNumber: 7 },
      { sha: direct.sha, headline: 'fix: later', author: 'Riley Chen', committedAt: '2026-10-09T14:00:00.000Z', pullRequestNumber: null, issueNumber: null },
    ]);
    expect(view.deployments?.value?.history.map((entry) => entry.changes?.length ?? null)).toEqual([2, 0, null]);
    expect(view.deployments?.value?.pending).toEqual([expect.objectContaining({ sha: waiting.sha, pullRequestNumber: null })]);
  });

  it('leaves the pending commits unknown when nothing is deployed, even if the clone listed some', () => {
    const failed: EnvironmentDeployments = { tags: TAGS, records: [record({ state: 'failure' })], changes: NO_CHANGES, pending: [commit({})] };
    const view = environmentView(environment(), { value: failed, readAt: READ_AT, error: null }, new Map(), NOTHING_MERGED);
    expect(view.deployments?.value?.pending).toBeNull();
  });
});
