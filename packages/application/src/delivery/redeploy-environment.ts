import { decideRedeploy, isProductionTarget, REFUSAL_PRODUCTION, type DeployedRefKind, type DeploymentEnvironment } from '@agent-factory/domain';
import type { DeploymentRecord, EventStore, GitHubGateway } from '../ports.ts';
import { deploymentSubject, REDEPLOY_DISPATCHED_EVENT, type RedeployDispatchedPayload } from './delivery-events.ts';

export const DEPLOYMENT_HISTORY_LIMIT = 10;
export const CLOUD_DELIVERY_INPUTS = { environment: 'environment_name', build: 'build', deploy: 'deploy' } as const;
const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;
const DEPLOY_REQUESTED = 'true';

export interface DeliveryTargets {
  readonly workflow: string;
  readonly targets: Readonly<Partial<Record<DeploymentEnvironment, string>>>;
}

export interface RedeployOrderInput {
  readonly environment: DeploymentEnvironment;
  readonly confirmVersion: string;
  readonly operator: string;
}

export interface RedeployEnvironmentDependencies {
  readonly events: EventStore;
  readonly github: GitHubGateway;
}

export class RedeployRefusedError extends Error {
  readonly reason: string;

  constructor(environment: string, reason: string) {
    super(`The redeploy of ${environment} is refused: ${reason}`);
    this.name = 'RedeployRefusedError';
    this.reason = reason;
  }
}

export function currentDeployment(deployments: readonly DeploymentRecord[]): DeploymentRecord | null {
  return deployments.find((deployment) => deployment.state === 'success') ?? null;
}

export async function refKindOf(github: GitHubGateway, ref: string): Promise<DeployedRefKind> {
  if ((await github.listTags()).some((tag) => tag.name === ref)) return 'tag';
  if (FULL_COMMIT_SHA.test(ref)) return 'commit';
  return (await github.branchHead(ref)) === null ? 'commit' : 'branch';
}

export class RedeployEnvironment {
  private readonly dependencies: RedeployEnvironmentDependencies;
  private readonly delivery: DeliveryTargets | null;

  constructor(dependencies: RedeployEnvironmentDependencies, delivery: DeliveryTargets | null) {
    this.dependencies = dependencies;
    this.delivery = delivery;
  }

  async redeploy(order: RedeployOrderInput): Promise<RedeployDispatchedPayload> {
    const { environment } = order;
    const targetName = this.delivery?.targets[environment] ?? null;
    if (isProductionTarget(environment, targetName ?? '')) throw new RedeployRefusedError(environment, REFUSAL_PRODUCTION);
    if (this.delivery === null) throw new RedeployRefusedError(environment, 'delivery is not configured');
    if (targetName === null) throw new RedeployRefusedError(environment, `delivery.environments.${environment} is not configured`);
    const { github, events } = this.dependencies;
    const deployments = await github.deployments(targetName, DEPLOYMENT_HISTORY_LIMIT);
    if (deployments[0]?.state === 'in-progress') {
      throw new RedeployRefusedError(environment, `a deployment to ${targetName} is in progress`);
    }
    const current = currentDeployment(deployments);
    const refKind = current === null ? null : await refKindOf(github, current.ref);
    const deployed = current === null || refKind === null ? null : { ref: current.ref, refKind, sha: current.sha };
    const decision = decideRedeploy({
      environment,
      targetName,
      confirmedVersion: order.confirmVersion,
      deployed,
      branchHeadSha: deployed?.refKind === 'branch' ? await github.branchHead(deployed.ref) : null,
    });
    if (decision.kind === 'refused') throw new RedeployRefusedError(environment, decision.reason);
    const { dispatch } = decision;
    const receipt = await github.dispatchWorkflow({
      workflow: this.delivery.workflow,
      ref: dispatch.ref,
      inputs: {
        [CLOUD_DELIVERY_INPUTS.environment]: dispatch.targetName,
        [CLOUD_DELIVERY_INPUTS.build]: dispatch.build,
        [CLOUD_DELIVERY_INPUTS.deploy]: DEPLOY_REQUESTED,
      },
    });
    const payload: RedeployDispatchedPayload = {
      environment,
      targetName,
      workflow: this.delivery.workflow,
      ref: dispatch.ref,
      sha: deployed?.sha ?? dispatch.ref,
      version: dispatch.version,
      operator: order.operator,
      simulated: receipt.simulated,
      url: receipt.url,
    };
    await events.append(REDEPLOY_DISPATCHED_EVENT, deploymentSubject(environment), payload);
    return payload;
  }
}
