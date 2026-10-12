import { DEFAULT_ISSUE_TYPES } from '@agent-factory/domain';
import type { CockpitSnapshot, RunLogLine } from '../../contract/index.ts';
import { buildAudits, buildEnvironments, buildReleases, buildWorkflows } from './delivery.ts';
import { buildIssues } from './issues.ts';
import { buildCosts, buildHealth, buildKnowledge, buildResources, buildSettings } from './operations.ts';
import { buildPullRequests } from './pull-requests.ts';
import { buildRequests } from './requests.ts';
import type { LiveScript } from './runs.ts';
import { buildRuns } from './runs.ts';
import { fixtureClock, REPOSITORY } from './time.ts';

export const INITIAL_SEQUENCE = 1842;

export interface MockWorld {
  readonly snapshot: CockpitSnapshot;
  readonly logs: Map<string, RunLogLine[]>;
  readonly live: readonly LiveScript[];
}

export function buildWorld(now: number): MockWorld {
  const clock = fixtureClock(now);
  const { runs, logs, live } = buildRuns(clock);
  return {
    snapshot: {
      sequence: INITIAL_SEQUENCE,
      generatedAt: new Date(now).toISOString(),
      factory: {
        repository: REPOSITORY,
        defaultBranch: 'main',
        operator: 'Alex Morgan',
        schedulerPaused: false,
        issueTypes: DEFAULT_ISSUE_TYPES.map((type) => ({ id: type.id, label: type.label, proof: type.proof })),
      },
      requests: buildRequests(clock),
      issues: buildIssues(clock),
      runs,
      pullRequests: buildPullRequests(clock),
      workflows: buildWorkflows(clock),
      environments: buildEnvironments(clock),
      releases: buildReleases(clock),
      audits: buildAudits(clock),
      health: buildHealth(clock),
      costs: buildCosts(clock),
      knowledge: buildKnowledge(clock),
      settings: buildSettings(clock),
      resources: buildResources(clock),
    },
    logs,
    live,
  };
}
