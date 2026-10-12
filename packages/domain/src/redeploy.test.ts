import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  decideRedeploy,
  DEPLOYMENT_ENVIRONMENTS,
  isProductionTarget,
  REFUSAL_PRODUCTION,
  type DeployedVersion,
  type RedeployOrder,
} from './redeploy.ts';

const TAG: DeployedVersion = { ref: 'storefront-v1.4.0', refKind: 'tag', sha: 'a'.repeat(40) };
const ORDER: RedeployOrder = {
  environment: 'prep',
  targetName: 'storefront-prep',
  confirmedVersion: 'storefront-v1.4.0',
  deployed: TAG,
  branchHeadSha: null,
};

describe('redeploy decision', () => {
  it('dispatches a tag deployment at its tag, skipping the build', () => {
    expect(decideRedeploy(ORDER)).toEqual({
      kind: 'dispatch',
      dispatch: { ref: 'storefront-v1.4.0', targetName: 'storefront-prep', version: 'storefront-v1.4.0', build: 'skip', deploy: true },
    });
  });

  it('refuses production whatever else the order says', () => {
    expect(decideRedeploy({ ...ORDER, environment: 'prod', targetName: 'storefront-prod' })).toEqual({ kind: 'refused', reason: REFUSAL_PRODUCTION });
    expect(decideRedeploy({ ...ORDER, environment: 'dev', targetName: 'storefront-prod' })).toEqual({ kind: 'refused', reason: REFUSAL_PRODUCTION });
  });

  it('never dispatches towards a production target, for any environment, version or ref', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DEPLOYMENT_ENVIRONMENTS),
        fc.constantFrom('prod', 'production', 'prd', 'PROD'),
        fc.string(),
        fc.constantFrom('tag', 'branch', 'commit'),
        (environment, marker, version, refKind) => {
          const deployed: DeployedVersion = { ref: version === '' ? 'main' : version, refKind, sha: 'b'.repeat(40) };
          const decision = decideRedeploy({
            environment,
            targetName: `storefront-${marker}`,
            confirmedVersion: version,
            deployed,
            branchHeadSha: deployed.sha,
          });
          return decision.kind === 'refused' && decision.reason === REFUSAL_PRODUCTION;
        },
      ),
    );
  });

  it('recognises production targets by environment and by name', () => {
    expect(isProductionTarget('prod', 'anything')).toBe(true);
    expect(isProductionTarget('prep', 'storefront-prep')).toBe(false);
    expect(isProductionTarget('dev', 'reproduction-dev')).toBe(false);
  });

  it('requires the operator to confirm the version deployed there', () => {
    expect(decideRedeploy({ ...ORDER, confirmedVersion: ' ' })).toEqual({
      kind: 'refused',
      reason: 'a redeploy needs the operator to confirm the deployed version storefront-v1.4.0',
    });
    expect(decideRedeploy({ ...ORDER, confirmedVersion: 'storefront-v1.3.0' })).toEqual({
      kind: 'refused',
      reason: 'the operator confirmed storefront-v1.3.0 but storefront-v1.4.0 is deployed on prep',
    });
  });

  it('redeploys a branch deployment only while the branch still points at the deployed commit', () => {
    const branch: DeployedVersion = { ref: 'main', refKind: 'branch', sha: 'c'.repeat(40) };
    const order: RedeployOrder = { ...ORDER, environment: 'dev', targetName: 'storefront-dev', confirmedVersion: 'ccccccc', deployed: branch };
    expect(decideRedeploy({ ...order, branchHeadSha: branch.sha })).toMatchObject({ kind: 'dispatch', dispatch: { ref: 'main', version: 'ccccccc' } });
    expect(decideRedeploy({ ...order, branchHeadSha: 'd'.repeat(40) })).toMatchObject({ kind: 'refused' });
  });

  it('refuses when nothing is deployed or the deployment came from a bare commit', () => {
    expect(decideRedeploy({ ...ORDER, deployed: null })).toEqual({
      kind: 'refused',
      reason: 'nothing is deployed on prep, so there is no version to redeploy',
    });
    expect(decideRedeploy({ ...ORDER, confirmedVersion: 'eeeeeee', deployed: { ref: 'e'.repeat(40), refKind: 'commit', sha: 'e'.repeat(40) } })).toMatchObject({
      kind: 'refused',
    });
  });
});
