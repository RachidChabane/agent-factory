import { screen, within } from '@testing-library/react';
import type { CockpitSnapshot, Deployment, EnvironmentView, ProjectView } from '../../contract/index.ts';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { LEDGER_ID, STOREFRONT_ID } from '../../test/fixtures/project-ids.ts';
import { fixtureClock } from '../../test/fixtures/time.ts';
import type { RenderedView, RenderOptions } from '../../test/render.tsx';
import { fixtureSnapshot, renderRoute, TEST_NOW } from '../../test/render.tsx';

export { LEDGER_ID as LEDGER, STOREFRONT_ID as STOREFRONT };

export const clock = fixtureClock(TEST_NOW);

export function deliveryPath(project: string): string {
  return `/projects/${project}/delivery`;
}

/** Renders the delivery page of a project and waits until it is drawn. */
export async function openDelivery(project: string = STOREFRONT_ID, options: Omit<RenderOptions, 'path'> = {}): Promise<RenderedView> {
  const view = await renderRoute(deliveryPath(project), options);
  await screen.findByRole('heading', { level: 1, name: options.locale === 'fr' ? 'Livraison' : 'Delivery' });
  return view;
}

/** The card of one environment, found by its name. */
export function environmentCard(name: string): HTMLElement {
  return screen.getByRole('article', { name });
}

/** A titled part of an environment card: "Deployments" or "Health". */
export function panelOf(card: HTMLElement, title: string): HTMLElement {
  return within(card).getByRole('group', { name: title });
}

export function withEnvironment(project: string, name: string, update: (environment: EnvironmentView) => EnvironmentView, snapshot: CockpitSnapshot = fixtureSnapshot()): CockpitSnapshot {
  return mapProject(snapshot, project, (current) => ({
    ...current,
    environments: current.environments.map((environment) => (environment.name === name ? update(environment) : environment)),
  }));
}

/** The snapshot with the current deployment of an environment, and its entry in the history, changed by `update`. */
export function withCurrentDeployment(project: string, name: string, update: (deployment: Deployment) => Deployment, snapshot: CockpitSnapshot = fixtureSnapshot()): CockpitSnapshot {
  return withEnvironment(
    project,
    name,
    (environment) => {
      const reading = environment.deployments;
      const history = reading?.value;
      if (reading === null || history === null || history === undefined || history.current === null) return environment;
      const currentId = history.current.id;
      const entries = history.history.map((deployment) => (deployment.id === currentId ? update(deployment) : deployment));
      return { ...environment, deployments: { ...reading, value: { ...history, current: update(history.current), history: entries } } };
    },
    snapshot,
  );
}

export function withWorkflows(project: string, workflows: ProjectView['workflows'], snapshot: CockpitSnapshot = fixtureSnapshot()): CockpitSnapshot {
  return mapProject(snapshot, project, (current) => ({ ...current, workflows }));
}
