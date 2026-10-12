import { screen } from '@testing-library/react';
import { expect } from 'vitest';
import { AppRoutes } from '../../app/AppRoutes.tsx';
import { SnapshotGate } from '../../app/SnapshotGate.tsx';
import type { CockpitSnapshot, RunView } from '../../contract/index.ts';
import { mapRuns } from '../../test/fixtures/mutate.ts';
import { renderInProviders } from '../../test/harness.tsx';
import type { RenderedView, RenderOptions } from '../../test/render.tsx';
import { fixtureSnapshot, renderRoute } from '../../test/render.tsx';

/** Renders the runs page at an address and waits until its list is drawn. */
export async function renderRuns(path = '/runs', options: Omit<RenderOptions, 'path'> = {}): Promise<RenderedView> {
  const view = await renderRoute(path, options);
  await screen.findByRole('region', { name: options.locale === 'fr' ? 'Liste des runs' : 'Run list' });
  return view;
}

/** Renders the runs page over run logs the test chooses, which the transport serves page by page. */
export async function openRunWithLogs(runId: string, runLogs: ReadonlyMap<string, unknown>, snapshot: CockpitSnapshot = fixtureSnapshot()): Promise<{ readonly view: RenderedView; readonly article: HTMLElement }> {
  const view = await renderInProviders(
    <SnapshotGate>
      <AppRoutes />
    </SnapshotGate>,
    { path: `/runs/${runId}`, snapshot, runLogs },
  );
  return { view, article: await screen.findByRole('article') };
}

/** Renders the page of one run and waits until its detail is drawn. */
export async function openRun(runId: string, options: Omit<RenderOptions, 'path'> = {}): Promise<{ readonly view: RenderedView; readonly article: HTMLElement }> {
  const view = await renderRuns(`/runs/${runId}`, options);
  return { view, article: await screen.findByRole('article') };
}

export function withRun(runId: string, update: (run: RunView) => RunView, snapshot: CockpitSnapshot = fixtureSnapshot()): CockpitSnapshot {
  return mapRuns(snapshot, (runs) => runs.map((run) => (run.id === runId ? update(run) : run)));
}

export function withRuns(update: (run: RunView) => RunView, snapshot: CockpitSnapshot = fixtureSnapshot()): CockpitSnapshot {
  return mapRuns(snapshot, (runs) => runs.map(update));
}

/** The link to a run among the links of a part of the page. */
export function linkToRun(container: HTMLElement, runId: string): HTMLElement {
  const link = [...container.querySelectorAll('a')].find((candidate) => candidate.getAttribute('href')?.startsWith(`/runs/${runId}`) === true);
  if (link === undefined) throw new Error(`no link to ${runId}`);
  return link;
}

const DOLLAR_AMOUNT = /^\$\d[\d,]*(\.\d+)?$/;
const BASIS_LABEL = /API-equivalent|Metered|Mixed/;

/** Every dollar figure of a part of the page sits next to the label of what it means. */
export function expectEveryAmountLabelled(container: HTMLElement): void {
  const amounts = [...container.querySelectorAll('*')].filter((element) => element.children.length === 0 && DOLLAR_AMOUNT.test(element.textContent?.trim() ?? ''));
  expect(amounts.length).toBeGreaterThan(0);
  for (const amount of amounts) expect(amount.parentElement?.textContent ?? '').toMatch(BASIS_LABEL);
}
