import type { ProjectView } from '../../contract/index.ts';
import { paths } from '../../model/routes.ts';

export type PullRequestTarget =
  | { readonly kind: 'internal'; readonly to: string }
  | { readonly kind: 'forge'; readonly href: string }
  | { readonly kind: 'unlinked' };

/**
 * Where the number of a pull request leads: to the page of the cockpit when the factory opened that
 * pull request, else to the page the forge gives it, else nowhere.
 */
export function pullRequestTarget(project: Pick<ProjectView, 'id' | 'pullRequests'>, number: number, forgeUrl: string | null): PullRequestTarget {
  if (project.pullRequests.some((pullRequest) => pullRequest.number === number)) return { kind: 'internal', to: paths.pullRequest(project.id, number) };
  return forgeUrl === null || forgeUrl.length === 0 ? { kind: 'unlinked' } : { kind: 'forge', href: forgeUrl };
}
