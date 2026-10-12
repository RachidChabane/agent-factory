import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand } from '../../test/commands.ts';
import { environmentCard, LEDGER, openDelivery, STOREFRONT } from './delivery-test-support.ts';

const healthButton = (environment: string) => within(environmentCard(environment)).getByRole('button', { name: `Check health of ${environment}` });

describe('health.check', () => {
  it.each(['development', 'staging', 'production'])('checks the health of %s of the storefront', async (environment) => {
    const view = await openDelivery();
    await clickAndExpectCommand(view.user, healthButton(environment), view.transport, 'health.check', { project: STOREFRONT, environment });
  });

  it('names the project, since environments of two projects can share a name', async () => {
    const view = await openDelivery(LEDGER);
    await clickAndExpectCommand(view.user, healthButton('production'), view.transport, 'health.check', { project: LEDGER, environment: 'production' });
  });

  it('is offered only to an environment that has a health check', async () => {
    await openDelivery(LEDGER);
    expect(within(environmentCard('staging')).queryByRole('button', { name: /Check health/ })).not.toBeInTheDocument();
    expect(within(environmentCard('production')).getAllByRole('button', { name: /Check health/ })).toHaveLength(1);
  });

  it('is offered once per environment however many checks it has', async () => {
    await openDelivery();
    expect(within(environmentCard('staging')).getAllByRole('button', { name: /Check health/ })).toHaveLength(1);
  });

  it('shows what the factory did once it accepted the command', async () => {
    const view = await openDelivery();
    view.transport.effects.set('health.check', 'Sampled 2 checks of staging');
    await view.user.click(healthButton('staging'));
    expect(await within(screen.getByRole('status')).findByText('Sampled 2 checks of staging')).toBeInTheDocument();
  });

  it('shows the refusal of the factory', async () => {
    const view = await openDelivery();
    view.transport.commandFailure = 'staging declares no health check';
    await view.user.click(healthButton('staging'));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('The command failed')).toBeInTheDocument();
    expect(within(alert).getByText('staging declares no health check')).toBeInTheDocument();
  });

  it('is disabled while the command is in flight', async () => {
    const view = await openDelivery();
    const release = view.transport.holdCommands();
    await view.user.click(healthButton('staging'));
    await waitFor(() => expect(healthButton('staging')).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(healthButton('staging')).toBeEnabled());
    expect(view.transport.commands).toHaveLength(1);
  });
});
