export const DEPLOYMENT_ENVIRONMENTS = ['dev', 'prep', 'prod'] as const;
export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number];

export const PRODUCTION_ENVIRONMENT: DeploymentEnvironment = 'prod';
export const FACTORY_REDEPLOYABLE_ENVIRONMENTS: readonly DeploymentEnvironment[] = ['dev', 'prep'];
export const PRODUCTION_NAME_PATTERN = /(^|[^a-z0-9])(prod|production|prd)([^a-z0-9]|$)/i;
export const SHORT_SHA_LENGTH = 7;
export const REDEPLOY_BUILD_MODE = 'skip';

export const DEPLOYED_REF_KINDS = ['tag', 'branch', 'commit'] as const;
export type DeployedRefKind = (typeof DEPLOYED_REF_KINDS)[number];

export interface DeployedVersion {
  readonly ref: string;
  readonly refKind: DeployedRefKind;
  readonly sha: string;
}

export interface RedeployOrder {
  readonly environment: DeploymentEnvironment;
  readonly targetName: string;
  readonly confirmedVersion: string;
  readonly deployed: DeployedVersion | null;
  readonly branchHeadSha: string | null;
}

export interface RedeployDispatch {
  readonly ref: string;
  readonly targetName: string;
  readonly version: string;
  readonly build: typeof REDEPLOY_BUILD_MODE;
  readonly deploy: true;
}

export type RedeployDecision = { readonly kind: 'dispatch'; readonly dispatch: RedeployDispatch } | { readonly kind: 'refused'; readonly reason: string };

export const REFUSAL_PRODUCTION = 'production is never deployed by the factory; the operator runs its workflow';

export function versionOf(deployed: DeployedVersion): string {
  return deployed.refKind === 'tag' ? deployed.ref : deployed.sha.slice(0, SHORT_SHA_LENGTH);
}

export function isProductionLookingName(name: string): boolean {
  return PRODUCTION_NAME_PATTERN.test(name);
}

export function isProductionTarget(environment: DeploymentEnvironment, targetName: string): boolean {
  return environment === PRODUCTION_ENVIRONMENT || PRODUCTION_NAME_PATTERN.test(targetName);
}

function refused(reason: string): RedeployDecision {
  return { kind: 'refused', reason };
}

function dispatchAt(order: RedeployOrder, deployed: DeployedVersion): RedeployDecision {
  return {
    kind: 'dispatch',
    dispatch: { ref: deployed.ref, targetName: order.targetName, version: versionOf(deployed), build: REDEPLOY_BUILD_MODE, deploy: true },
  };
}

export function decideRedeploy(order: RedeployOrder): RedeployDecision {
  if (isProductionTarget(order.environment, order.targetName)) return refused(REFUSAL_PRODUCTION);
  if (!FACTORY_REDEPLOYABLE_ENVIRONMENTS.includes(order.environment)) return refused(`${order.environment} is not an environment the factory redeploys`);
  const deployed = order.deployed;
  if (deployed === null) return refused(`nothing is deployed on ${order.environment}, so there is no version to redeploy`);
  const version = versionOf(deployed);
  if (order.confirmedVersion.trim() === '') return refused(`a redeploy needs the operator to confirm the deployed version ${version}`);
  if (order.confirmedVersion.trim() !== version) {
    return refused(`the operator confirmed ${order.confirmedVersion.trim()} but ${version} is deployed on ${order.environment}`);
  }
  switch (deployed.refKind) {
    case 'tag':
      return dispatchAt(order, deployed);
    case 'branch':
      return order.branchHeadSha === deployed.sha
        ? dispatchAt(order, deployed)
        : refused(
            `${version} was deployed from ${deployed.ref}, which has moved to ${order.branchHeadSha ?? 'nothing'}; a dispatch on ${deployed.ref} would deploy another version`,
          );
    case 'commit':
      return refused(`${version} was deployed from a bare commit, and a workflow can only be dispatched on a branch or a tag`);
  }
}
