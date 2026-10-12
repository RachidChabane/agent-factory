import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PauseView } from '../contract/index.ts';
import { withInstallation } from '../test/fixtures/mutate.ts';
import { clickConfirmAndExpectCommand } from '../test/commands.ts';
import { renderWidget, TEST_NOW } from '../test/harness.tsx';
import { emptySnapshot } from '../test/minimal-snapshot.ts';
import { DrainControl } from './DrainControl.tsx';

const DIALOG_TITLE = 'Stop the factory once its running work finishes?';
const ACTION = 'Stop after running work';

const drainPause: PauseView = { scope: 'installation', cause: 'drain', reason: 'Drain asked by Alex Morgan', since: new Date(TEST_NOW - 120_000).toISOString(), resumesAt: null };
const liveSnapshot = () => emptySnapshot(TEST_NOW);

describe('DrainControl as a button', () => {
  it('asks for confirmation, then sends factory.drain with an empty body', async () => {
    const view = await renderWidget(<DrainControl appearance="button" />);
    await clickConfirmAndExpectCommand(view.user, screen.getByRole('button', { name: ACTION }), DIALOG_TITLE, ACTION, view.transport, 'factory.drain', {});
  });

  it('tells in the dialog what stops and what does not', async () => {
    const view = await renderWidget(<DrainControl appearance="button" />);
    await view.user.click(screen.getByRole('button', { name: ACTION }));
    const dialog = await screen.findByRole('dialog', { name: DIALOG_TITLE });
    expect(dialog).toHaveTextContent('No new work starts. The factory process stops once its running issues, challenges and audits have finished');
  });

  it('shows what the factory says it did once the drain is accepted', async () => {
    const view = await renderWidget(<DrainControl appearance="button" />);
    view.transport.effects.set('factory.drain', 'Stopping once 3 running issues finish');
    await clickConfirmAndExpectCommand(view.user, screen.getByRole('button', { name: ACTION }), DIALOG_TITLE, ACTION, view.transport, 'factory.drain', {});
    expect(await within(screen.getByRole('status')).findByText('Stopping once 3 running issues finish')).toBeInTheDocument();
  });

  it('sends nothing when the confirmation is cancelled', async () => {
    const view = await renderWidget(<DrainControl appearance="button" />);
    await view.user.click(screen.getByRole('button', { name: ACTION }));
    const dialog = await screen.findByRole('dialog', { name: DIALOG_TITLE });
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(view.transport.commands).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the refusal of the factory, for example when no factory process runs', async () => {
    const view = await renderWidget(<DrainControl appearance="button" />);
    view.transport.commandFailure = 'no factory process is running';
    await view.user.click(screen.getByRole('button', { name: ACTION }));
    const dialog = await screen.findByRole('dialog', { name: DIALOG_TITLE });
    await view.user.click(within(dialog).getByRole('button', { name: ACTION }));
    expect(await within(screen.getByRole('alert')).findByText('no factory process is running')).toBeInTheDocument();
  });

  it('is available while a rehearsal runs', async () => {
    await renderWidget(<DrainControl appearance="button" />, { snapshot: withInstallation(liveSnapshot(), { mode: 'rehearsal' }) });
    expect(screen.getByRole('button', { name: ACTION })).toBeEnabled();
  });

  it('is disabled in the demonstration, which has no factory process, and says why', async () => {
    await renderWidget(<DrainControl appearance="button" />, { snapshot: withInstallation(liveSnapshot(), { mode: 'demo' }) });
    const button = screen.getByRole('button', { name: ACTION });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Not available in the demonstration, which has no factory process to stop.');
  });

  it('is disabled while a drain is already under way, and says so', async () => {
    await renderWidget(<DrainControl appearance="button" />, { snapshot: withInstallation(liveSnapshot(), { pauses: [drainPause] }) });
    const button = screen.getByRole('button', { name: ACTION });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('The factory is already stopping once its running work finishes.');
  });

  it('is written in French', async () => {
    await renderWidget(<DrainControl appearance="button" />, { locale: 'fr' });
    expect(screen.getByRole('button', { name: 'S’arrêter après le travail en cours' })).toBeEnabled();
  });
});

describe('DrainControl as an icon', () => {
  it('is named by its action and sends factory.drain after the confirmation', async () => {
    const view = await renderWidget(<DrainControl appearance="icon" />);
    await clickConfirmAndExpectCommand(view.user, screen.getByRole('button', { name: ACTION }), DIALOG_TITLE, ACTION, view.transport, 'factory.drain', {});
  });

  it('names the reason in its label when it is disabled', async () => {
    await renderWidget(<DrainControl appearance="icon" />, { snapshot: withInstallation(liveSnapshot(), { mode: 'demo' }) });
    const button = screen.getByRole('button', { name: /Stop after running work/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleName('Stop after running work (Not available in the demonstration, which has no factory process to stop.)');
  });
});
