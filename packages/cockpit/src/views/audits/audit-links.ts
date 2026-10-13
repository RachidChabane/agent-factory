import type { ProjectView } from '../../contract/index.ts';
import { paths } from '../../model/routes.ts';

/** Where the number of an item leads: a page of the cockpit, a page of the forge, or nowhere. */
export type LinkTarget =
  | { readonly kind: 'internal'; readonly to: string }
  | { readonly kind: 'forge'; readonly href: string }
  | { readonly kind: 'unlinked' };

export type PullRequestTarget = LinkTarget;
export type IssueTarget = LinkTarget;

function forgeTarget(forgeUrl: string | null): LinkTarget {
  return forgeUrl === null || forgeUrl.length === 0 ? { kind: 'unlinked' } : { kind: 'forge', href: forgeUrl };
}

/**
 * Where the number of a pull request leads: to the page of the cockpit when the factory opened that
 * pull request, else to the page the forge gives it, else nowhere.
 */
export function pullRequestTarget(project: Pick<ProjectView, 'id' | 'pullRequests'>, number: number, forgeUrl: string | null): PullRequestTarget {
  if (project.pullRequests.some((pullRequest) => pullRequest.number === number)) return { kind: 'internal', to: paths.pullRequest(project.id, number) };
  return forgeTarget(forgeUrl);
}

/**
 * Where the number of an issue published from an audit leads: to the page of the cockpit when the factory lists that
 * issue, which it does not for an issue that is no factory spec, else to the page the forge gives it, else nowhere.
 */
export function publishedIssueTarget(project: Pick<ProjectView, 'id' | 'issues'>, number: number, forgeUrl: string | null): IssueTarget {
  if (project.issues.some((issue) => issue.number === number)) return { kind: 'internal', to: paths.issue(project.id, number) };
  return forgeTarget(forgeUrl);
}
