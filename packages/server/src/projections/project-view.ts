import type { KnowledgeSourceView, ProjectView, ReferenceView, RequestView, ToolView } from '@agent-factory/cockpit';
import { healthSamplesSince, type CheckedTool, type FactoryEventRecord } from '@agent-factory/application';
import type { ToolName } from '@agent-factory/domain';
import type { ProjectConfig } from '../config/agent-factory-config.ts';
import type { Observed } from '../snapshot/cached-reading.ts';
import { projectAudits, projectSkippedChanges } from './audit-views.ts';
import { delegatedDecisionViews } from './autonomy-views.ts';
import { environmentView, type EnvironmentDeployments, type MergedPullRequests } from './environment-views.ts';
import { indexEvents } from './event-index.ts';
import { filmToolWaitView } from './film-views.ts';
import { pauseViews, projectSettingsView, schedulerView } from './installation-views.ts';
import { issueJournals, projectIssues } from './issue-views.ts';
import { projectPullRequests } from './pull-request-views.ts';
import { projectReleases, releaseOfCommits } from './release-views.ts';
import { projectRequests } from './request-views.ts';
import { pendingQuestions, type PendingQuestion } from './run-views.ts';
import type { ProjectSnapshotContext } from './snapshot-context.ts';

/** How far back the health series of an environment goes. */
export const HEALTH_SERIES_WINDOW_MS = 24 * 60 * 60_000;

/** What a project's view shows besides its events, read from its forge, files and tools. */
export interface ProjectReadingsView {
  readonly forgeUrl: string | null;
  readonly workflows: ProjectView['workflows'];
  readonly deployments: (target: string) => Observed<EnvironmentDeployments> | null;
  readonly knowledge: KnowledgeSourceView[];
  readonly references: ReferenceView[];
  readonly tools: ToolView[];
  /** The latest check of each tool the installation declares, which the films of a project may wait for. */
  readonly installationToolChecks: ReadonlyMap<ToolName, CheckedTool>;
}

export interface ProjectViewProjection {
  readonly view: ProjectView;
  readonly questions: ReadonlyMap<string, PendingQuestion>;
}

/** The pull requests of the factory that were squash-merged, by the sha of the commit that merged them. */
function mergedPullRequests(journals: ReturnType<typeof issueJournals>): MergedPullRequests {
  return new Map(
    [...journals.values()].flatMap((journal) =>
      journal.mergeSha === null || journal.pullRequest === null ? [] : [[journal.mergeSha, { pullRequestNumber: journal.pullRequest.number, issueNumber: journal.issueNumber }] as const],
    ),
  );
}

/** The cockpit's view of one project, from its own events (with the subjects it sees) and its readings. */
export function projectView(project: ProjectConfig, records: readonly FactoryEventRecord[], context: ProjectSnapshotContext, readings: ProjectReadingsView): ProjectViewProjection {
  const index = indexEvents(records);
  const journals = issueJournals(index);
  const requests: RequestView[] = projectRequests(index, context);
  const requestOfIssue = new Map(requests.flatMap((request) => request.issueNumbers.map((issueNumber) => [issueNumber, request.id] as const)));
  const merged = mergedPullRequests(journals);
  const healthSamples = healthSamplesSince(records, new Date(context.generatedAt.getTime() - HEALTH_SERIES_WINDOW_MS));
  const view: ProjectView = {
    id: project.id,
    name: project.name,
    repository: `${project.repository.owner}/${project.repository.name}`,
    forge: { kind: project.forge.kind, url: readings.forgeUrl },
    baseBranch: project.baseBranch,
    pauses: pauseViews(records, 'project'),
    scheduler: schedulerView(records),
    filmToolWait: filmToolWaitView(records, (project.evidence.films?.tools.length ?? 0) > 0, readings.installationToolChecks),
    issueTypes: project.issueTypes.map((type) => ({
      id: type.id,
      label: type.label,
      proof: type.proof,
      checks: type.checks,
      commitType: type.commit.type,
      commitScope: type.commit.scope,
    })),
    requests,
    issues: projectIssues(index, journals, context, requestOfIssue),
    pullRequests: projectPullRequests(journals, index, context),
    workflows: readings.workflows,
    environments: project.delivery.environments.map((environment) =>
      environmentView(
        environment,
        environment.deployments.kind === 'github' ? readings.deployments(environment.deployments.environment) : null,
        healthSamples.get(environment.name) ?? new Map(),
        merged,
      ),
    ),
    releases: projectReleases(index, journals, context),
    audits: projectAudits(index, releaseOfCommits(index), context),
    skippedChanges: projectSkippedChanges(index, context),
    knowledge: readings.knowledge,
    references: readings.references,
    tools: readings.tools,
    settings: projectSettingsView(project),
    delegatedDecisions: delegatedDecisionViews(records),
  };
  return { view, questions: pendingQuestions(index, journals) };
}
