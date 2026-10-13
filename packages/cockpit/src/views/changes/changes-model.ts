import type { DeliveredCommit, Deployment, EnvironmentView, IssueView, ProjectView, PullRequestView } from '../../contract/index.ts';
import { toEpoch } from '../../i18n/formatters.ts';
import { paths } from '../../model/routes.ts';

export const PULL_REQUEST_EVENT_KINDS = ['opened', 'updated', 'merged', 'closed'] as const;
export type PullRequestEventKind = (typeof PULL_REQUEST_EVENT_KINDS)[number];

const FIRST_REVIEW_ROUND = 1;
const AUTOMATIC_PROMOTION: EnvironmentView['promotion'] = 'automatic';
const FAILED_OUTCOME: Deployment['outcome'] = 'failure';

export interface PullRequestEvent {
  readonly kind: PullRequestEventKind;
  readonly at: string;
}

export interface ChangedPullRequest {
  readonly number: number;
  readonly title: string;
  readonly issueNumber: number;
  readonly typeLabel: string;
  readonly state: PullRequestView['state'];
  readonly hasFilms: boolean;
  /** What happened to it since the reference, newest first. */
  readonly events: readonly PullRequestEvent[];
  readonly lastEventAt: string;
  readonly detailPath: string;
}

/** A deployment, with the redeployments of the same commit that ended the same way folded into it. */
export interface ChangedDeployment {
  readonly id: string;
  readonly version: string;
  readonly sha: string;
  readonly deployedAt: string;
  readonly actor: string | null;
  readonly outcome: Deployment['outcome'];
  readonly workflowUrl: string | null;
  readonly occurrences: number;
  readonly changes: readonly DeliveredCommit[] | null;
}

export interface EnvironmentLane {
  readonly name: string;
  readonly production: boolean;
  readonly promotion: EnvironmentView['promotion'];
  readonly status: EnvironmentView['status'];
  /** When the health the status comes from was sampled: the oldest of the latest samples of its checks; null when no check was sampled. */
  readonly statusSampledAt: string | null;
  /** What the environment holds now, whatever the reference. */
  readonly current: Deployment | null;
  /** The deployments since the reference, newest first. */
  readonly deployments: readonly ChangedDeployment[];
  /** Whether commits can wait for this environment: one that every merge reaches has none waiting. */
  readonly pendingApplies: boolean;
  /** The commits of the base branch the environment lacks; null when the clone cannot say or nothing is deployed. */
  readonly pending: readonly DeliveredCommit[] | null;
  /** The source of the deployments: null when the project declares none, else the reading with the time it was made. */
  readonly reading: EnvironmentView['deployments'];
}

export interface ProjectChanges {
  readonly id: string;
  readonly name: string;
  readonly pullRequests: readonly ChangedPullRequest[];
  readonly lanes: readonly EnvironmentLane[];
}

/**
 * When the deployments counted were read: the oldest of the readings of the environments that declare a source, which is
 * `null` when one of them was never read; or that no environment declares a source, so that nothing was read.
 */
export type DeploymentsRead = { readonly kind: 'none' } | { readonly kind: 'read'; readonly readAt: string | null };

export interface ChangesSummary {
  readonly mergedPullRequests: number;
  readonly deployments: number;
  readonly failedDeployments: number;
  readonly deploymentsRead: DeploymentsRead;
}

export interface Changes {
  readonly since: number;
  readonly projects: readonly ProjectChanges[];
  readonly summary: ChangesSummary;
}

function isSince(at: string, since: number): boolean {
  return toEpoch(at) >= since;
}

function newestFirst<T>(timeOf: (item: T) => string): (left: T, right: T) => number {
  return (left, right) => toEpoch(timeOf(right)) - toEpoch(timeOf(left));
}

function pullRequestEvents(pullRequest: PullRequestView, issue: IssueView | undefined): PullRequestEvent[] {
  const events: PullRequestEvent[] = [{ kind: 'opened', at: pullRequest.openedAt }];
  for (const round of pullRequest.reviewRounds) {
    if (round.round > FIRST_REVIEW_ROUND) events.push({ kind: 'updated', at: round.completedAt });
  }
  if (pullRequest.mergedAt !== null) events.push({ kind: 'merged', at: pullRequest.mergedAt });
  if (pullRequest.state === 'closed' && issue !== undefined) events.push({ kind: 'closed', at: issue.updatedAt });
  return events;
}

function changedPullRequests(project: ProjectView, since: number): ChangedPullRequest[] {
  const issues = new Map(project.issues.map((issue) => [issue.number, issue]));
  const typeLabels = new Map(project.issueTypes.map((type) => [type.id, type.label]));
  return project.pullRequests
    .flatMap((pullRequest) => {
      const events = pullRequestEvents(pullRequest, issues.get(pullRequest.issueNumber))
        .filter((event) => isSince(event.at, since))
        .sort(newestFirst((event) => event.at));
      const [latest] = events;
      if (latest === undefined) return [];
      return [
        {
          number: pullRequest.number,
          title: pullRequest.title,
          issueNumber: pullRequest.issueNumber,
          typeLabel: typeLabels.get(pullRequest.type) ?? pullRequest.type,
          state: pullRequest.state,
          hasFilms: pullRequest.films.length > 0,
          events,
          lastEventAt: latest.at,
          detailPath: paths.pullRequest(project.id, pullRequest.number),
        },
      ];
    })
    .sort(newestFirst((pullRequest) => pullRequest.lastEventAt));
}

interface RedeploymentGroup {
  readonly newest: Deployment;
  readonly members: readonly Deployment[];
}

function groupRedeployments(deployments: readonly Deployment[]): RedeploymentGroup[] {
  const groups: { newest: Deployment; members: Deployment[] }[] = [];
  for (const deployment of deployments) {
    const group = groups.at(-1);
    if (group !== undefined && group.newest.sha === deployment.sha && group.newest.outcome === deployment.outcome) group.members.push(deployment);
    else groups.push({ newest: deployment, members: [deployment] });
  }
  return groups;
}

function changedDeployment({ newest, members }: RedeploymentGroup): ChangedDeployment {
  const delivered = members.find((deployment) => deployment.changes !== null && deployment.changes.length > 0)?.changes ?? newest.changes;
  return {
    id: newest.id,
    version: newest.version,
    sha: newest.sha,
    deployedAt: newest.deployedAt,
    actor: newest.actor,
    outcome: newest.outcome,
    workflowUrl: newest.workflowUrl,
    occurrences: members.length,
    changes: delivered,
  };
}

function oldestSample(environment: EnvironmentView): string | null {
  const sampled = environment.health.flatMap((check) => (check.latest === null ? [] : [check.latest.at]));
  return sampled.toSorted((left, right) => toEpoch(left) - toEpoch(right))[0] ?? null;
}

function lane(environment: EnvironmentView, since: number): EnvironmentLane {
  const read = environment.deployments?.value ?? null;
  const pendingApplies = environment.promotion !== AUTOMATIC_PROMOTION;
  return {
    name: environment.name,
    production: environment.production,
    promotion: environment.promotion,
    status: environment.status,
    statusSampledAt: oldestSample(environment),
    current: read?.current ?? null,
    deployments: groupRedeployments((read?.history ?? []).filter((deployment) => isSince(deployment.deployedAt, since))).map(changedDeployment),
    pendingApplies,
    pending: pendingApplies ? (read?.pending ?? null) : null,
    reading: environment.deployments,
  };
}

function oldestReading(lanes: readonly EnvironmentLane[]): DeploymentsRead {
  const readings = lanes.flatMap((entry) => (entry.reading === null ? [] : [entry.reading]));
  if (readings.length === 0) return { kind: 'none' };
  const times = readings.map((reading) => reading.readAt);
  const known = times.filter((readAt) => readAt !== null);
  if (known.length < times.length) return { kind: 'read', readAt: null };
  return { kind: 'read', readAt: known.toSorted((left, right) => toEpoch(left) - toEpoch(right))[0] ?? null };
}

function summarise(projects: readonly ProjectChanges[]): ChangesSummary {
  const lanes = projects.flatMap((project) => project.lanes);
  return {
    mergedPullRequests: projects.flatMap((project) => project.pullRequests).filter((pullRequest) => pullRequest.events.some((event) => event.kind === 'merged')).length,
    deployments: lanes.reduce((total, entry) => total + entry.deployments.reduce((sum, deployment) => sum + deployment.occurrences, 0), 0),
    failedDeployments: lanes.reduce(
      (total, entry) => total + entry.deployments.filter((deployment) => deployment.outcome === FAILED_OUTCOME).reduce((sum, deployment) => sum + deployment.occurrences, 0),
      0,
    ),
    deploymentsRead: oldestReading(lanes),
  };
}

/** What changed in the projects since an instant: their pull requests, and the deployments of each of their environments. */
export function buildChanges(projects: readonly ProjectView[], since: number): Changes {
  const changes = projects.map((project) => ({
    id: project.id,
    name: project.name,
    pullRequests: changedPullRequests(project, since),
    lanes: project.environments.map((environment) => lane(environment, since)),
  }));
  return { since, projects: changes, summary: summarise(changes) };
}

/** Whether a project has nothing to show for the period: no pull request moved, no deployment and no commit waiting. */
export function isQuiet(project: ProjectChanges): boolean {
  return project.pullRequests.length === 0 && project.lanes.every((entry) => entry.deployments.length === 0 && (entry.pending?.length ?? 0) === 0);
}
