import { describe, expect, it } from 'vitest';
import { EnvironmentViewSchema } from '@agent-factory/cockpit';
import type { DeploymentRecord } from '@agent-factory/application';
import { projectEnvironments, type EnvironmentDeployments } from './environment-views.ts';

function record(overrides: Partial<DeploymentRecord>): DeploymentRecord {
  return {
    id: '1',
    environment: 'storefront-prep',
    ref: 'storefront-v1.10.0',
    sha: '7d6a1940e7911099bec5ae19fad205c7fb0404cb',
    createdAt: new Date('2026-10-09T14:09:58Z'),
    creator: 'release-engineer',
    state: 'success',
    logUrl: 'https://github.com/example-org/storefront/actions/runs/1',
    environmentUrl: 'https://storefront-prep.example.invalid',
    ...overrides,
  };
}

const TAGS: ReadonlySet<string> = new Set(['storefront-v1.10.0', 'storefront-v1.9.0']);

describe('environment views', () => {
  it('shows the last successful deployment as current, named by its tag, and the newest state as the status', () => {
    const prep: EnvironmentDeployments = {
      targetName: 'storefront-prep',
      url: null,
      tags: TAGS,
      records: [
        record({ id: '3', ref: 'main', sha: 'c'.repeat(40), state: 'in-progress', createdAt: new Date('2026-10-10T09:00:00Z') }),
        record({ id: '2' }),
        record({ id: '1', ref: 'storefront-v1.9.0', state: 'inactive', createdAt: new Date('2026-10-01T09:00:00Z') }),
      ],
    };
    const [view] = projectEnvironments(new Map([['prep', prep]]));
    expect(EnvironmentViewSchema.parse(view)).toMatchObject({
      name: 'prep',
      url: 'https://storefront-prep.example.invalid',
      status: 'deploying',
      current: { id: '2', version: 'storefront-v1.10.0', outcome: 'success', actor: 'release-engineer' },
    });
    expect(view?.history.map((entry) => [entry.version, entry.outcome])).toEqual([
      ['ccccccc', 'in-progress'],
      ['storefront-v1.10.0', 'success'],
      ['storefront-v1.9.0', 'success'],
    ]);
  });

  it('lists only the configured environments, in delivery order, and marks one without deployments as degraded', () => {
    const empty: EnvironmentDeployments = { targetName: 'storefront-dev', url: 'https://dev.example.invalid', tags: TAGS, records: [] };
    const failed: EnvironmentDeployments = { targetName: 'storefront-prod', url: null, tags: TAGS, records: [record({ state: 'failure' })] };
    const views = projectEnvironments(new Map([['prod', failed], ['dev', empty]]));
    expect(views.map((view) => [view.name, view.status, view.current])).toEqual([
      ['dev', 'degraded', null],
      ['prod', 'down', null],
    ]);
  });
});
