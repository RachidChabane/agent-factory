export const PRODUCTION_NAME_PATTERN = /(^|[^a-z0-9])(prod|production|prd)([^a-z0-9]|$)/i;
export const SHORT_SHA_LENGTH = 7;

export const DEPLOYED_REF_KINDS = ['tag', 'branch', 'commit'] as const;
export type DeployedRefKind = (typeof DEPLOYED_REF_KINDS)[number];

export interface DeployedVersion {
  readonly ref: string;
  readonly refKind: DeployedRefKind;
  readonly sha: string;
}

/** One environment of a project, as the redeploy decision sees it. */
export interface RedeployTarget {
  readonly environment: string;
  /** The name the forge's deployments use for this environment. */
  readonly deploymentTarget: string;
  readonly production: boolean;
  /** Whether the project declares a redeploy workflow for this environment. */
  readonly redeployable: boolean;
}

export interface RedeployOrder {
  readonly target: RedeployTarget;
  readonly confirmedVersion: string;
  readonly deployed: DeployedVersion | null;
  readonly branchHeadSha: string | null;
}

export interface RedeployDispatch {
  readonly ref: string;
  readonly version: string;
}

export type RedeployDecision = { readonly kind: 'dispatch'; readonly dispatch: RedeployDispatch } | { readonly kind: 'refused'; readonly reason: string };

export const REFUSAL_PRODUCTION = 'production is never deployed by the factory; the operator runs its workflow';

export function versionOf(deployed: DeployedVersion): string {
  return deployed.refKind === 'tag' ? deployed.ref : deployed.sha.slice(0, SHORT_SHA_LENGTH);
}

export function isProductionLookingName(name: string): boolean {
  return PRODUCTION_NAME_PATTERN.test(name);
}

/** Production is what the project declares, and anything named like production, whatever the declaration says. */
export function isProductionTarget(target: Pick<RedeployTarget, 'environment' | 'deploymentTarget' | 'production'>): boolean {
  return target.production || isProductionLookingName(target.environment) || isProductionLookingName(target.deploymentTarget);
}

function refused(reason: string): RedeployDecision {
  return { kind: 'refused', reason };
}

function dispatchAt(deployed: DeployedVersion): RedeployDecision {
  return { kind: 'dispatch', dispatch: { ref: deployed.ref, version: versionOf(deployed) } };
}

export function decideRedeploy(order: RedeployOrder): RedeployDecision {
  const { target } = order;
  if (isProductionTarget(target)) return refused(REFUSAL_PRODUCTION);
  if (!target.redeployable) return refused(`${target.environment} declares no redeploy workflow`);
  const deployed = order.deployed;
  if (deployed === null) return refused(`nothing is deployed on ${target.environment}, so there is no version to redeploy`);
  const version = versionOf(deployed);
  if (order.confirmedVersion.trim() === '') return refused(`a redeploy needs the operator to confirm the deployed version ${version}`);
  if (order.confirmedVersion.trim() !== version) {
    return refused(`the operator confirmed ${order.confirmedVersion.trim()} but ${version} is deployed on ${target.environment}`);
  }
  switch (deployed.refKind) {
    case 'tag':
      return dispatchAt(deployed);
    case 'branch':
      return order.branchHeadSha === deployed.sha
        ? dispatchAt(deployed)
        : refused(
            `${version} was deployed from ${deployed.ref}, which has moved to ${order.branchHeadSha ?? 'nothing'}; a dispatch on ${deployed.ref} would deploy another version`,
          );
    case 'commit':
      return refused(`${version} was deployed from a bare commit, and a workflow can only be dispatched on a branch or a tag`);
  }
}
