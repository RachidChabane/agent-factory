import { decideRedeploy, isProductionTarget, REFUSAL_PRODUCTION, type DeployedRefKind } from '@agent-factory/domain';
import type { DeploymentRecord, EventStore, GitHubGateway } from '../ports.ts';
import { deploymentSubject, REDEPLOY_DISPATCHED_EVENT, type RedeployDispatchedPayload } from './delivery-events.ts';

export const DEPLOYMENT_HISTORY_LIMIT = 10;
/** Placeholders a redeploy workflow input may contain; the factory replaces them before dispatching. */
export const REDEPLOY_INPUT_PLACEHOLDERS = { target: '{{target}}', version: '{{version}}', ref: '{{ref}}' } as const;
const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;

/** The workflow that redeploys an environment, and its inputs. */
export interface RedeployWorkflow {
  readonly workflow: string;
  readonly inputs: Readonly<Record<string, string>>;
}

/** One environment of a project, as the configuration declares it. */
export interface DeliveryEnvironment {
  readonly name: string;
  readonly production: boolean;
  /** The name the forge's deployments use for this environment; null when the project reads no deployments for it. */
  readonly deploymentTarget: string | null;
  readonly redeploy: RedeployWorkflow | null;
}

export interface RedeployOrderInput {
  readonly environment: string;
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

export function renderRedeployInputs(inputs: Readonly<Record<string, string>>, values: { readonly target: string; readonly version: string; readonly ref: string }): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(inputs).map(([name, template]) => [
      name,
      template
        .replaceAll(REDEPLOY_INPUT_PLACEHOLDERS.target, values.target)
        .replaceAll(REDEPLOY_INPUT_PLACEHOLDERS.version, values.version)
        .replaceAll(REDEPLOY_INPUT_PLACEHOLDERS.ref, values.ref),
    ]),
  );
}

/**
 * Redeploys the version that runs on an environment, after the operator typed that version.
 * Production is refused whatever the configuration says, as is anything named like production.
 */
export class RedeployEnvironment {
  private readonly dependencies: RedeployEnvironmentDependencies;
  private readonly environments: readonly DeliveryEnvironment[];

  constructor(dependencies: RedeployEnvironmentDependencies, environments: readonly DeliveryEnvironment[]) {
    this.dependencies = dependencies;
    this.environments = environments;
  }

  async redeploy(order: RedeployOrderInput): Promise<RedeployDispatchedPayload> {
    const environment = this.requireEnvironment(order.environment);
    const deploymentTarget = environment.deploymentTarget ?? environment.name;
    if (isProductionTarget({ environment: environment.name, deploymentTarget, production: environment.production })) {
      throw new RedeployRefusedError(environment.name, REFUSAL_PRODUCTION);
    }
    if (environment.redeploy === null) throw new RedeployRefusedError(environment.name, `${environment.name} declares no redeploy workflow`);
    if (environment.deploymentTarget === null) {
      throw new RedeployRefusedError(environment.name, `${environment.name} has no deployment source, so the deployed version is unknown`);
    }
    const { github, events } = this.dependencies;
    const deployments = await github.deployments(environment.deploymentTarget, DEPLOYMENT_HISTORY_LIMIT);
    if (deployments[0]?.state === 'in-progress') {
      throw new RedeployRefusedError(environment.name, `a deployment to ${environment.deploymentTarget} is in progress`);
    }
    const current = currentDeployment(deployments);
    const refKind = current === null ? null : await refKindOf(github, current.ref);
    const deployed = current === null || refKind === null ? null : { ref: current.ref, refKind, sha: current.sha };
    const decision = decideRedeploy({
      target: { environment: environment.name, deploymentTarget: environment.deploymentTarget, production: environment.production, redeployable: true },
      confirmedVersion: order.confirmVersion,
      deployed,
      branchHeadSha: deployed?.refKind === 'branch' ? await github.branchHead(deployed.ref) : null,
    });
    if (decision.kind === 'refused') throw new RedeployRefusedError(environment.name, decision.reason);
    const { dispatch } = decision;
    const inputs = renderRedeployInputs(environment.redeploy.inputs, { target: environment.deploymentTarget, version: dispatch.version, ref: dispatch.ref });
    const receipt = await github.dispatchWorkflow({ workflow: environment.redeploy.workflow, ref: dispatch.ref, inputs });
    const payload: RedeployDispatchedPayload = {
      environment: environment.name,
      targetName: environment.deploymentTarget,
      workflow: environment.redeploy.workflow,
      ref: dispatch.ref,
      sha: deployed?.sha ?? dispatch.ref,
      version: dispatch.version,
      inputs,
      operator: order.operator,
      simulated: receipt.simulated,
      url: receipt.url,
    };
    await events.append(REDEPLOY_DISPATCHED_EVENT, deploymentSubject(environment.name), payload);
    return payload;
  }

  private requireEnvironment(name: string): DeliveryEnvironment {
    const environment = this.environments.find((candidate) => candidate.name === name);
    if (environment !== undefined) return environment;
    const known = this.environments.map((candidate) => candidate.name);
    throw new RedeployRefusedError(name, known.length === 0 ? 'the project declares no environment' : `the project declares ${known.join(', ')}`);
  }
}
