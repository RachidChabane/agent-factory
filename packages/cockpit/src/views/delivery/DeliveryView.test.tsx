import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithCockpit } from '../../test/render.tsx';
import { DeliveryView } from './DeliveryView.tsx';

async function findEnvironment(name: string): Promise<HTMLElement> {
  return screen.findByRole('group', { name: `Environnement ${name}` });
}

describe('DeliveryView', () => {
  it('shows the three environments with their current deployment', async () => {
    renderWithCockpit(<DeliveryView />);
    const prep = await findEnvironment('PREP');
    expect(within(prep).getAllByText('storefront-v2.3.1-rc.1').length).toBeGreaterThan(0);
    expect(within(prep).getByText('e27b4d9')).toBeInTheDocument();
    expect(within(prep).getByText(/par storefront-release\[bot\]/)).toBeInTheDocument();
    expect(await findEnvironment('DEV')).toBeInTheDocument();
    expect(await findEnvironment('PROD')).toBeInTheDocument();
  });

  it('asks for confirmation before redeploying PREP, then posts the command', async () => {
    const user = userEvent.setup();
    const { transport } = renderWithCockpit(<DeliveryView />);
    const prep = await findEnvironment('PREP');
    await user.click(within(prep).getByRole('button', { name: 'Redéployer PREP' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Redéployer storefront-v2.3.1-rc.1 sur PREP ?')).toBeInTheDocument();
    expect(transport.commands).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer le redéploiement' }));
    await screen.findByText('Redéploiement lancé');
    expect(transport.commands).toEqual([{ name: 'deployment.redeploy', body: { environment: 'prep', confirmVersion: 'storefront-v2.3.1-rc.1' } }]);
  });

  it('posts nothing when the redeployment is cancelled', async () => {
    const user = userEvent.setup();
    const { transport } = renderWithCockpit(<DeliveryView />);
    const dev = await findEnvironment('DEV');
    await user.click(within(dev).getByRole('button', { name: 'Redéployer DEV' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(transport.commands).toHaveLength(0);
  });

  it('offers no redeploy button on PROD and explains why', async () => {
    renderWithCockpit(<DeliveryView />);
    const prod = await findEnvironment('PROD');
    expect(within(prod).queryByRole('button')).not.toBeInTheDocument();
    expect(within(prod).getByText('La production se déploie depuis son workflow, jamais par l’usine.')).toBeInTheDocument();
  });

  it('lists workflow runs and filters them', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<DeliveryView />);
    const table = await screen.findByRole('table', { name: 'Exécutions de workflows' });
    const allRows = within(table).getAllByRole('row').length;
    expect(within(table).getAllByText('Deploy main to DEV').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('radio', { name: 'Échecs' }));
    const failures = within(screen.getByRole('table', { name: 'Exécutions de workflows' })).getAllByRole('row');
    expect(failures.length).toBeGreaterThan(1);
    expect(failures.length).toBeLessThan(allRows);
    for (const row of failures.slice(1)) expect(within(row).getByText('Échec')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'En cours' }));
    const running = within(screen.getByRole('table', { name: 'Exécutions de workflows' })).getAllByRole('row').slice(1);
    expect(running.length).toBeGreaterThan(0);
    for (const row of running) expect(within(row).getByText('En cours')).toBeInTheDocument();
  });
});
