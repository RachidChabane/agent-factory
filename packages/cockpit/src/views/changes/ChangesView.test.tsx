import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { LEDGER_ID, STOREFRONT_ID } from '../../test/fixtures/project-ids.ts';
import { fixtureSnapshot, renderRoute, TEST_NOW } from '../../test/render.tsx';
import { HOUR_MS, MINUTE_MS } from '../../i18n/formatters.ts';
import { SEEN_STORAGE_KEY } from './changes-since.ts';

async function openChanges(path = '/', options: Parameters<typeof renderRoute>[1] = {}) {
  const view = await renderRoute(path, options);
  await screen.findByRole('heading', { level: 1, name: options.locale === 'fr' ? 'Changements' : 'Changes' });
  return view;
}

const projectSection = (name: string) => screen.getByRole('region', { name });
const laneOf = (project: string, name: string) => within(projectSection(project)).getByRole('region', { name: `Lane of ${name}` });

afterEach(() => {
  window.localStorage.clear();
});

describe('ChangesView', () => {
  it('is the landing page, and counts the changes from a day ago when they were never marked as seen', async () => {
    const view = await openChanges();
    await waitFor(() => expect(view.location()).toContain('since=2026-10-11T10%3A00%3A00.000Z'));
    expect(screen.getByText(/Everything that changed since/)).toBeInTheDocument();
    expect(screen.getByText('Never marked as seen')).toBeInTheDocument();
  });

  it('summarises the period: pull requests merged, what waits for the operator, deployments and failed ones', async () => {
    await openChanges('/?since=2026-09-01T00:00:00.000Z');
    const summary = screen.getByRole('group', { name: 'Summary of the period' });
    for (const label of ['Pull requests merged', 'Waiting for you', 'Deployments', 'Failed deployments']) expect(within(summary).getByText(label)).toBeInTheDocument();
    expect(within(summary).getByText('Waiting for you').nextElementSibling).toHaveTextContent('15');
  });

  it('says beside the deployment counts when the oldest reading they come from was made, in each language', async () => {
    const staging = new Date(TEST_NOW - 40 * MINUTE_MS).toISOString();
    await openChanges(`/?project=${STOREFRONT_ID}&since=2026-09-01T00:00:00.000Z`);
    const summary = screen.getByRole('group', { name: 'Summary of the period' });
    const stamps = within(summary).getAllByText(/^Read /);
    expect(stamps).toHaveLength(2);
    for (const stamp of stamps) expect(stamp).toHaveAttribute('datetime', staging);
    expect(within(summary).getByText('Pull requests merged').parentElement).not.toHaveTextContent(/Read /);
    expect(within(summary).getByText('Waiting for you').parentElement).not.toHaveTextContent(/Read /);
  });

  it('says beside the status of a lane when the health it comes from was sampled', async () => {
    await openChanges(`/?project=${STOREFRONT_ID}&since=2026-09-01T00:00:00.000Z`);
    expect(within(laneOf('Storefront', 'staging')).getByText(/^Sampled /)).toHaveAttribute('datetime', new Date(TEST_NOW - 30 * MINUTE_MS).toISOString());
    expect(within(laneOf('Storefront', 'production')).getByText(/^Sampled /)).toHaveAttribute('datetime', new Date(TEST_NOW - 4 * MINUTE_MS).toISOString());
  });

  it('says nothing of a sample for an environment none of whose checks was sampled', async () => {
    const snapshot = mapProject(fixtureSnapshot(), STOREFRONT_ID, (project) => ({
      ...project,
      environments: project.environments.map((environment) => ({ ...environment, health: environment.health.map((check) => ({ ...check, latest: null, series: [] })) })),
    }));
    await openChanges(`/?project=${STOREFRONT_ID}&since=2026-09-01T00:00:00.000Z`, { snapshot });
    expect(within(laneOf('Storefront', 'production')).queryByText(/^Sampled /)).not.toBeInTheDocument();
  });

  it('puts no reading beside the counts of a project whose environments declare no source', async () => {
    const snapshot = mapProject(fixtureSnapshot(), STOREFRONT_ID, (project) => ({ ...project, environments: project.environments.map((environment) => ({ ...environment, deployments: null })) }));
    await openChanges(`/?project=${STOREFRONT_ID}&since=2026-09-01T00:00:00.000Z`, { snapshot });
    expect(within(screen.getByRole('group', { name: 'Summary of the period' })).queryByText(/^Read /)).not.toBeInTheDocument();
  });

  it('lists what waits for the operator whatever the period, in every project', async () => {
    await openChanges('/?since=2026-10-12T09:59:00.000Z');
    const awaiting = screen.getByRole('region', { name: 'Waiting for you' });
    expect(within(awaiting).getAllByRole('link')).toHaveLength(15);
    expect(within(awaiting).getAllByText('Ledger').length).toBeGreaterThan(0);
    expect(within(awaiting).getAllByText('Storefront').length).toBeGreaterThan(0);
  });

  it('shows a section for each project, with its pull requests and one lane for each of its environments', async () => {
    await openChanges('/?since=2026-09-01T00:00:00.000Z');
    const storefront = projectSection('Storefront');
    expect(within(storefront).getByRole('region', { name: 'Pull requests of the period' })).toBeInTheDocument();
    for (const environment of ['development', 'staging', 'production']) expect(laneOf('Storefront', environment)).toBeInTheDocument();
    expect(within(projectSection('Ledger')).getByRole('region', { name: 'Lane of staging' })).toHaveTextContent('No deployment source configured');
    expect(within(projectSection('Ledger')).getByRole('region', { name: 'Lane of production' })).toHaveTextContent('Nothing deployed yet');
  });

  it('shows the commits a deployment brought, each deployment with the time its environment was read, and links the pull requests of the factory', async () => {
    await openChanges('/?since=2026-09-01T00:00:00.000Z');
    const staging = laneOf('Storefront', 'staging');
    expect(within(staging).getAllByText('fix(cart): round promo code discounts to the cent (#34)').length).toBeGreaterThan(0);
    expect(within(staging).getAllByRole('link', { name: 'fix(cart): round promo code discounts to the cent (#34)' })[0]).toHaveAttribute('href', '/projects/storefront/pull-requests/34');
    expect(within(staging).getByText(/The last read failed/)).toBeInTheDocument();
  });

  it('lists the commits waiting for an environment that not every merge reaches, and none for one that every merge reaches', async () => {
    await openChanges('/?since=2026-09-01T00:00:00.000Z');
    expect(within(laneOf('Storefront', 'staging')).getByRole('group', { name: 'Commits waiting for staging' })).toHaveTextContent('2 commits of main are not deployed here yet');
    expect(within(laneOf('Storefront', 'production')).getByRole('group', { name: 'Commits waiting for production' })).toHaveTextContent('5 commits of main are not deployed here yet');
    expect(within(laneOf('Storefront', 'development')).queryByRole('group', { name: /Commits waiting/ })).not.toBeInTheDocument();
  });

  it('keeps only what happened since the chosen moment', async () => {
    await openChanges(`/?since=${encodeURIComponent(new Date(TEST_NOW + HOUR_MS).toISOString())}`);
    expect(within(laneOf('Storefront', 'production')).getByText('No deployment during this period')).toBeInTheDocument();
    expect(within(projectSection('Storefront')).getByText('No pull request moved during this period')).toBeInTheDocument();
  });

  it('changes the period from the presets and keeps it in the address', async () => {
    const view = await openChanges('/?since=2026-10-11T10:00:00.000Z');
    expect(screen.getByRole('radio', { name: '24 h' })).toBeChecked();
    await view.user.click(screen.getByRole('radio', { name: '7 days' }));
    await view.expectLocation('/?since=2026-10-05T10%3A00%3A00.000Z');
    expect(screen.getByRole('radio', { name: '7 days' })).toBeChecked();
  });

  it('keeps the moment the operator marks as seen in the browser and starts from it next time', async () => {
    const view = await openChanges();
    await view.user.click(screen.getByRole('button', { name: 'Mark as seen' }));
    expect(await screen.findByText('Marked as seen')).toBeInTheDocument();
    expect(window.localStorage.getItem(SEEN_STORAGE_KEY)).toBe(new Date(TEST_NOW).toISOString());
    expect(screen.getByText(/Last seen:/)).toBeInTheDocument();
  });

  it('starts from the moment last seen in this browser when the address names none', async () => {
    window.localStorage.setItem(SEEN_STORAGE_KEY, '2026-10-10T08:00:00.000Z');
    const view = await openChanges();
    await waitFor(() => expect(view.location()).toContain('since=2026-10-10T08%3A00%3A00.000Z'));
  });

  it('tells the operator when the browser would not remember what was seen', async () => {
    const view = await openChanges();
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    try {
      await view.user.click(screen.getByRole('button', { name: 'Mark as seen' }));
      expect(await screen.findByText('This browser would not remember it')).toBeInTheDocument();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it('shows one project when the address names it', async () => {
    await openChanges(`/?project=${LEDGER_ID}&since=2026-09-01T00:00:00.000Z`);
    expect(screen.getByRole('region', { name: 'Ledger' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Storefront' })).not.toBeInTheDocument();
  });

  it('says that a project with no environment and no pull request moved has nothing to show', async () => {
    const snapshot = mapProject(fixtureSnapshot(), STOREFRONT_ID, (project) => ({ ...project, environments: [], pullRequests: [] }));
    await openChanges('/?since=2026-09-01T00:00:00.000Z', { snapshot });
    expect(screen.getByText('Nothing changed in Storefront during this period.')).toBeInTheDocument();
  });

  it('is written in French on a French page', async () => {
    await openChanges('/?since=2026-09-01T00:00:00.000Z', { locale: 'fr' });
    expect(within(screen.getByRole('group', { name: 'Synthèse de la période' })).getAllByText(/^Relevé /)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Marquer comme vu' })).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: 'Voie de staging' }).length).toBeGreaterThan(0);
  });
});
