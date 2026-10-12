import type {
  AuditView,
  CockpitSnapshot,
  EnvironmentView,
  IssueView,
  PullRequestView,
  ReleaseView,
  RequestView,
} from '../../packages/cockpit/src/contract/index.ts';
import { issueTitled, projectOf, pullRequestOf, requestTitled } from './api.ts';

function required<Value>(value: Value | undefined, what: string): Value {
  if (value === undefined) throw new Error(`the snapshot has no ${what}`);
  return value;
}

/** The issue of the project with this exact title. */
export function issueNamed(state: CockpitSnapshot, project: string, title: string): IssueView {
  return required(issueTitled(state, project, title), `issue titled "${title}" of ${project}`);
}

/** The request of the project with this exact title. */
export function requestNamed(state: CockpitSnapshot, project: string, title: string): RequestView {
  return required(requestTitled(state, project, title), `request titled "${title}" of ${project}`);
}

/** The pull request the factory opened for the issue. */
export function pullRequestOfIssue(state: CockpitSnapshot, project: string, issue: IssueView): PullRequestView {
  return pullRequestOf(state, project, required(issue.pullRequestNumber ?? undefined, `pull request of issue #${issue.number}`));
}

export function releaseOf(state: CockpitSnapshot, project: string, id: string): ReleaseView {
  return required(projectOf(state, project).releases.find((release) => release.id === id), `release ${id} of ${project}`);
}

export function auditOf(state: CockpitSnapshot, project: string, id: string): AuditView {
  return required(projectOf(state, project).audits.find((audit) => audit.id === id), `audit ${id} of ${project}`);
}

/** The first of a list the spec knows is not empty. */
export function firstOf<Item>(items: readonly Item[], what: string): Item {
  return required(items[0], what);
}

export function environmentOf(state: CockpitSnapshot, project: string, name: string): EnvironmentView {
  return required(projectOf(state, project).environments.find((environment) => environment.name === name), `environment ${name} of ${project}`);
}
