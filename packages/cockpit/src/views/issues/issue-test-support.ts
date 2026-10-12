import { screen } from '@testing-library/react';
import type { CockpitSnapshot, IssueView } from '../../contract/index.ts';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { STOREFRONT_ID } from '../../test/fixtures/project-ids.ts';
import type { RenderedView, RenderOptions } from '../../test/render.tsx';
import { fixtureSnapshot, renderRoute } from '../../test/render.tsx';

export { LEDGER_ID as LEDGER, STOREFRONT_ID as STOREFRONT } from '../../test/fixtures/project-ids.ts';

export function issuesPath(project: string, issueNumber?: number | string): string {
  return `/projects/${project}/issues${issueNumber === undefined ? '' : `/${issueNumber}`}`;
}

/** Renders the page of one issue and waits until its detail is drawn. */
export async function openIssue(issueNumber: number, options: Omit<RenderOptions, 'path'> = {}, project: string = STOREFRONT_ID): Promise<RenderedView> {
  const view = await renderRoute(issuesPath(project, issueNumber), options);
  await screen.findByRole('link', { name: options.locale === 'fr' ? 'Toutes les issues' : 'All issues' });
  return view;
}

export function withIssue(project: string, issueNumber: number, update: (issue: IssueView) => IssueView, snapshot: CockpitSnapshot = fixtureSnapshot()): CockpitSnapshot {
  return mapProject(snapshot, project, (current) => ({
    ...current,
    issues: current.issues.map((issue) => (issue.number === issueNumber ? update(issue) : issue)),
  }));
}

/** The header of the page of an issue, found by the title of the issue. */
export function headerOf(title: string): HTMLElement {
  const header = screen.getByRole('heading', { level: 1, name: title }).closest('header');
  if (header === null) throw new Error(`the title "${title}" is not in a header`);
  return header;
}
