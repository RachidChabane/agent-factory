import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import type { CockpitSnapshot, CostsView, InstallationSettingsView, ProjectSettingsView } from '../../contract/index.ts';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { LEDGER_ID, STOREFRONT_ID } from '../../test/fixtures/project-ids.ts';
import type { RenderedView, RenderOptions } from '../../test/render.tsx';
import { fixtureSnapshot, renderRoute } from '../../test/render.tsx';

export { LEDGER_ID as LEDGER, STOREFRONT_ID as STOREFRONT };

type Options = Omit<RenderOptions, 'path'>;

/** Renders the settings page of a project and waits until it is drawn. */
export async function openProjectSettings(project: string = STOREFRONT_ID, options: Options = {}): Promise<RenderedView> {
  const view = await renderRoute(`/projects/${project}/settings`, options);
  await screen.findByRole('heading', { level: 1, name: options.locale === 'fr' ? 'Réglages du projet' : 'Project settings' });
  return view;
}

/** Renders the settings page of the installation and waits until it is drawn. */
export async function openInstallationSettings(options: Options = {}): Promise<RenderedView> {
  const view = await renderRoute('/settings', options);
  await screen.findByRole('heading', { level: 1, name: options.locale === 'fr' ? 'Réglages' : 'Settings' });
  return view;
}

/** The form of a role, named after the role. */
export function roleForm(name: string): HTMLElement {
  return screen.getByRole('form', { name });
}

export function withProjectSettings(project: string, update: (settings: ProjectSettingsView) => ProjectSettingsView, snapshot: CockpitSnapshot = fixtureSnapshot()): CockpitSnapshot {
  return mapProject(snapshot, project, (current) => ({ ...current, settings: update(current.settings) }));
}

export function withInstallationSettings(update: (settings: InstallationSettingsView) => InstallationSettingsView, snapshot: CockpitSnapshot = fixtureSnapshot()): CockpitSnapshot {
  return { ...snapshot, settings: update(snapshot.settings) };
}

export function withCosts(update: (costs: CostsView) => CostsView, snapshot: CockpitSnapshot = fixtureSnapshot()): CockpitSnapshot {
  return { ...snapshot, costs: update(snapshot.costs) };
}

/** Replaces what a field holds by a text; an empty text leaves the field empty. */
export async function replaceText(user: UserEvent, field: HTMLElement, text: string): Promise<void> {
  await user.clear(field);
  if (text !== '') await user.type(field, text);
}

/** The controls of the form of one role. */
export function roleFields(name: string) {
  const form = roleForm(name);
  return {
    form,
    model: within(form).getByLabelText('Model'),
    effort: within(form).getByLabelText('Effort'),
    budget: within(form).getByLabelText('Max budget (USD)'),
    turns: within(form).getByLabelText('Max turns'),
    save: within(form).getByRole('button', { name: `Save ${name}` }),
  };
}
