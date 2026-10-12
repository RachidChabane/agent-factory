import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PauseView } from '../contract/index.ts';
import { HOUR_MS, MINUTE_MS } from '../i18n/formatters.ts';
import { clickAndExpectCommand } from '../test/commands.ts';
import { withInstallation } from '../test/fixtures/mutate.ts';
import { renderWidget, TEST_NOW } from '../test/harness.tsx';
import { emptySnapshot } from '../test/minimal-snapshot.ts';
import { PausePanel } from './PausePanel.tsx';

const at = (offset: number) => new Date(TEST_NOW + offset).toISOString();

const OPERATOR_PAUSE: PauseView = { scope: 'project', cause: 'operator', reason: 'Paused by Alex Morgan', since: at(-2 * HOUR_MS), resumesAt: null };
const RESOURCES_PAUSE: PauseView = { scope: 'installation', cause: 'resources', reason: 'Free memory 31% is below 40%', since: at(-10 * MINUTE_MS), resumesAt: null };
const DRAIN_PAUSE: PauseView = { scope: 'installation', cause: 'drain', reason: 'Drain asked by Alex Morgan', since: at(-5 * MINUTE_MS), resumesAt: null };
const BUDGET_PAUSE: PauseView = { scope: 'installation', cause: 'budget', reason: 'The session limit reached 90%', since: at(-30 * MINUTE_MS), resumesAt: at(2 * HOUR_MS) };

describe('PausePanel', () => {
  it('offers to pause a scope that runs, for the project or for the whole installation', async () => {
    const view = await renderWidget(
      <PausePanel
        scopes={[
          { project: 'ledger', pauses: [] },
          { project: null, pauses: [] },
        ]}
      />,
    );
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Pause this project' }), view.transport, 'scheduler.pause', { project: 'ledger' });
    await view.user.click(screen.getByRole('button', { name: 'Pause the factory' }));
    expect(view.transport.commands.at(-1)).toEqual({ name: 'scheduler.pause', body: { project: null } });
  });

  it('shows the cause, the reason and when it began, and offers to resume the operator pause only', async () => {
    const view = await renderWidget(<PausePanel scopes={[{ project: 'ledger', pauses: [OPERATOR_PAUSE] }]} />);
    const scope = screen.getByRole('region', { name: 'This project' });
    expect(within(scope).getByText('Operator')).toBeInTheDocument();
    expect(within(scope).getByText('Paused by Alex Morgan')).toBeInTheDocument();
    expect(scope).toHaveTextContent(/Paused 2 hr\. ago/);
    expect(within(scope).getByText('Stays paused until you resume it.')).toBeInTheDocument();
    await clickAndExpectCommand(view.user, within(scope).getByRole('button', { name: 'Resume this project' }), view.transport, 'scheduler.resume', { project: 'ledger' });
  });

  it('says that a pause of the machine or of the budget lifts by itself, and when, instead of offering to resume it', async () => {
    await renderWidget(<PausePanel scopes={[{ project: null, pauses: [RESOURCES_PAUSE, BUDGET_PAUSE] }]} />);
    const scope = screen.getByRole('region', { name: 'Whole installation' });
    expect(within(scope).getByText('Lifts by itself when the machine has enough free memory again.')).toBeInTheDocument();
    expect(scope).toHaveTextContent(/Resumes in 2 hr\./);
    expect(within(scope).queryByRole('button', { name: /^Resume/ })).not.toBeInTheDocument();
    expect(within(scope).getByRole('button', { name: 'Pause the factory' })).toBeInTheDocument();
  });

  it('shows a drain as draining, with when it was asked, and offers no resume for it', async () => {
    await renderWidget(<PausePanel scopes={[{ project: null, pauses: [DRAIN_PAUSE] }]} />, { snapshot: withInstallation(emptySnapshot(TEST_NOW), { pauses: [DRAIN_PAUSE] }) });
    const scope = screen.getByRole('region', { name: 'Whole installation' });
    const row = within(scope).getByRole('listitem');
    expect(within(row).getByText('Draining')).toBeInTheDocument();
    expect(within(row).getByText('Drain asked by Alex Morgan')).toBeInTheDocument();
    expect(row).toHaveTextContent(/Asked 5 min\. ago/);
    expect(within(row).getByText('Stops once the running work finishes.')).toBeInTheDocument();
    expect(within(scope).queryByRole('button', { name: /^Resume/ })).not.toBeInTheDocument();
    expect(within(scope).getByRole('button', { name: 'Stop after running work' })).toBeDisabled();
  });

  it('offers the drain beside the pause of the installation and nowhere on a project', async () => {
    await renderWidget(
      <PausePanel
        scopes={[
          { project: 'ledger', pauses: [] },
          { project: null, pauses: [] },
        ]}
      />,
    );
    expect(within(screen.getByRole('region', { name: 'Whole installation' })).getByRole('button', { name: 'Stop after running work' })).toBeEnabled();
    expect(within(screen.getByRole('region', { name: 'This project' })).queryByRole('button', { name: 'Stop after running work' })).not.toBeInTheDocument();
  });

  it('writes the pauses in French', async () => {
    await renderWidget(<PausePanel scopes={[{ project: 'ledger', pauses: [OPERATOR_PAUSE] }]} />, { locale: 'fr' });
    expect(screen.getByRole('button', { name: 'Reprendre ce projet' })).toBeInTheDocument();
    expect(screen.getByText('Opérateur')).toBeInTheDocument();
    expect(screen.getByText('Reste en pause jusqu’à ce que vous la leviez.')).toBeInTheDocument();
  });

  it('writes the drain in French', async () => {
    await renderWidget(<PausePanel scopes={[{ project: null, pauses: [DRAIN_PAUSE] }]} />, { locale: 'fr' });
    const row = within(screen.getByRole('region', { name: 'Toute l’installation' })).getByRole('listitem');
    expect(within(row).getByText('Arrêt en cours')).toBeInTheDocument();
    expect(within(row).getByText('S’arrête une fois le travail en cours terminé.')).toBeInTheDocument();
    expect(row).toHaveTextContent(/Demandé il y a 5 min/);
  });
});
