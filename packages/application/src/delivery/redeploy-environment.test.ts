import { describe, expect, it } from 'vitest';
import { REFUSAL_PRODUCTION } from '@agent-factory/domain';
import { FakeGitHubGateway, InMemoryEventStore } from '../audit/testing/fakes.ts';
import type { DeploymentRecord } from '../ports.ts';
import { REDEPLOY_DISPATCHED_EVENT, RedeployDispatchedPayloadSchema } from './delivery-events.ts';
import { RedeployEnvironment, RedeployRefusedError, renderRedeployInputs, type DeliveryEnvironment } from './redeploy-environment.ts';

const REDEPLOY = { workflow: 'deploy.yml', inputs: { environment: '{{target}}', version: '{{version}}', build: 'false' } };
const ENVIRONMENTS: readonly DeliveryEnvironment[] = [
  { name: 'dev', production: false, deploymentTarget: 'storefront-dev', redeploy: REDEPLOY },
  { name: 'staging', production: false, deploymentTarget: 'storefront-staging', redeploy: REDEPLOY },
  { name: 'live', production: true, deploymentTarget: 'storefront-live', redeploy: null },
  { name: 'preview', production: false, deploymentTarget: null, redeploy: REDEPLOY },
  { name: 'demo', production: false, deploymentTarget: 'storefront-demo', redeploy: null },
];
const TAG_SHA = '7d6a1940e7911099bec5ae19fad205c7fb0404cb';
const MAIN_SHA = 'c0ffee14802ab85811fbd907f94990dfa598b157';

function deployment(overrides: Partial<DeploymentRecord>): DeploymentRecord {
  return {
    id: '1',
    environment: 'storefront-staging',
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
  github.deploymentsByEnvironment.set('storefront-staging', [deployment({})]);
  github.deploymentsByEnvironment.set('storefront-dev', [deployment({ id: '3', environment: 'storefront-dev', ref: 'main', sha: MAIN_SHA, state: 'success' })]);
  github.branchHeads.set('main', MAIN_SHA);
  return { events, github, redeploy: new RedeployEnvironment({ events, github }, ENVIRONMENTS) };
}

describe('redeploying an environment', () => {
  it('dispatches the configured workflow at the release tag deployed on the environment, with its inputs filled in', async () => {
    const { events, github, redeploy } = setup();
    const outcome = await redeploy.redeploy({ environment: 'staging', confirmVersion: 'storefront-v1.10.0', operator: 'alex' });
    expect(github.dispatches).toEqual([
      { workflow: 'deploy.yml', ref: 'storefront-v1.10.0', inputs: { environment: 'storefront-staging', version: 'storefront-v1.10.0', build: 'false' } },
    ]);
    expect(outcome).toMatchObject({ environment: 'staging', targetName: 'storefront-staging', version: 'storefront-v1.10.0', sha: TAG_SHA, simulated: false });
    const record = events.records.find((entry) => entry.type === REDEPLOY_DISPATCHED_EVENT);
    expect(record?.subject).toBe('deployment/staging');
    expect(RedeployDispatchedPayloadSchema.parse(record?.payload).operator).toBe('alex');
  });

  it('redeploys an environment deployed from a branch while the branch still points at the deployed commit', async () => {
    const { github, redeploy } = setup();
    await redeploy.redeploy({ environment: 'dev', confirmVersion: 'c0ffee1', operator: 'alex' });
    expect(github.dispatches[0]).toMatchObject({ ref: 'main', inputs: { environment: 'storefront-dev', version: 'c0ffee1' } });
    github.branchHeads.set('main', 'f'.repeat(40));
    await expect(redeploy.redeploy({ environment: 'dev', confirmVersion: 'c0ffee1', operator: 'alex' })).rejects.toThrow(/has moved/);
    expect(github.dispatches).toHaveLength(1);
  });

  it('refuses production before reading anything from the forge', async () => {
    const events = new InMemoryEventStore();
    const github = new FakeGitHubGateway();
    github.deployments = () => Promise.reject(new Error('the forge must not be asked'));
    const refused = new RedeployEnvironment({ events, github }, ENVIRONMENTS).redeploy({ environment: 'live', confirmVersion: 'storefront-v1.10.0', operator: 'alex' });
    await expect(refused).rejects.toBeInstanceOf(RedeployRefusedError);
    await expect(refused).rejects.toMatchObject({ reason: REFUSAL_PRODUCTION });
    expect(github.dispatches).toEqual([]);
    expect(events.records).toEqual([]);
  });

  it('refuses an unknown environment, one without a workflow and one without a deployment source', async () => {
    const { redeploy } = setup();
    await expect(redeploy.redeploy({ environment: 'qa', confirmVersion: 'v1', operator: 'alex' })).rejects.toThrow('the project declares dev, staging, live, preview, demo');
    await expect(redeploy.redeploy({ environment: 'demo', confirmVersion: 'v1', operator: 'alex' })).rejects.toThrow('demo declares no redeploy workflow');
    await expect(redeploy.redeploy({ environment: 'preview', confirmVersion: 'v1', operator: 'alex' })).rejects.toThrow('preview has no deployment source');
  });

  it('refuses a version the operator did not confirm and a deployment in progress', async () => {
    const { github, redeploy } = setup();
    await expect(redeploy.redeploy({ environment: 'staging', confirmVersion: 'storefront-v1.9.0', operator: 'alex' })).rejects.toThrow(
      'the operator confirmed storefront-v1.9.0 but storefront-v1.10.0 is deployed on staging',
    );
    github.deploymentsByEnvironment.set('storefront-staging', [deployment({ id: '2', state: 'in-progress' }), deployment({})]);
    await expect(redeploy.redeploy({ environment: 'staging', confirmVersion: 'storefront-v1.10.0', operator: 'alex' })).rejects.toThrow(/in progress/);
    expect(github.dispatches).toEqual([]);
  });

  it('keeps the simulated flag of a rehearsal dispatch', async () => {
    const { github, redeploy } = setup();
    github.simulatedDispatches = true;
    expect((await redeploy.redeploy({ environment: 'staging', confirmVersion: 'storefront-v1.10.0', operator: 'alex' })).simulated).toBe(true);
  });

  it('fills every placeholder of every input', () => {
    expect(renderRedeployInputs({ target: '{{target}}', label: '{{ref}}@{{version}}', fixed: 'yes' }, { target: 'storefront-dev', version: 'abc1234', ref: 'main' })).toEqual({
      target: 'storefront-dev',
      label: 'main@abc1234',
      fixed: 'yes',
    });
  });
});
