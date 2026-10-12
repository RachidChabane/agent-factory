import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CockpitSnapshot, PauseView } from '../contract/index.ts';
import { HOUR_MS } from '../i18n/formatters.ts';
import { clickAndExpectCommand, clickConfirmAndExpectCommand } from '../test/commands.ts';
import { renderInProviders, TEST_NOW } from '../test/harness.tsx';
import { emptySnapshot } from '../test/minimal-snapshot.ts';
import { AppRoutes } from './AppRoutes.tsx';
import { Shell } from './Shell.tsx';

function renderShell(snapshot: CockpitSnapshot, path = '/') {
  return renderInProviders(
    <Shell>
      <AppRoutes />
    </Shell>,
    { snapshot, path },
  );
}

function withInstallation(patch: Partial<CockpitSnapshot['installation']>): CockpitSnapshot {
  const snapshot = emptySnapshot(TEST_NOW);
  return { ...snapshot, installation: { ...snapshot.installation, ...patch } };
}

const OPERATOR_PAUSE: PauseView = { scope: 'installation', cause: 'operator', reason: 'Paused by Alex Morgan', since: new Date(TEST_NOW - HOUR_MS).toISOString(), resumesAt: null };
const DRAIN_PAUSE: PauseView = { scope: 'installation', cause: 'drain', reason: 'Drain asked by Alex Morgan', since: new Date(TEST_NOW - HOUR_MS).toISOString(), resumesAt: null };
const MEMORY_PAUSE: PauseView = { scope: 'installation', cause: 'resources', reason: 'Free memory 31% is below 40%', since: new Date(TEST_NOW - HOUR_MS).toISOString(), resumesAt: null };

describe('Shell banners', () => {
  it('says that the projects are fictional and driven by a simulated agent in demo mode', async () => {
    await renderShell(withInstallation({ mode: 'demo' }));
    expect(screen.getByRole('note')).toHaveTextContent('You are looking at fictional projects driven by a simulated agent.');
  });

  it('says that no remote forge is written in rehearsal mode', async () => {
    await renderShell(withInstallation({ mode: 'rehearsal' }));
    expect(screen.getByRole('note')).toHaveTextContent('no remote forge is written');
  });

  it('shows no mode banner for a live installation', async () => {
    await renderShell(withInstallation({ mode: 'live' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });


  it('warns that the data may be out of date when the event stream is lost', async () => {
    const view = await renderShell(emptySnapshot(TEST_NOW));
    expect(screen.queryByText(/may be out of date/)).not.toBeInTheDocument();
    act(() => view.transport.handlers?.onDisconnect());
    expect(screen.getByText('Reconnecting… — the data shown may be out of date.')).toBeInTheDocument();
  });
});

describe('Shell sidebar', () => {
  it('names the operator, the scheduler state and the run slots', async () => {
    await renderShell({ ...emptySnapshot(TEST_NOW), installation: { ...emptySnapshot(TEST_NOW).installation, runSlots: { limit: 3, running: 2, queued: 1 } } });
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(sidebar).getByText('Alex Morgan')).toBeInTheDocument();
    expect(within(sidebar).getByText('Scheduler running')).toBeInTheDocument();
    expect(within(sidebar).getByText('Run slots 2/3 · 1 queued')).toBeInTheDocument();
    expect(within(sidebar).getByText('Version 0.1.0')).toBeInTheDocument();
  });

  it('pauses the whole factory from the sidebar', async () => {
    const view = await renderShell(emptySnapshot(TEST_NOW));
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' });
    await clickAndExpectCommand(view.user, within(sidebar).getByRole('button', { name: 'Pause the factory' }), view.transport, 'scheduler.pause', { project: null });
  });

  it('resumes the factory when the operator paused it', async () => {
    const view = await renderShell(withInstallation({ pauses: [OPERATOR_PAUSE] }));
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(sidebar).getByText('Scheduler paused')).toBeInTheDocument();
    await clickAndExpectCommand(view.user, within(sidebar).getByRole('button', { name: 'Resume the factory' }), view.transport, 'scheduler.resume', { project: null });
  });

  it('says the scheduler is paused but still offers to pause when only the machine paused it', async () => {
    await renderShell(withInstallation({ pauses: [MEMORY_PAUSE] }));
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(sidebar).getByText('Scheduler paused')).toBeInTheDocument();
    expect(within(sidebar).getByRole('button', { name: 'Pause the factory' })).toBeInTheDocument();
    expect(within(sidebar).queryByRole('button', { name: 'Resume the factory' })).not.toBeInTheDocument();
  });

  it('asks to stop the factory once its running work finishes, after a confirmation', async () => {
    const view = await renderShell(emptySnapshot(TEST_NOW));
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' });
    await clickConfirmAndExpectCommand(
      view.user,
      within(sidebar).getByRole('button', { name: 'Stop after running work' }),
      'Stop the factory once its running work finishes?',
      'Stop after running work',
      view.transport,
      'factory.drain',
      {},
    );
  });

  it('says the scheduler is draining, offers no resume for it and no second drain', async () => {
    await renderShell(withInstallation({ pauses: [DRAIN_PAUSE] }));
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(sidebar).getByText('Scheduler draining')).toBeInTheDocument();
    expect(within(sidebar).queryByRole('button', { name: 'Resume the factory' })).not.toBeInTheDocument();
    expect(within(sidebar).getByRole('button', { name: /^Stop after running work/ })).toBeDisabled();
  });

  it('does not offer to stop the factory in the demonstration', async () => {
    await renderShell(withInstallation({ mode: 'demo' }));
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(sidebar).getByRole('button', { name: /^Stop after running work/ })).toBeDisabled();
  });

  it('links to the pages of the workspace and of the factory', async () => {
    await renderShell(emptySnapshot(TEST_NOW));
    const sidebar = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(sidebar).getByRole('link', { name: 'Board' })).toHaveAttribute('href', '/');
    expect(within(sidebar).getByRole('link', { name: 'Runs' })).toHaveAttribute('href', '/runs');
    expect(within(sidebar).getByRole('link', { name: 'Usage and costs' })).toHaveAttribute('href', '/usage');
    expect(within(sidebar).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });
});

describe('Shell top bar', () => {
  it('toggles the theme', async () => {
    const view = await renderShell(emptySnapshot(TEST_NOW));
    await view.user.click(screen.getByRole('button', { name: 'Switch to the light theme' }));
    expect(document.documentElement.dataset['theme']).toBe('light');
    await view.user.click(screen.getByRole('button', { name: 'Switch to the dark theme' }));
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('shows the memory, the run slots and what the machine reports in the status popover', async () => {
    const view = await renderShell(emptySnapshot(TEST_NOW));
    await view.user.click(screen.getByRole('button', { name: 'Machine, run slots and subscription usage' }));
    const popover = await screen.findByRole('dialog', { name: 'Machine, run slots and subscription usage' });
    expect(within(popover).getByText('Free memory')).toBeInTheDocument();
    expect(within(popover).getByText(/Pressure normal · threshold 40%/)).toBeInTheDocument();
    expect(within(popover).getByText(/new runs are allowed/)).toBeInTheDocument();
    expect(within(popover).getByText('0 of 3 in use')).toBeInTheDocument();
    expect(within(popover).getByText('No usage reading yet.')).toBeInTheDocument();
    expect(within(popover).getByRole('link', { name: 'Open usage and costs' })).toHaveAttribute('href', '/usage');
  });

  it('says that the memory was never sampled instead of inventing a figure', async () => {
    const snapshot = emptySnapshot(TEST_NOW);
    const view = await renderShell({ ...snapshot, resources: { ...snapshot.resources, sample: { value: null, readAt: null, error: 'the sampler is not running' } } });
    await view.user.click(screen.getByRole('button', { name: 'Machine, run slots and subscription usage' }));
    const popover = await screen.findByRole('dialog', { name: 'Machine, run slots and subscription usage' });
    expect(within(popover).getByText('No memory sample has been read yet.')).toBeInTheDocument();
    expect(within(popover).getByText('The last read failed: the sampler is not running')).toBeInTheDocument();
  });
});

describe('Shell routes', () => {
  it('shows a not-found page for an address that matches nothing', async () => {
    await renderShell(emptySnapshot(TEST_NOW), '/nowhere');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the board' })).toHaveAttribute('href', '/');
  });

  it('shows a not-found page for a project the installation does not drive', async () => {
    await renderShell(emptySnapshot(TEST_NOW), '/projects/nowhere/issues');
    expect(await screen.findByText('Project “nowhere” not found')).toBeInTheDocument();
  });
});
