import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mapProject } from '../test/fixtures/mutate.ts';
import { fixtureSnapshot, renderApp } from '../test/render.tsx';

describe('NotificationCenter', () => {
  it('counts what waits for the operator across every project', async () => {
    await renderApp('/');
    const bell = screen.getByRole('button', { name: 'Notifications: 15 items need you' });
    expect(bell).toHaveTextContent('15');
  });

  it('lists each item with the action it asks for, its project and its age, most urgent first', async () => {
    const view = await renderApp('/');
    await view.user.click(screen.getByRole('button', { name: 'Notifications: 15 items need you' }));
    const popover = await screen.findByRole('dialog', { name: 'Needs you' });
    const items = within(popover).getAllByRole('link').filter((link) => link.className.includes('notifications__item'));
    expect(items).toHaveLength(15);
    expect(items[0]).toHaveTextContent('Your decision is needed');
    expect(items[0]).toHaveTextContent('Storefront');
    expect(items[0]).toHaveAttribute('href', '/projects/storefront/issues/49');
    const mergeLinks = items.filter((link) => link.textContent?.includes('Merge to order'));
    expect(mergeLinks.map((link) => link.getAttribute('href')).toSorted()).toEqual(['/projects/ledger/pull-requests/22?merge=1', '/projects/storefront/pull-requests/57?merge=1']);
    expect(items.filter((link) => link.textContent?.includes('Ledger'))).toHaveLength(5);
  });

  it('links an agent question to the run that asks it', async () => {
    const view = await renderApp('/');
    await view.user.click(screen.getByRole('button', { name: /^Notifications/ }));
    const popover = await screen.findByRole('dialog', { name: 'Needs you' });
    expect(within(popover).getByRole('link', { name: /Agent question/ })).toHaveAttribute('href', '/runs/run_5d0911');
  });

  it('opens the confirmation of the merge when a merge to order is followed, and sends nothing before the operator confirms', async () => {
    const view = await renderApp('/');
    await view.user.click(screen.getByRole('button', { name: /^Notifications/ }));
    const popover = await screen.findByRole('dialog', { name: 'Needs you' });
    await view.user.click(within(popover).getByRole('link', { name: /Merge to order.*understand colour and price words|understand colour and price words.*Merge to order/s }));
    const dialog = await screen.findByRole('dialog', { name: 'Merge #57?' });
    expect(view.location()).toMatch(/^\/projects\/storefront\/pull-requests\/57/);
    expect(dialog).toBeInTheDocument();
    expect(view.transport.commands).toEqual([]);
  });

  it('closes when an item is followed', async () => {
    const view = await renderApp('/');
    await view.user.click(screen.getByRole('button', { name: /^Notifications/ }));
    const popover = await screen.findByRole('dialog', { name: 'Needs you' });
    await view.user.click(within(popover).getByRole('link', { name: /Agent question/ }));
    await view.expectLocation('/runs/run_5d0911');
    expect(screen.queryByRole('dialog', { name: 'Needs you' })).not.toBeInTheDocument();
  });

  it('says that nothing is waiting when nothing is', async () => {
    const base = fixtureSnapshot();
    const quiet = {
      ...base,
      runs: base.runs.map((run) => ({ ...run, pendingQuestion: null, status: run.status === 'waiting' ? ('stopped' as const) : run.status })),
      projects: base.projects.map((project) => ({ ...project, requests: [], issues: [], pullRequests: [], releases: [], audits: [] })),
    };
    const view = await renderApp('/', { snapshot: quiet });
    await view.user.click(screen.getByRole('button', { name: 'Notifications' }));
    const popover = await screen.findByRole('dialog', { name: 'Needs you' });
    expect(within(popover).getByText('Nothing is waiting for you')).toBeInTheDocument();
  });

  it('forgets a release another version has overtaken', async () => {
    const snapshot = mapProject(fixtureSnapshot(), 'storefront', (project) => ({
      ...project,
      releases: project.releases.map((release) => (release.id === '1.8.2' ? { ...release, supersededBy: '1.8.3' } : release)),
    }));
    await renderApp('/', { snapshot });
    expect(screen.getByRole('button', { name: 'Notifications: 14 items need you' })).toBeInTheDocument();
  });

  it('writes the notifications in French', async () => {
    const view = await renderApp('/', { locale: 'fr' });
    await view.user.click(screen.getByRole('button', { name: 'Notifications : 15 éléments vous concernent' }));
    const popover = await screen.findByRole('dialog', { name: 'Vous concerne' });
    expect(within(popover).getAllByText(/Votre décision est attendue/).length).toBeGreaterThan(0);
    expect(within(popover).getByRole('link', { name: 'Ouvrir le tableau' })).toHaveAttribute('href', '/board');
  });
});
