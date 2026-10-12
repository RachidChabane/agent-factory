import type { Deployment, EnvironmentView, HealthCheckView, HealthSample as HealthSampleView } from '@agent-factory/cockpit';
import { isProductionTarget, SHORT_SHA_LENGTH } from '@agent-factory/domain';
import { currentDeployment, type DeploymentRecord, type DeploymentState, type HealthSample } from '@agent-factory/application';
import type { EnvironmentConfig } from '../config/agent-factory-config.ts';
import { observedView, type Observed } from '../snapshot/cached-reading.ts';
import { iso } from './event-index.ts';

/** What the forge says was deployed on an environment, and the release tags that name versions. */
export interface EnvironmentDeployments {
  readonly records: readonly DeploymentRecord[];
  readonly tags: ReadonlySet<string>;
}

export type HealthSamplesByCheck = ReadonlyMap<string, readonly HealthSample[]>;

const OUTCOME_OF: Readonly<Record<DeploymentState, Deployment['outcome']>> = {
  success: 'success',
  inactive: 'success',
  failure: 'failure',
  'in-progress': 'in-progress',
};

function deploymentView(record: DeploymentRecord, tags: ReadonlySet<string>): Deployment {
  return {
    id: record.id,
    version: tags.has(record.ref) ? record.ref : record.sha.slice(0, SHORT_SHA_LENGTH),
    ref: record.ref,
    sha: record.sha,
    deployedAt: iso(record.createdAt),
    actor: record.creator,
    outcome: OUTCOME_OF[record.state],
    workflowUrl: record.logUrl,
  };
}

function sampleView(sample: HealthSample): HealthSampleView {
  return { at: iso(sample.at), ok: sample.ok, statusCode: sample.statusCode, latencyMs: sample.latencyMs, detail: sample.detail };
}

function healthViews(environment: EnvironmentConfig, samples: HealthSamplesByCheck): HealthCheckView[] {
  return environment.health.map((check) => {
    const series = (samples.get(check.name) ?? []).map(sampleView);
    return { name: check.name, url: check.url, latest: series.at(-1) ?? null, series };
  });
}

/** Deploying while a deployment runs; otherwise what the latest health samples say; unknown without either. */
function statusOf(deployments: Observed<EnvironmentDeployments> | null, health: readonly HealthCheckView[]): EnvironmentView['status'] {
  if (deployments?.value?.records[0]?.state === 'in-progress') return 'deploying';
  const latest = health.flatMap((check) => (check.latest === null ? [] : [check.latest]));
  if (latest.length === 0) return 'unknown';
  const passing = latest.filter((sample) => sample.ok).length;
  if (passing === latest.length) return 'healthy';
  return passing === 0 ? 'down' : 'degraded';
}

export function environmentView(environment: EnvironmentConfig, deployments: Observed<EnvironmentDeployments> | null, samples: HealthSamplesByCheck): EnvironmentView {
  const health = healthViews(environment, samples);
  const deploymentTarget = environment.deployments.kind === 'github' ? environment.deployments.environment : environment.name;
  const production = isProductionTarget({ environment: environment.name, deploymentTarget, production: environment.production });
  return {
    name: environment.name,
    production,
    promotion: environment.promotion,
    status: statusOf(deployments, health),
    deployments:
      deployments === null
        ? null
        : observedView(deployments, ({ records, tags }) => {
            const current = currentDeployment(records);
            return { current: current === null ? null : deploymentView(current, tags), history: records.map((record) => deploymentView(record, tags)) };
          }),
    health,
    redeployable: !production && environment.redeploy !== null && environment.deployments.kind !== 'none',
    workflowUrl: environment.workflowUrl,
  };
}
