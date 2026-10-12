import type { CockpitSnapshot, RequestView } from '@agent-factory/cockpit';
import { ADMITTED_PRESSURE_LEVEL } from '@agent-factory/domain';
import { RUNNING_PIPELINE_STATES, type FactoryEventRecord } from '@agent-factory/application';
import { projectAudits } from './audit-views.ts';
import { projectCosts } from './cost-views.ts';
import { projectEnvironments } from './environment-views.ts';
import { indexEvents, iso } from './event-index.ts';
import { issueJournals, projectIssues } from './issue-views.ts';
import { activePauseCauses } from './pause-views.ts';
import { projectPullRequests } from './pull-request-views.ts';
import { projectReleases, releaseOfCommits } from './release-views.ts';
import { projectRequests } from './request-views.ts';
import { pendingQuestions, projectRuns, recordedRuns } from './run-views.ts';
import type { SnapshotContext } from './snapshot-context.ts';

export const HEALTH_SERIES_INTERVAL_MINUTES = 5;
const RESOURCES_CAUSE = 'resources';
const UNKNOWN_FREE_MEMORY = 0;

export function projectSnapshot(records: readonly FactoryEventRecord[], context: SnapshotContext): CockpitSnapshot {
  const index = indexEvents(records);
  const journals = issueJournals(index);
  const runs = recordedRuns(index);
  const requests: RequestView[] = projectRequests(index, context);
  const requestOfIssue = new Map(requests.flatMap((request) => request.issueNumbers.map((issueNumber) => [issueNumber, request.id] as const)));
  const pauses = activePauseCauses(index);
  const generatedAt = iso(context.generatedAt);
  const active = [...journals.values()].filter((journal) => journal.state !== null && RUNNING_PIPELINE_STATES.includes(journal.state)).length;
  const sample = context.resources.snapshot;
  return {
    sequence: index.lastSequence,
    generatedAt,
    factory: {
      repository: context.repository,
      defaultBranch: context.defaultBranch,
      operator: context.operator,
      schedulerPaused: pauses.size > 0,
      issueTypes: context.conventions.typology.definitions.map((type) => ({ id: type.id, label: type.label, proof: type.proof })),
    },
    requests,
    issues: projectIssues(index, journals, context, requestOfIssue),
    runs: projectRuns(runs, context, pendingQuestions(index, journals)),
    pullRequests: projectPullRequests(journals, index, context),
    workflows: [],
    environments: projectEnvironments(context.deployments),
    releases: projectReleases(index, journals, context),
    audits: projectAudits(index, releaseOfCommits(index)),
    health: { seriesIntervalMinutes: HEALTH_SERIES_INTERVAL_MINUTES, environments: [] },
    costs: projectCosts(runs, context),
    knowledge: {
      refreshedAt: generatedAt,
      productAreas: [],
      screens: [],
      decisions: [],
      sources: context.knowledgeSources.map((name) => ({ id: name, name, kind: 'documentation', location: name, refreshedAt: generatedAt })),
    },
    settings: {
      models: [...context.models],
      roles: [...context.roles],
      concurrency: { ceiling: context.concurrency.ceiling, maximum: context.concurrency.maximum, active },
      resourceGuard: { freeMemoryThresholdPercent: context.freeMemoryThresholdPercent, pauseAbovePressure: context.pauseAbovePressure },
      configuredTools: [...context.configuredTools],
      tools: [...context.tools],
    },
    resources: {
      freeMemoryPercent: sample?.freeMemoryPercent ?? UNKNOWN_FREE_MEMORY,
      pressure: sample?.pressure ?? ADMITTED_PRESSURE_LEVEL,
      thresholdPercent: context.freeMemoryThresholdPercent,
      schedulingPaused: pauses.has(RESOURCES_CAUSE),
      sampledAt: iso(context.resources.sampledAt),
    },
  };
}
