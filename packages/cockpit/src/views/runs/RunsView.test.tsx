import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot, renderWithCockpit } from '../../test/render.tsx';
import { RunsView } from './RunsView.tsx';

const RUN_ROUTE = '/runs/:runId?';
const LIVE_RUN = 'run_7f3a2c';
const WAITING_RUN = 'run_5d0911';
const FINISHED_RUN = 'run_2b8817';
const LIVE_RUN_LINES = 17;

describe('RunsView', () => {
  it('lists live and finished runs and shows the live run with its log', async () => {
    renderWithCockpit(<RunsView />, { path: `/runs/${LIVE_RUN}`, route: RUN_ROUTE });
    expect(await screen.findByRole('heading', { name: /Filter the order history by status/ })).toBeInTheDocument();
    const list = screen.getByRole('region', { name: 'Liste des runs' });
    expect(within(list).getByText(/En cours · 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arrêter' })).toBeInTheDocument();
    const log = await screen.findByRole('log', { name: 'Journal du run' });
    expect(screen.getByText(`${LIVE_RUN_LINES} lignes`)).toBeInTheDocument();
    expect(within(log).getAllByRole('button').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Suivi en direct' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('waits for the end of a live run before showing its cost', async () => {
    const snapshot = fixtureSnapshot();
    const runs = snapshot.runs.map((run) => (run.id === LIVE_RUN ? { ...run, costUsd: 0 } : run));
    renderWithCockpit(<RunsView />, { path: `/runs/${LIVE_RUN}`, route: RUN_ROUTE, snapshot: { ...snapshot, runs } });
    const hint = await screen.findByText(/connu en fin de run/);
    expect(hint.closest('.run-stat')).toHaveTextContent(/^Coût—/);
    const list = screen.getByRole('region', { name: 'Liste des runs' });
    expect(within(list).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('expands a tool call to show its input and result', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<RunsView />, { path: `/runs/${FINISHED_RUN}`, route: RUN_ROUTE });
    const log = await screen.findByRole('log', { name: 'Journal du run' });
    const [toolButton] = within(log).getAllByRole('button', { name: /Read/ });
    if (toolButton === undefined) throw new Error('expected a tool call row');
    await user.click(toolButton);
    expect(toolButton).toHaveAttribute('aria-expanded', 'true');
    expect(within(log).getByText('Entrée')).toBeInTheDocument();
    expect(within(log).getByText('Résultat')).toBeInTheDocument();
  });

  it('filters the log to tool calls', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<RunsView />, { path: `/runs/${FINISHED_RUN}`, route: RUN_ROUTE });
    const log = await screen.findByRole('log', { name: 'Journal du run' });
    expect(within(log).getAllByText(/frozen acceptance checks/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('radio', { name: /Outils/ }));
    await waitFor(() => expect(within(log).queryByText(/frozen acceptance checks/)).not.toBeInTheDocument());
    expect(within(log).getAllByRole('button', { name: /Read|Grep|Task|Write|Edit|Bash/ }).length).toBeGreaterThan(0);
  });

  it('answers the question a waiting run raised', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<RunsView />, { path: `/runs/${WAITING_RUN}`, route: RUN_ROUTE });
    expect(await screen.findByText('L’agent attend votre réponse')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rewrite the check to expect "4,20 €"' }));
    await waitFor(() => expect(view.transport.commands).toHaveLength(1));
    expect(view.transport.commands[0]).toEqual({
      name: 'run.answer',
      body: { runId: WAITING_RUN, questionId: 'question-225-1', answer: 'Rewrite the check to expect "4,20 €"' },
    });
  });

  it('asks for confirmation before stopping a run', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<RunsView />, { path: `/runs/${LIVE_RUN}`, route: RUN_ROUTE });
    await user.click(await screen.findByRole('button', { name: 'Arrêter' }));
    expect(view.transport.commands).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Arrêter le run' }));
    await waitFor(() => expect(view.transport.commands).toEqual([{ name: 'run.stop', body: { runId: LIVE_RUN } }]));
  });

  it('shows the subagent tree and the gate history of a finished run', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<RunsView />, { path: `/runs/${FINISHED_RUN}`, route: RUN_ROUTE });
    await user.click(await screen.findByRole('tab', { name: /Sous-agents/ }));
    expect(await screen.findByText('Map how the order history list loads its data')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Gate/ }));
    expect(await screen.findByText(/Dernier passage · réussi/)).toBeInTheDocument();
  });
});
