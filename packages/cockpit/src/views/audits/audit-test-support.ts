import { screen } from '@testing-library/react';
import type { AuditView, CockpitSnapshot, ProjectView } from '../../contract/index.ts';
import { DIRECT_PUSH_SHA as LEDGER_DIRECT_PUSH_SHA, SKIP_ZERO_LINES_SHA } from '../../test/fixtures/ledger/ids.ts';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { LEDGER_ID, STOREFRONT_ID } from '../../test/fixtures/project-ids.ts';
import { DIRECT_PUSH_SHA, mergeSha, OUTSIDE_PULL_REQUEST, PULL_REQUEST } from '../../test/fixtures/storefront/ids.ts';
import { fixtureClock } from '../../test/fixtures/time.ts';
import type { RenderedView, RenderOptions } from '../../test/render.tsx';
import { fixtureSnapshot, renderRoute, TEST_NOW } from '../../test/render.tsx';

export { LEDGER_ID as LEDGER, STOREFRONT_ID as STOREFRONT };

/** The instants a number of minutes or hours before the moment every test is set at, as the factory writes them. */
export const { hoursAgo, minutesAgo } = fixtureClock(TEST_NOW);

/** The audits of the fixture world, by what each one is about. */
export const AUDIT = {
  /** Being audited, one audit run failed, in release 1.8.2. */
  doubleSubmit: DIRECT_PUSH_SHA,
  /** Detected, its files not read yet, authored by a bot. */
  lockfile: mergeSha(OUTSIDE_PULL_REQUEST.lockfileRefresh),
  /** Kept, with no finding. */
  footerLinks: mergeSha(OUTSIDE_PULL_REQUEST.footerLinks),
  /** A challenge nobody has resolved, with three findings and a drafted issue. */
  promoBanner: mergeSha(OUTSIDE_PULL_REQUEST.promoBannerCopy),
  /** A rewrite that is resolved and whose issue is published. */
  httpClient: mergeSha(PULL_REQUEST.httpClientBump),
  /** Asked for by the operator on a change the docs automation made. */
  apiReference: mergeSha(OUTSIDE_PULL_REQUEST.apiReferenceResync),
  ledgerRewrite: SKIP_ZERO_LINES_SHA,
  ledgerKept: LEDGER_DIRECT_PUSH_SHA,
} as const;

/** The changes of other automations that the storefront records without an audit. */
export const SKIPPED = {
  docsResync: mergeSha(OUTSIDE_PULL_REQUEST.apiReferenceResync),
  viteBump: mergeSha(OUTSIDE_PULL_REQUEST.viteBump),
  zodBump: mergeSha(OUTSIDE_PULL_REQUEST.zodBump),
  docsSync: mergeSha(OUTSIDE_PULL_REQUEST.apiReferenceSync),
  routerBump: mergeSha(OUTSIDE_PULL_REQUEST.routerBump),
} as const;

export function auditsPath(project: string, auditId?: string): string {
  return `/projects/${project}/audits${auditId === undefined ? '' : `/${auditId}`}`;
}

/** Renders the page of one audit and waits until its detail is drawn. */
export async function openAudit(auditId: string, options: Omit<RenderOptions, 'path'> = {}, project: string = STOREFRONT_ID): Promise<RenderedView> {
  const view = await renderRoute(auditsPath(project, auditId), options);
  await screen.findByRole('link', { name: options.locale === 'fr' ? 'Tous les audits' : 'All audits' });
  return view;
}

export function withAudit(project: string, auditId: string, update: (audit: AuditView) => AuditView, snapshot: CockpitSnapshot = fixtureSnapshot()): CockpitSnapshot {
  return mapProject(snapshot, project, (current) => ({ ...current, audits: current.audits.map((audit) => (audit.id === auditId ? update(audit) : audit)) }));
}

export function withProject(project: string, update: (view: ProjectView) => ProjectView, snapshot: CockpitSnapshot = fixtureSnapshot()): CockpitSnapshot {
  return mapProject(snapshot, project, update);
}

/** The short form of a full commit hash, as the cockpit writes it. */
export function short(sha: string): string {
  return sha.slice(0, 7);
}
