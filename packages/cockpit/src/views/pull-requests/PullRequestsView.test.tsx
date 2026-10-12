import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { PullRequestView } from '../../contract/index.ts';
import { fixtureSnapshot, renderWithCockpit } from '../../test/render.tsx';
import { PullRequestsView } from './PullRequestsView.tsx';

const ROUTE = '/pull-requests/:pullRequestNumber?';
const READY_HEAD = 'b5e1296ad40f73c8e2b9a15d6c0f48e37a2d9b64';

describe('PullRequestsView', () => {
  it('leads with the proof gallery: before/after slider, recording and red-green logs', async () => {
    renderWithCockpit(<PullRequestsView />, { path: '/pull-requests/311', route: ROUTE });
    expect(await screen.findByRole('heading', { name: 'Display the savings of each order in the history list' })).toBeInTheDocument();
    expect(screen.getByLabelText('Position du curseur avant / après')).toHaveValue('50');
    expect(screen.getByRole('button', { name: /Lire l’animation/ })).toBeInTheDocument();
    expect(screen.getByText(/Avant · base/)).toBeInTheDocument();
    expect(screen.getByText(/Après · branche/)).toBeInTheDocument();
  });

  it('reveals more of the after image when the slider moves', async () => {
    renderWithCockpit(<PullRequestsView />, { path: '/pull-requests/311', route: ROUTE });
    const slider = await screen.findByLabelText('Position du curseur avant / après');
    fireEvent.change(slider, { target: { value: '20' } });
    expect(slider).toHaveValue('20');
    expect(screen.getByAltText('Order history page — Après')).toHaveStyle({ clipPath: 'inset(0 0 0 20%)' });
  });

  it('shows review findings with their severity', async () => {
    renderWithCockpit(<PullRequestsView />, { path: '/pull-requests/311', route: ROUTE });
    expect(await screen.findByText(/Criterion 2 is not met/)).toBeInTheDocument();
    expect(screen.getAllByText('Bloquant').length).toBeGreaterThan(0);
    expect(screen.getByText('Passe 2')).toBeInTheDocument();
  });

  it('merges only after confirmation, with the expected head sha', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<PullRequestsView />, { path: '/pull-requests/311', route: ROUTE });
    await user.click(await screen.findByRole('button', { name: 'Merger' }));
    expect(view.transport.commands).toHaveLength(0);
    const dialog = screen.getByRole('dialog', { name: 'Merger #311 ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Merger #311' }));
    await waitFor(() => expect(view.transport.commands).toEqual([{ name: 'pr.merge', body: { number: 311, expectedHeadSha: READY_HEAD } }]));
  });

  it('opens the merge confirmation from the palette link', async () => {
    renderWithCockpit(<PullRequestsView />, { path: '/pull-requests/311?merger=1', route: ROUTE });
    expect(await screen.findByRole('dialog', { name: 'Merger #311 ?' })).toBeInTheDocument();
  });

  it('disables merge while CI runs and explains why', async () => {
    renderWithCockpit(<PullRequestsView />, { path: '/pull-requests/312', route: ROUTE });
    expect(await screen.findByRole('button', { name: 'Merger' })).toBeDisabled();
    expect(screen.getByText('Pas encore mergeable')).toBeInTheDocument();
  });

  it('pastes external feedback to start a new cycle', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<PullRequestsView />, { path: '/pull-requests/311', route: ROUTE });
    await user.click(await screen.findByRole('button', { name: 'Lancer un nouveau cycle' }));
    expect(screen.getByText('Collez le retour à transmettre.')).toBeInTheDocument();
    expect(view.transport.commands).toHaveLength(0);
    await user.type(screen.getByLabelText('Auteur du retour'), 'Dana Reyes');
    await user.type(screen.getByLabelText('Retour externe'), 'The badge should be green.');
    await user.click(screen.getByRole('button', { name: 'Lancer un nouveau cycle' }));
    await waitFor(() =>
      expect(view.transport.commands).toEqual([{ name: 'pr.feedback', body: { number: 311, author: 'Dana Reyes', body: 'The badge should be green.' } }]),
    );
  });

  it('shows evaluation scores with the gate verdict for a skill-prompt change', async () => {
    renderWithCockpit(<PullRequestsView />, { path: '/pull-requests/309', route: ROUTE });
    expect(await screen.findByText(/Gate d’évaluation réussi/)).toBeInTheDocument();
    expect(screen.getByText('Measurable specifications with units')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Merger' })).not.toBeInTheDocument();
  });

  it('reveals the diff one click deeper', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<PullRequestsView />, { path: '/pull-requests/311', route: ROUTE });
    await user.click(await screen.findByRole('button', { name: 'Afficher les changements' }));
    expect(screen.getByText('web/src/components/history/OrderRow.tsx')).toBeInTheDocument();
  });

  it('lists each criterion with its test and its base and branch outcome', async () => {
    renderWithCockpit(<PullRequestsView />, { path: '/pull-requests/312', route: ROUTE });
    const table = await screen.findByRole('table', { name: 'Tests d’acceptation' });
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent?.slice(0, 9))).toEqual(['Test', 'Base', 'Branche', 'Critère 1', 'Critère 2', 'Critère 3']);
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect(within(table).getAllByText('rouge (assertion)')).toHaveLength(2);
    expect(within(table).getAllByText('vert')).toHaveLength(4);
    const test = within(table).getByTitle(/discount-totals\.test\.ts > discount totals > returns discountTotal/);
    expect(test).toHaveTextContent(/^discount totals > returns discountTotal and itemsTotal for every order$/);
  });

  it('prints a short sha in the before and after headers', async () => {
    const snapshot = fixtureSnapshot();
    const sha = 'a'.repeat(40);
    const pullRequests = snapshot.pullRequests.map((entry) => ({
      ...entry,
      evidence: entry.evidence.map((item) => (item.kind === 'red-green' ? { ...item, before: { ...item.before, sha }, after: { ...item.after, sha } } : item)),
    }));
    renderWithCockpit(<PullRequestsView />, { path: '/pull-requests/311', route: ROUTE, snapshot: { ...snapshot, pullRequests } });
    expect(await screen.findByText(/Avant · base/)).toHaveTextContent(`Avant · base ${sha.slice(0, 7)}`);
    expect(screen.queryByText(sha)).not.toBeInTheDocument();
  });

  it('says the file list was not recorded instead of counting zero files', async () => {
    const snapshot = fixtureSnapshot();
    const pullRequests: PullRequestView[] = snapshot.pullRequests.map((entry) => ({ ...entry, files: [] }));
    renderWithCockpit(<PullRequestsView />, { path: '/pull-requests/311', route: ROUTE, snapshot: { ...snapshot, pullRequests } });
    expect(await screen.findByText(/liste des fichiers non enregistrée/)).toBeInTheDocument();
    expect(screen.queryByText(/0 fichier/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Afficher les changements' })).not.toBeInTheDocument();
  });

  it('states that no CI check exists instead of showing 0/0', async () => {
    const snapshot = fixtureSnapshot();
    const pullRequests: PullRequestView[] = snapshot.pullRequests.map((entry) => ({ ...entry, checks: [] }));
    renderWithCockpit(<PullRequestsView />, { path: '/pull-requests/311', route: ROUTE, snapshot: { ...snapshot, pullRequests } });
    expect(await screen.findByText('aucun check')).toBeInTheDocument();
    expect(screen.getByText('Aucun check CI configuré')).toBeInTheDocument();
    expect(screen.queryByText(/0\/0 checks/)).not.toBeInTheDocument();
  });
});
