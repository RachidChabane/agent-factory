import { describe, expect, it } from 'vitest';
import { REFUSAL_PRODUCTION } from '@agent-factory/domain';
import { FakeGitHubGateway, InMemoryEventStore } from '../audit/testing/fakes.ts';
import type { DeploymentRecord } from '../ports.ts';
import { REDEPLOY_DISPATCHED_EVENT, RedeployDispatchedPayloadSchema } from './delivery-events.ts';
import { RedeployEnvironment, RedeployRefusedError, type DeliveryTargets } from './redeploy-environment.ts';

const DELIVERY: DeliveryTargets = {
  workflow: 'cloud-delivery.yml',
  targets: { dev: 'storefront-dev', prep: 'storefront-prep', prod: 'storefront-prod' },
};
const TAG_SHA = '7d6a1940e7911099bec5ae19fad205c7fb0404cb';
const MAIN_SHA = 'c0ffee14802ab85811fbd907f94990dfa598b157';

function deployment(overrides: Partial<DeploymentRecord>): DeploymentRecord {
  return {
    id: '1',
    environment: 'storefront-prep',
    ref: 'storefront-v1.10.0',
    sha: TAG_SHA,
    createdAt: new Date('2026-10-09T14:09:58Z'),
    creator: 'release-engineer',
    state: 'success',
    logUrl: null,
    environmentUrl: null,
    ...overrides,
  };
}

function setup() {
  const events = new InMemoryEventStore();
  const github = new FakeGitHubGateway();
  github.tags = [{ name: 'storefront-v1.10.0', sha: TAG_SHA }];
  github.deploymentsByEnvironment.set('storefront-prep', [deployment({})]);
  github.deploymentsByEnvironment.set('storefront-dev', [
    deployment({ id: '3', environment: 'storefront-dev', ref: 'main', sha: MAIN_SHA, state: 'success' }),
  ]);
  github.branchHeads.set('main', MAIN_SHA);
  return { events, github, redeploy: new RedeployEnvironment({ events, github }, DELIVERY) };
}

describe('redeploying an environment', () => {
  it('dispatches the delivery workflow at the release tag deployed on PREP, skipping the build', async () => {
    const { events, github, redeploy } = setup();
    const outcome = await redeploy.redeploy({ environment: 'prep', confirmVersion: 'storefront-v1.10.0', operator: 'alex' });
    expect(github.dispatches).toEqual([
      {
        workflow: 'cloud-delivery.yml',
        ref: 'storefront-v1.10.0',
        inputs: { environment_name: 'storefront-prep', build: 'skip', deploy: 'true' },
      },
    ]);
    expect(outcome).toMatchObject({ environment: 'prep', version: 'storefront-v1.10.0', sha: TAG_SHA, simulated: false });
    const record = events.records.find((entry) => entry.type === REDEPLOY_DISPATCHED_EVENT);
    expect(record?.subject).toBe('deployment/prep');
    expect(RedeployDispatchedPayloadSchema.parse(record?.payload).operator).toBe('alex');
  });

  it('redeploys DEV from its branch while the branch still points at the deployed commit', async () => {
    const { github, redeploy } = setup();
    await redeploy.redeploy({ environment: 'dev', confirmVersion: 'c0ffee1', operator: 'alex' });
    expect(github.dispatches[0]).toMatchObject({ ref: 'main', inputs: { environment_name: 'storefront-dev' } });
    github.branchHeads.set('main', 'f'.repeat(40));
    await expect(redeploy.redeploy({ environment: 'dev', confirmVersion: 'c0ffee1', operator: 'alex' })).rejects.toThrow(/has moved/);
    expect(github.dispatches).toHaveLength(1);
  });

  it('refuses production before reading anything from GitHub', async () => {
    const events = new InMemoryEventStore();
    const github = new FakeGitHubGateway();
    github.deployments = () => Promise.reject(new Error('GitHub must not be asked'));
    const refused = new RedeployEnvironment({ events, github }, DELIVERY).redeploy({ environment: 'prod', confirmVersion: 'storefront-v1.10.0', operator: 'alex' });
    await expect(refused).rejects.toBeInstanceOf(RedeployRefusedError);
    await expect(refused).rejects.toMatchObject({ reason: REFUSAL_PRODUCTION });
    expect(github.dispatches).toEqual([]);
    expect(events.records).toEqual([]);
  });

  it('refuses a version the operator did not confirm, a deployment in progress and a missing configuration', async () => {
    const { github, redeploy, events } = setup();
    await expect(redeploy.redeploy({ environment: 'prep', confirmVersion: 'storefront-v1.9.0', operator: 'alex' })).rejects.toThrow(
      'the operator confirmed storefront-v1.9.0 but storefront-v1.10.0 is deployed on prep',
    );
    github.deploymentsByEnvironment.set('storefront-prep', [deployment({ id: '2', state: 'in-progress' }), deployment({})]);
    await expect(redeploy.redeploy({ environment: 'prep', confirmVersion: 'storefront-v1.10.0', operator: 'alex' })).rejects.toThrow(/in progress/);
    await expect(
      new RedeployEnvironment({ events, github }, null).redeploy({ environment: 'dev', confirmVersion: 'c0ffee1', operator: 'alex' }),
    ).rejects.toThrow('delivery is not configured');
    expect(github.dispatches).toEqual([]);
  });

  it('keeps the simulated flag of a rehearsal dispatch', async () => {
    const { github, redeploy } = setup();
    github.simulatedDispatches = true;
    expect((await redeploy.redeploy({ environment: 'prep', confirmVersion: 'storefront-v1.10.0', operator: 'alex' })).simulated).toBe(true);
  });
});
