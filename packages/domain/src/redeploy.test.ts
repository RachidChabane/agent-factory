import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decideRedeploy, isProductionTarget, REFUSAL_PRODUCTION, type DeployedVersion, type RedeployOrder, type RedeployTarget } from './redeploy.ts';

const TAG: DeployedVersion = { ref: 'storefront-v1.4.0', refKind: 'tag', sha: 'a'.repeat(40) };
const STAGING: RedeployTarget = { environment: 'staging', deploymentTarget: 'storefront-staging', production: false, redeployable: true };
const ORDER: RedeployOrder = { target: STAGING, confirmedVersion: 'storefront-v1.4.0', deployed: TAG, branchHeadSha: null };

describe('redeploy decision', () => {
  it('dispatches a tag deployment at its tag', () => {
    expect(decideRedeploy(ORDER)).toEqual({ kind: 'dispatch', dispatch: { ref: 'storefront-v1.4.0', version: 'storefront-v1.4.0' } });
  });

  it('refuses production whatever else the order says', () => {
    expect(decideRedeploy({ ...ORDER, target: { ...STAGING, production: true } })).toEqual({ kind: 'refused', reason: REFUSAL_PRODUCTION });
    expect(decideRedeploy({ ...ORDER, target: { ...STAGING, environment: 'live', deploymentTarget: 'storefront-prod' } })).toEqual({
      kind: 'refused',
      reason: REFUSAL_PRODUCTION,
    });
    expect(decideRedeploy({ ...ORDER, target: { ...STAGING, environment: 'production' } })).toEqual({ kind: 'refused', reason: REFUSAL_PRODUCTION });
  });

  it('never dispatches towards a production target, for any environment, version or ref', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/),
        fc.constantFrom('prod', 'production', 'prd', 'PROD'),
        fc.string(),
        fc.constantFrom('tag', 'branch', 'commit'),
        fc.boolean(),
        (environment, marker, version, refKind, markerOnEnvironment) => {
          const deployed: DeployedVersion = { ref: version === '' ? 'main' : version, refKind, sha: 'b'.repeat(40) };
          const target: RedeployTarget = markerOnEnvironment
            ? { environment: `${environment}-${marker}`, deploymentTarget: environment, production: false, redeployable: true }
            : { environment, deploymentTarget: `storefront-${marker}`, production: false, redeployable: true };
          const decision = decideRedeploy({ target, confirmedVersion: version, deployed, branchHeadSha: deployed.sha });
          return decision.kind === 'refused' && decision.reason === REFUSAL_PRODUCTION;
        },
      ),
    );
  });

  it('recognises production by declaration and by name', () => {
    expect(isProductionTarget({ environment: 'live', deploymentTarget: 'live', production: true })).toBe(true);
    expect(isProductionTarget({ environment: 'prod', deploymentTarget: 'anything', production: false })).toBe(true);
    expect(isProductionTarget({ environment: 'staging', deploymentTarget: 'storefront-staging', production: false })).toBe(false);
    expect(isProductionTarget({ environment: 'dev', deploymentTarget: 'reproduction-dev', production: false })).toBe(false);
  });

  it('refuses an environment without a redeploy workflow', () => {
    expect(decideRedeploy({ ...ORDER, target: { ...STAGING, redeployable: false } })).toEqual({ kind: 'refused', reason: 'staging declares no redeploy workflow' });
  });

  it('requires the operator to confirm the version deployed there', () => {
    expect(decideRedeploy({ ...ORDER, confirmedVersion: ' ' })).toEqual({
      kind: 'refused',
      reason: 'a redeploy needs the operator to confirm the deployed version storefront-v1.4.0',
    });
    expect(decideRedeploy({ ...ORDER, confirmedVersion: 'storefront-v1.3.0' })).toEqual({
      kind: 'refused',
      reason: 'the operator confirmed storefront-v1.3.0 but storefront-v1.4.0 is deployed on staging',
    });
  });

  it('redeploys a branch deployment only while the branch still points at the deployed commit', () => {
    const branch: DeployedVersion = { ref: 'main', refKind: 'branch', sha: 'c'.repeat(40) };
    const order: RedeployOrder = { ...ORDER, confirmedVersion: 'ccccccc', deployed: branch };
    expect(decideRedeploy({ ...order, branchHeadSha: branch.sha })).toEqual({ kind: 'dispatch', dispatch: { ref: 'main', version: 'ccccccc' } });
    expect(decideRedeploy({ ...order, branchHeadSha: 'd'.repeat(40) })).toMatchObject({ kind: 'refused' });
  });

  it('refuses when nothing is deployed or the deployment came from a bare commit', () => {
    expect(decideRedeploy({ ...ORDER, deployed: null })).toEqual({
      kind: 'refused',
      reason: 'nothing is deployed on staging, so there is no version to redeploy',
    });
    expect(decideRedeploy({ ...ORDER, confirmedVersion: 'eeeeeee', deployed: { ref: 'e'.repeat(40), refKind: 'commit', sha: 'e'.repeat(40) } })).toMatchObject({
      kind: 'refused',
    });
  });
});
