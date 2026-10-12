import { HttpHealthProbe } from '@agent-factory/adapters';
import type { DeliveryEnvironment, EnvironmentHealth, ReleaseModel } from '@agent-factory/application';
import type { EnvironmentConfig, ProjectConfig } from '../../config/agent-factory-config.ts';

/** Sampling never waits for a sleeping environment to wake up; a release gate does. */
const MONITOR_WAKE_UP_BUDGET_MS = 0;

export function deliveryEnvironments(project: ProjectConfig): readonly DeliveryEnvironment[] {
  return project.delivery.environments.map((environment) => ({
    name: environment.name,
    production: environment.production,
    deploymentTarget: environment.deployments.kind === 'github' ? environment.deployments.environment : null,
    redeploy: environment.redeploy,
  }));
}

function healthOf(environment: EnvironmentConfig, wakeUpBudgetMs: number): EnvironmentHealth {
  return { environment: environment.name, probe: new HttpHealthProbe({ targets: environment.health, wakeUpBudgetMs }) };
}

/** Every environment that declares health checks, probed without waiting for it to wake up. */
export function monitoredEnvironments(project: ProjectConfig): readonly EnvironmentHealth[] {
  return project.delivery.environments.filter((environment) => environment.health.length > 0).map((environment) => healthOf(environment, MONITOR_WAKE_UP_BUDGET_MS));
}

/** The environments a release runs on before production that declare health checks, given the time each one needs to wake up. */
export function releaseGateHealth(project: ProjectConfig): readonly EnvironmentHealth[] {
  return project.delivery.environments
    .filter((environment) => !environment.production && environment.health.length > 0)
    .map((environment) => healthOf(environment, environment.wakeUpMs));
}

export function releaseModel(project: ProjectConfig): ReleaseModel {
  return project.delivery.release;
}

/** The workflow page the operator opens to promote to production, when the project names one. */
export function productionWorkflowUrl(project: ProjectConfig): string | null {
  return project.delivery.environments.find((environment) => environment.production)?.workflowUrl ?? null;
}
