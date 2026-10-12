import { isProductionTarget } from '@agent-factory/domain';
import type { Deployment, EnvironmentView } from '../../contract/index.ts';

/** Why the cockpit offers a redeploy of an environment, or why it does not. */
export type RedeployAvailability =
  | { readonly kind: 'available'; readonly deployed: Deployment }
  | { readonly kind: 'production' }
  | { readonly kind: 'not-declared' }
  | { readonly kind: 'nothing-deployed' };

/** Production is what the project declares and anything named like production: the factory refuses both. */
export function isProductionEnvironment(environment: Pick<EnvironmentView, 'name' | 'production'>): boolean {
  return isProductionTarget({ environment: environment.name, deploymentTarget: environment.name, production: environment.production });
}

/** The deployment that runs on the environment as last read, whether or not that read has since failed. */
export function currentDeploymentOf(environment: Pick<EnvironmentView, 'deployments'>): Deployment | null {
  return environment.deployments?.value?.current ?? null;
}

export function redeployAvailability(environment: EnvironmentView): RedeployAvailability {
  if (isProductionEnvironment(environment)) return { kind: 'production' };
  if (!environment.redeployable) return { kind: 'not-declared' };
  const deployed = currentDeploymentOf(environment);
  return deployed === null ? { kind: 'nothing-deployed' } : { kind: 'available', deployed };
}

/** Whether what the operator typed is the deployed version: the factory compares it after trimming. */
export function confirmsDeployedVersion(typed: string, deployed: Pick<Deployment, 'version'>): boolean {
  return typed.trim() === deployed.version;
}

/** The factory refuses a redeploy while the newest deployment of the environment is still running. */
export function isDeploymentInProgress(environment: Pick<EnvironmentView, 'deployments'>): boolean {
  return environment.deployments?.value?.history[0]?.outcome === 'in-progress';
}
