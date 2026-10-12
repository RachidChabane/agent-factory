import { screen } from '@testing-library/react';
import type { ChallengeReport, CockpitSnapshot, ProposedSpec, RequestView } from '../../contract/index.ts';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { STOREFRONT_ID } from '../../test/fixtures/project-ids.ts';
import type { RenderedView, RenderOptions } from '../../test/render.tsx';
import { fixtureSnapshot, renderRoute } from '../../test/render.tsx';

export { LEDGER_ID as LEDGER, STOREFRONT_ID as STOREFRONT } from '../../test/fixtures/project-ids.ts';

export function requestsPath(project: string, requestId?: string): string {
  return `/projects/${project}/requests${requestId === undefined ? '' : `/${requestId}`}`;
}

/** Renders the page of one request and waits until its detail is drawn. */
export async function openRequest(requestId: string, options: Omit<RenderOptions, 'path'> = {}, project: string = STOREFRONT_ID): Promise<RenderedView> {
  const view = await renderRoute(requestsPath(project, requestId), options);
  await screen.findByRole('link', { name: options.locale === 'fr' ? 'Toutes les demandes' : 'All requests' });
  return view;
}

export function withRequest(project: string, requestId: string, update: (request: RequestView) => RequestView, snapshot: CockpitSnapshot = fixtureSnapshot()): CockpitSnapshot {
  return mapProject(snapshot, project, (current) => ({
    ...current,
    requests: current.requests.map((request) => (request.id === requestId ? update(request) : request)),
  }));
}

export function withReport(project: string, requestId: string, update: (report: ChallengeReport) => ChallengeReport, snapshot: CockpitSnapshot = fixtureSnapshot()): CockpitSnapshot {
  return withRequest(
    project,
    requestId,
    (request) => {
      if (request.challenge === null) throw new Error(`request ${requestId} has no challenge report`);
      return { ...request, challenge: update(request.challenge) };
    },
    snapshot,
  );
}

export function withSpec(project: string, requestId: string, specId: string, update: (spec: ProposedSpec) => ProposedSpec, snapshot: CockpitSnapshot = fixtureSnapshot()): CockpitSnapshot {
  return withReport(project, requestId, (report) => ({ ...report, specs: report.specs.map((spec) => (spec.id === specId ? update(spec) : spec)) }), snapshot);
}
