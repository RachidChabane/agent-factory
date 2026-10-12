import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand, clickConfirmAndExpectCommand, expectCommand } from '../test/commands.ts';
import { renderWidget } from '../test/harness.tsx';
import { CommandButton } from './CommandButton.tsx';
import { CommandDialog } from './CommandDialog.tsx';

const ABANDON_BODY = { project: 'storefront', issueNumber: 12, reason: 'The decision moved to another issue' } as const;

describe('CommandButton', () => {
  it('sends the command its label announces, with exactly the body it was given', async () => {
    const view = await renderWidget(
      <CommandButton command="issue.start" body={{ project: 'storefront', issueNumber: 12 }}>
        Start the issue
      </CommandButton>,
    );
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Start the issue' }), view.transport, 'issue.start', { project: 'storefront', issueNumber: 12 });
  });

  it('shows what the factory says it did when the command is accepted', async () => {
    const view = await renderWidget(<CommandButton command="usage.refresh" body={{}}>Refresh usage</CommandButton>);
    view.transport.effects.set('usage.refresh', 'Usage read for 2 accounts');
    await view.user.click(screen.getByRole('button', { name: 'Refresh usage' }));
    expect(await within(screen.getByRole('status')).findByText('Usage read for 2 accounts')).toBeInTheDocument();
  });

  it('shows the refusal of the factory as an error', async () => {
    const view = await renderWidget(<CommandButton command="usage.refresh" body={{}}>Refresh usage</CommandButton>);
    view.transport.commandFailure = 'no account is configured';
    await view.user.click(screen.getByRole('button', { name: 'Refresh usage' }));
    const alert = screen.getByRole('alert');
    expect(await within(alert).findByText('The command failed')).toBeInTheDocument();
    expect(within(alert).getByText('no account is configured')).toBeInTheDocument();
  });

  it('is disabled while the command is in flight and free again afterwards', async () => {
    const view = await renderWidget(<CommandButton command="usage.refresh" body={{}}>Refresh usage</CommandButton>);
    const release = view.transport.holdCommands();
    await view.user.click(screen.getByRole('button', { name: 'Refresh usage' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh usage' })).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh usage' })).toBeEnabled());
    expect(view.transport.commands).toHaveLength(1);
  });

  it('asks for confirmation before sending anything when it is given a confirmation', async () => {
    const view = await renderWidget(
      <CommandButton
        command="issue.abandon"
        body={ABANDON_BODY}
        variant="danger"
        confirm={{ title: 'Abandon issue 12?', description: 'The factory stops working on it.', confirmLabel: 'Abandon the issue', tone: 'danger' }}
      >
        Abandon
      </CommandButton>,
    );
    await clickConfirmAndExpectCommand(view.user, screen.getByRole('button', { name: 'Abandon' }), 'Abandon issue 12?', 'Abandon the issue', view.transport, 'issue.abandon', ABANDON_BODY);
  });

  it('sends nothing when the confirmation is cancelled', async () => {
    const view = await renderWidget(
      <CommandButton command="issue.abandon" body={ABANDON_BODY} confirm={{ title: 'Abandon issue 12?', confirmLabel: 'Abandon the issue', tone: 'danger' }}>
        Abandon
      </CommandButton>,
    );
    await view.user.click(screen.getByRole('button', { name: 'Abandon' }));
    const dialog = await screen.findByRole('dialog', { name: 'Abandon issue 12?' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(view.transport.commands).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('CommandDialog', () => {
  it('stays open and sends nothing while the form is invalid, then sends the command and closes when it is valid', async () => {
    let invalidAttempts = 0;
    let closed = 0;
    const view = await renderWidget(
      <CommandDialog
        open
        onClose={() => {
          closed += 1;
        }}
        title="Resolve the audit"
        confirmLabel="Resolve"
        command="audit.resolve"
        body={null}
        onInvalid={() => {
          invalidAttempts += 1;
        }}
      />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Resolve the audit' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Resolve' }));
    expect(invalidAttempts).toBe(1);
    expect(view.transport.commands).toEqual([]);
    expect(closed).toBe(0);
  });

  it('closes once the factory accepted the command', async () => {
    let closed = 0;
    let accepted = 0;
    const view = await renderWidget(
      <CommandDialog
        open
        onClose={() => {
          closed += 1;
        }}
        onAccepted={() => {
          accepted += 1;
        }}
        title="Resolve the audit"
        confirmLabel="Resolve"
        command="audit.resolve"
        body={{ project: 'storefront', auditId: 'A-15', note: 'Reviewed with the author' }}
      />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Resolve the audit' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Resolve' }));
    await expectCommand(view.transport, 'audit.resolve', { project: 'storefront', auditId: 'A-15', note: 'Reviewed with the author' });
    await waitFor(() => expect(closed).toBe(1));
    expect(accepted).toBe(1);
  });

  it('stays open when the factory refuses the command', async () => {
    let closed = 0;
    const view = await renderWidget(
      <CommandDialog
        open
        onClose={() => {
          closed += 1;
        }}
        title="Resolve the audit"
        confirmLabel="Resolve"
        command="audit.resolve"
        body={{ project: 'storefront', auditId: 'A-15', note: 'Reviewed with the author' }}
      />,
    );
    view.transport.commandFailure = 'audit A-15 is already resolved';
    const dialog = await screen.findByRole('dialog', { name: 'Resolve the audit' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Resolve' }));
    expect(await screen.findByText('audit A-15 is already resolved')).toBeInTheDocument();
    expect(closed).toBe(0);
  });
});
