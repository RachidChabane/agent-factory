import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { usd } from '../../format/format.ts';
import { fixtureSnapshot, renderWithCockpit } from '../../test/render.tsx';
import { CostsView } from './CostsView.tsx';
import { PAUSE_PERCENT_ERROR, POSITIVE_AMOUNT_ERROR, utilizationTone } from './costs-model.ts';

const SUBMIT_LABEL = 'Ajuster les plafonds';

async function findGroup(name: string): Promise<HTMLElement> {
  return screen.findByRole('group', { name });
}

describe('CostsView', () => {
  it('shows a loading state until the snapshot arrives', () => {
    renderWithCockpit(<CostsView />);
    expect(screen.getByLabelText('Chargement des coûts')).toBeInTheDocument();
  });

  it('shows the month-to-date total in the header', async () => {
    renderWithCockpit(<CostsView />);
    await findGroup('Hebdomadaire');
    expect(screen.getByText(`Depuis le début du mois : ${usd(fixtureSnapshot().costs.monthToDateUsd)}`)).toBeInTheDocument();
  });

  it('shows each subscription window with its reset and pause threshold', async () => {
    renderWithCockpit(<CostsView />);
    const fiveHour = await findGroup('Fenêtre 5 h');
    expect(within(fiveHour).getByText('46 %')).toBeInTheDocument();
    expect(within(fiveHour).getByText('Réinitialisation dans 2 h 13')).toBeInTheDocument();
    expect(within(fiveHour).getByText('L’ordonnanceur se met en pause à 90 %')).toBeInTheDocument();
    expect(within(fiveHour).getByRole('meter', { name: 'Utilisation Fenêtre 5 h' })).toHaveAttribute('aria-valuenow', '46');
    const weekly = screen.getByRole('group', { name: 'Hebdomadaire' });
    expect(within(weekly).getByText('63 %')).toBeInTheDocument();
  });

  it('maps utilization to the meter tone', () => {
    expect(utilizationTone(0.74)).toBe('success');
    expect(utilizationTone(0.75)).toBe('running');
    expect(utilizationTone(0.89)).toBe('running');
    expect(utilizationTone(0.9)).toBe('failed');
  });

  it('summarises the daily cost against the daily cap', async () => {
    const { costs } = fixtureSnapshot();
    const total = costs.daily.reduce((sum, day) => sum + day.costUsd, 0);
    renderWithCockpit(<CostsView />);
    await findGroup('Par rôle');
    expect(screen.getByRole('img', { name: 'Coût quotidien sur 30 jours' })).toBeInTheDocument();
    expect(screen.getByText('Plafond quotidien 60,00 $')).toBeInTheDocument();
    expect(screen.getByText(usd(total))).toBeInTheDocument();
    expect(screen.getByText(usd(total / costs.daily.length))).toBeInTheDocument();
  });

  it('draws no cap line and says so when no daily cap is configured', async () => {
    const snapshot = fixtureSnapshot();
    renderWithCockpit(<CostsView />, { snapshot: { ...snapshot, costs: { ...snapshot.costs, caps: { ...snapshot.costs.caps, dailyUsd: 0 } } } });
    await findGroup('Par rôle');
    expect(screen.getByText('Aucun plafond quotidien')).toBeInTheDocument();
    expect(screen.queryByText(/Plafond quotidien \d/)).not.toBeInTheDocument();
  });

  it('breaks the cost down by role, model and issue', async () => {
    renderWithCockpit(<CostsView />);
    const byRole = await findGroup('Par rôle');
    expect(within(byRole).getByText('Implémenteur')).toBeInTheDocument();
    expect(within(byRole).getByText('412,30 $')).toBeInTheDocument();
    expect(within(byRole).getByText('88,4 M tokens')).toBeInTheDocument();
    const byModel = screen.getByRole('group', { name: 'Par modèle' });
    expect(within(byModel).getByText('claude-opus-5-5')).toBeInTheDocument();
    const byIssue = screen.getByRole('group', { name: 'Par issue' });
    expect(within(byIssue).getByRole('link', { name: '#225' })).toHaveAttribute('href', '/issues/225');
    expect(within(byIssue).getByText('18,42 $')).toBeInTheDocument();
  });

  it('lists the runs from the most to the least expensive', async () => {
    const { runs } = fixtureSnapshot();
    renderWithCockpit(<CostsView />);
    const table = await screen.findByRole('table', { name: 'Runs par coût' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(runs.length);
    const costs = rows.map((row) => within(row).getAllByRole('cell')[5]?.textContent ?? '');
    const expected = runs.map((run) => run.costUsd).sort((a, b) => b - a).map(usd);
    expect(costs).toEqual(expected);
    const top = runs.toSorted((a, b) => b.costUsd - a.costUsd)[0];
    if (top === undefined) throw new Error('fixture must contain runs');
    expect(within(table).getByRole('link', { name: top.id })).toHaveAttribute('href', `/runs/${top.id}`);
  });

  it('keeps the submit button disabled while the caps are unchanged', async () => {
    renderWithCockpit(<CostsView />);
    expect(await screen.findByRole('button', { name: SUBMIT_LABEL })).toBeDisabled();
    expect(screen.getByLabelText('Plafond quotidien ($)')).toHaveValue(60);
    expect(screen.getByLabelText('Plafond par run ($)')).toHaveValue(8);
    expect(screen.getByLabelText('Seuil de pause (%)')).toHaveValue(90);
  });

  it('posts the adjusted caps with the pause threshold stored as a ratio', async () => {
    const user = userEvent.setup();
    const { transport } = renderWithCockpit(<CostsView />);
    const daily = await screen.findByLabelText('Plafond quotidien ($)');
    await user.clear(daily);
    await user.type(daily, '75');
    const pause = screen.getByLabelText('Seuil de pause (%)');
    await user.clear(pause);
    await user.type(pause, '85');
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }));
    expect(transport.commands).toEqual([
      { name: 'costs.update-caps', body: { dailyUsd: 75, perRunUsd: 8, pauseAtUtilization: 0.85 } },
    ]);
    expect(await screen.findByText('Plafonds mis à jour')).toBeInTheDocument();
  });

  it('shows inline errors and posts nothing when the caps are invalid', async () => {
    const user = userEvent.setup();
    const { transport } = renderWithCockpit(<CostsView />);
    const daily = await screen.findByLabelText('Plafond quotidien ($)');
    await user.clear(daily);
    await user.type(daily, '0');
    const pause = screen.getByLabelText('Seuil de pause (%)');
    await user.clear(pause);
    await user.type(pause, '120');
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }));
    expect(screen.getByText(POSITIVE_AMOUNT_ERROR)).toBeInTheDocument();
    expect(screen.getByText(PAUSE_PERCENT_ERROR)).toBeInTheDocument();
    expect(daily).toHaveAttribute('aria-invalid', 'true');
    expect(transport.commands).toEqual([]);
  });
});
