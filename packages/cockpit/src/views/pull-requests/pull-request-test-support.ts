import { screen } from '@testing-library/react';
import type { CockpitSnapshot, PullRequestView } from '../../contract/index.ts';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { LEDGER_ID, STOREFRONT_ID } from '../../test/fixtures/project-ids.ts';
import { fixtureClock } from '../../test/fixtures/time.ts';
import type { RenderedView, RenderOptions } from '../../test/render.tsx';
import { fixtureSnapshot, renderRoute, TEST_NOW } from '../../test/render.tsx';

export { LEDGER_ID as LEDGER, STOREFRONT_ID as STOREFRONT };

export const SEARCH_TITLE = 'feat(search): understand colour and price words in the product search';

/** The instant a number of minutes before the moment every test is set at, as the factory writes it. */
export const { minutesAgo } = fixtureClock(TEST_NOW);

export function pullRequestsPath(project: string, number?: number, query = ''): string {
  return `/projects/${project}/pull-requests${number === undefined ? '' : `/${number}`}${query}`;
}

/** Renders the page of one pull request and waits until its detail is drawn. */
export async function openPullRequest(number: number, options: Omit<RenderOptions, 'path'> = {}, project: string = STOREFRONT_ID, query = ''): Promise<RenderedView> {
  const view = await renderRoute(pullRequestsPath(project, number, query), options);
  await screen.findByRole('link', { name: options.locale === 'fr' ? 'Toutes les pull requests' : 'All pull requests' });
  return view;
}

export function withPullRequest(project: string, number: number, update: (pullRequest: PullRequestView) => PullRequestView, snapshot: CockpitSnapshot = fixtureSnapshot()): CockpitSnapshot {
  return mapProject(snapshot, project, (current) => ({
    ...current,
    pullRequests: current.pullRequests.map((pullRequest) => (pullRequest.number === number ? update(pullRequest) : pullRequest)),
  }));
}

/** The short form of a full commit hash, as the cockpit writes it. */
export function short(sha: string): string {
  return sha.slice(0, 7);
}
