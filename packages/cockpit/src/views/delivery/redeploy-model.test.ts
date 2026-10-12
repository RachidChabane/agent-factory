import { describe, expect, it } from 'vitest';
import type { Deployment, EnvironmentView } from '../../contract/index.ts';
import { confirmsDeployedVersion, currentDeploymentOf, isDeploymentInProgress, isProductionEnvironment, redeployAvailability } from './redeploy-model.ts';

const DEPLOYMENT: Deployment = {
  id: '1',
  version: '1.8.2',
  ref: '1.8.2',
  sha: '3c1d2e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d',
  deployedAt: '2026-10-11T12:00:00.000Z',
  actor: 'amorgan',
  outcome: 'success',
  workflowUrl: null,
  changes: null,
};
const READ_AT = '2026-10-12T09:50:00.000Z';

function environment(patch: Partial<EnvironmentView> = {}): EnvironmentView {
  return {
    name: 'staging',
    production: false,
    promotion: 'batch',
    status: 'healthy',
    deployments: { value: { current: DEPLOYMENT, history: [DEPLOYMENT], pending: null }, readAt: READ_AT, error: null },
    health: [],
    redeployable: true,
    workflowUrl: null,
    ...patch,
  };
}

describe('redeployAvailability', () => {
  it('offers the redeploy of the version that runs on a redeployable environment', () => {
    expect(redeployAvailability(environment())).toEqual({ kind: 'available', deployed: DEPLOYMENT });
  });

  it('still offers it on the version of a reading whose latest read failed', () => {
    const stale = environment({ deployments: { value: { current: DEPLOYMENT, history: [DEPLOYMENT], pending: null }, readAt: READ_AT, error: 'GitHub API request failed: 502' } });
    expect(redeployAvailability(stale)).toEqual({ kind: 'available', deployed: DEPLOYMENT });
  });

  it('never offers it on production, even if the project declared the environment redeployable', () => {
    expect(redeployAvailability(environment({ name: 'production', production: true }))).toEqual({ kind: 'production' });
    expect(redeployAvailability(environment({ name: 'production', production: true, redeployable: false }))).toEqual({ kind: 'production' });
  });

  it('treats an environment named like production as production, as the factory does', () => {
    expect(redeployAvailability(environment({ name: 'prod-eu' }))).toEqual({ kind: 'production' });
    expect(redeployAvailability(environment({ name: 'preprod' }))).toEqual({ kind: 'available', deployed: DEPLOYMENT });
  });

  it('does not offer it when no redeploy workflow is declared', () => {
    expect(redeployAvailability(environment({ redeployable: false }))).toEqual({ kind: 'not-declared' });
  });

  it.each([
    ['no deployment source', null],
    ['a source that was never read', { value: null, readAt: null, error: null }],
    ['a read that failed with nothing kept', { value: null, readAt: null, error: 'boom' }],
    ['a source with nothing deployed', { value: { current: null, history: [], pending: null }, readAt: READ_AT, error: null }],
    ['a history without any success', { value: { current: null, history: [{ ...DEPLOYMENT, outcome: 'failure' as const }], pending: null }, readAt: READ_AT, error: null }],
  ])('does not offer it with %s: there is no version to repeat', (_, deployments) => {
    expect(redeployAvailability(environment({ deployments }))).toEqual({ kind: 'nothing-deployed' });
  });
});

describe('isProductionEnvironment', () => {
  it('follows the declaration and the name', () => {
    expect(isProductionEnvironment({ name: 'staging', production: false })).toBe(false);
    expect(isProductionEnvironment({ name: 'staging', production: true })).toBe(true);
    expect(isProductionEnvironment({ name: 'production', production: false })).toBe(true);
  });
});

describe('currentDeploymentOf', () => {
  it('is the deployment of the reading, and null without one', () => {
    expect(currentDeploymentOf(environment())).toEqual(DEPLOYMENT);
    expect(currentDeploymentOf(environment({ deployments: null }))).toBeNull();
    expect(currentDeploymentOf(environment({ deployments: { value: null, readAt: null, error: null } }))).toBeNull();
  });
});

describe('confirmsDeployedVersion', () => {
  it('accepts the version exactly, however it is padded', () => {
    expect(confirmsDeployedVersion('1.8.2', DEPLOYMENT)).toBe(true);
    expect(confirmsDeployedVersion('  1.8.2 \n', DEPLOYMENT)).toBe(true);
  });

  it.each(['', '   ', '1.8', '1.8.20', '1.8.2.', 'v1.8.2', '1.8.2 1.8.2', '1,8,2'])('refuses %j', (typed) => {
    expect(confirmsDeployedVersion(typed, DEPLOYMENT)).toBe(false);
  });

  it('is case sensitive, as the factory is', () => {
    expect(confirmsDeployedVersion('ABC1234', { version: 'abc1234' })).toBe(false);
    expect(confirmsDeployedVersion('abc1234', { version: 'abc1234' })).toBe(true);
  });
});

describe('isDeploymentInProgress', () => {
  it('is true when the newest deployment is still running', () => {
    const running = { ...DEPLOYMENT, id: '2', outcome: 'in-progress' as const };
    expect(isDeploymentInProgress(environment({ deployments: { value: { current: DEPLOYMENT, history: [running, DEPLOYMENT], pending: null }, readAt: READ_AT, error: null } }))).toBe(true);
  });

  it('is false when only an older deployment ran, and without a reading', () => {
    const running = { ...DEPLOYMENT, id: '2', outcome: 'in-progress' as const };
    expect(isDeploymentInProgress(environment({ deployments: { value: { current: DEPLOYMENT, history: [DEPLOYMENT, running], pending: null }, readAt: READ_AT, error: null } }))).toBe(false);
    expect(isDeploymentInProgress(environment({ deployments: null }))).toBe(false);
  });
});
