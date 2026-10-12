import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render.tsx';

async function openFeed(path = '/') {
  const view = await renderApp(path);
  await view.user.click(screen.getByRole('button', { name: 'Latest activity' }));
  return { view, popover: await screen.findByRole('dialog', { name: 'Latest activity' }) };
}

describe('ActivityFeed', () => {
  it('lists the latest events of the factory, newest first, with their project and age', async () => {
    const { popover } = await openFeed();
    const items = within(popover).getAllByRole('listitem');
    expect(items).toHaveLength(29);
    expect(items[0]).toHaveTextContent('Subscription usage of personal was read');
    expect(items[0]).toHaveTextContent('Installation');
    expect(items[1]).toHaveTextContent('Request R-13 received');
    expect(items[1]).toHaveTextContent('Storefront');
  });

  it('links an event to the page of its subject when it has one', async () => {
    const { popover } = await openFeed();
    expect(within(popover).getByRole('link', { name: /Issue #45 moved to implementing/ })).toHaveAttribute('href', '/projects/storefront/issues/45');
    expect(within(popover).getByRole('link', { name: /Run run_7f3a2c started/ })).toHaveAttribute('href', '/runs/run_7f3a2c');
    expect(within(popover).queryByRole('link', { name: /Subscription usage of personal was read/ })).not.toBeInTheDocument();
  });

  it('puts an event of the stream at the top', async () => {
    const { view, popover } = await openFeed();
    view.transport.emitFactory({ sequence: 1843, occurredAt: '2026-10-12T10:00:00.000Z', type: 'run.finished', project: 'ledger', subject: 'run/run_72d8c0', summary: 'Run run_72d8c0 finished: success' });
    await waitFor(() => expect(within(popover).getAllByRole('listitem')[0]).toHaveTextContent('Run run_72d8c0 finished: success'));
    expect(within(popover).getAllByRole('listitem')[0]).toHaveTextContent('Ledger');
  });

  it('shows an event only once, however many times it arrives', async () => {
    const { view, popover } = await openFeed();
    const event = { sequence: 1843, occurredAt: '2026-10-12T10:00:00.000Z', type: 'run.finished', project: 'ledger', subject: 'run/run_72d8c0', summary: 'Run run_72d8c0 finished: success' };
    view.transport.emitFactory(event);
    view.transport.emitFactory(event);
    await waitFor(() => expect(within(popover).getAllByRole('listitem')).toHaveLength(30));
  });

  it('says that there is nothing yet when the factory has no event', async () => {
    const base = (await import('../test/render.tsx')).fixtureSnapshot();
    const view = await renderApp('/', { snapshot: { ...base, activity: [] } });
    await view.user.click(screen.getByRole('button', { name: 'Latest activity' }));
    expect(await screen.findByText('No activity yet')).toBeInTheDocument();
  });
});
