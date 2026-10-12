import type { Deployment, EnvironmentView } from '@agent-factory/cockpit';
import { DEPLOYMENT_ENVIRONMENTS, SHORT_SHA_LENGTH, type DeploymentEnvironment } from '@agent-factory/domain';
import { currentDeployment, type DeploymentRecord, type DeploymentState } from '@agent-factory/application';
import { iso } from './event-index.ts';

export interface EnvironmentDeployments {
  readonly targetName: string;
  readonly url: string | null;
  readonly records: readonly DeploymentRecord[];
  readonly tags: ReadonlySet<string>;
}

const UNKNOWN_ACTOR = 'unknown';
const NO_URL = '';
const OUTCOME_OF: Readonly<Record<DeploymentState, Deployment['outcome']>> = {
  success: 'success',
  inactive: 'success',
  failure: 'failure',
  'in-progress': 'in-progress',
};
const STATUS_OF: Readonly<Record<DeploymentState, EnvironmentView['status']>> = {
  success: 'healthy',
  inactive: 'healthy',
  failure: 'down',
  'in-progress': 'deploying',
};
const UNKNOWN_STATUS: EnvironmentView['status'] = 'degraded';

function deploymentView(record: DeploymentRecord, tags: ReadonlySet<string>): Deployment {
  return {
    id: record.id,
    version: tags.has(record.ref) ? record.ref : record.sha.slice(0, SHORT_SHA_LENGTH),
    sha: record.sha,
    deployedAt: iso(record.createdAt),
    actor: record.creator ?? UNKNOWN_ACTOR,
    outcome: OUTCOME_OF[record.state],
    workflowUrl: record.logUrl ?? NO_URL,
  };
}

function environmentView(name: DeploymentEnvironment, deployments: EnvironmentDeployments): EnvironmentView {
  const current = currentDeployment(deployments.records);
  const newest = deployments.records[0];
  return {
    name,
    url: deployments.url ?? current?.environmentUrl ?? NO_URL,
    status: newest === undefined ? UNKNOWN_STATUS : STATUS_OF[newest.state],
    current: current === null ? null : deploymentView(current, deployments.tags),
    history: deployments.records.map((record) => deploymentView(record, deployments.tags)),
  };
}

export function projectEnvironments(deployments: ReadonlyMap<DeploymentEnvironment, EnvironmentDeployments>): EnvironmentView[] {
  return DEPLOYMENT_ENVIRONMENTS.flatMap((name) => {
    const recorded = deployments.get(name);
    return recorded === undefined ? [] : [environmentView(name, recorded)];
  });
}
