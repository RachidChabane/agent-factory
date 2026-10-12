import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot, renderWithCockpit } from '../../test/render.tsx';
import { SettingsView } from './SettingsView.tsx';

async function findRole(name: string): Promise<HTMLElement> {
  return screen.findByRole('listitem', { name });
}

describe('SettingsView', () => {
  it('shows one editable row per agent role with save disabled until a change', async () => {
    renderWithCockpit(<SettingsView />);
    const implementer = await findRole('Implémenteur');
    expect(within(implementer).getByLabelText('Budget max ($)')).toHaveValue(8);
    expect(within(implementer).getByLabelText('Tours max')).toHaveValue(150);
    expect(within(implementer).getByRole('button', { name: 'Enregistrer Implémenteur' })).toBeDisabled();
  });

  it('saves an edited role', async () => {
    const user = userEvent.setup();
    const { transport } = renderWithCockpit(<SettingsView />);
    const reviewer = await findRole('Relecteur');
    const save = within(reviewer).getByRole('button', { name: 'Enregistrer Relecteur' });
    const budget = within(reviewer).getByLabelText('Budget max ($)');
    await user.clear(budget);
    await user.type(budget, '4.5');
    expect(save).toBeEnabled();
    await user.click(save);
    await screen.findByText('Rôle mis à jour');
    expect(transport.commands).toEqual([
      {
        name: 'settings.update-role',
        body: { role: 'reviewer', model: expect.stringContaining('claude'), effort: 'xhigh', maxBudgetUsd: 4.5, maxTurns: 40 },
      },
    ]);
  });

  it('keeps save disabled and flags an invalid role value', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<SettingsView />);
    const auditor = await findRole('Auditeur');
    const turns = within(auditor).getByLabelText('Tours max');
    await user.clear(turns);
    expect(within(auditor).getByText(/nombre entier de tours/)).toBeInTheDocument();
    expect(within(auditor).getByRole('button', { name: 'Enregistrer Auditeur' })).toBeDisabled();
  });

  it('shows the active run count and saves valid limits', async () => {
    const user = userEvent.setup();
    const { transport } = renderWithCockpit(<SettingsView />);
    expect(await screen.findByText(/2 runs actifs/)).toBeInTheDocument();
    const ceiling = screen.getByLabelText('Plafond de concurrence');
    await user.clear(ceiling);
    await user.type(ceiling, '3');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les limites' }));
    await screen.findByText('Limites mises à jour');
    expect(transport.commands).toEqual([
      {
        name: 'settings.update-limits',
        body: { concurrencyCeiling: 3, freeMemoryThresholdPercent: 40, pauseAbovePressure: 'normal' },
      },
    ]);
  });

  it('shows validation errors and posts nothing for invalid limits', async () => {
    const user = userEvent.setup();
    const { transport } = renderWithCockpit(<SettingsView />);
    const ceiling = await screen.findByLabelText('Plafond de concurrence');
    await user.clear(ceiling);
    await user.type(ceiling, '9');
    const threshold = screen.getByLabelText('Seuil de mémoire libre (%)');
    await user.clear(threshold);
    await user.type(threshold, '5');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les limites' }));
    expect(screen.getByText('Saisissez un entier entre 1 et 4.')).toBeInTheDocument();
    expect(screen.getByText('Saisissez un pourcentage entre 10 et 90.')).toBeInTheDocument();
    expect(transport.commands).toHaveLength(0);
  });

  it('offers the pause pressure choices', async () => {
    renderWithCockpit(<SettingsView />);
    const select = await screen.findByLabelText('Mettre en pause');
    expect(within(select).getByRole('option', { name: 'Au-delà de normale' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Au-delà d’élevée' })).toBeInTheDocument();
  });

  it('summarises the connections and lists the broken tools first with their fix command', async () => {
    renderWithCockpit(<SettingsView />);
    expect(await screen.findByText('5 sur 9 connectés')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem').filter((item) => item.classList.contains('settings-tool'));
    expect(rows).toHaveLength(9);
    expect(rows.at(-1)?.getAttribute('aria-label')).toBe('sandbox');
    expect(rows.slice(0, 3).map((row) => row.getAttribute('aria-label'))).toEqual(['deployctl', 'secrets', 'metrics']);
    expect(within(screen.getByRole('listitem', { name: 'deployctl' })).getByText('deployctl login')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'metrics' })).getByText('pipx install metrics-cli')).toBeInTheDocument();
    expect(screen.getAllByText('Pour corriger :')).toHaveLength(3);
  });

  it('lists every configured tool as not checked, each with its test, before any test ran', async () => {
    const user = userEvent.setup();
    const snapshot = fixtureSnapshot();
    const { transport } = renderWithCockpit(<SettingsView />, { snapshot: { ...snapshot, settings: { ...snapshot.settings, tools: [] } } });
    expect(await screen.findByText('0 sur 9 connectés')).toBeInTheDocument();
    expect(screen.getAllByText('Non vérifié', { selector: '.settings-tool__status' })).toHaveLength(9);
    await user.click(screen.getByRole('button', { name: 'Tester sandbox' }));
    await screen.findByText('Test de connexion lancé');
    expect(transport.commands).toEqual([{ name: 'settings.test-tool', body: { tool: 'sandbox' } }]);
  });

  it('runs a connection test for one tool', async () => {
    const user = userEvent.setup();
    const { transport } = renderWithCockpit(<SettingsView />);
    await user.click(await screen.findByRole('button', { name: 'Tester secrets' }));
    await screen.findByText('Test de connexion lancé');
    expect(transport.commands).toEqual([{ name: 'settings.test-tool', body: { tool: 'secrets' } }]);
  });
});
