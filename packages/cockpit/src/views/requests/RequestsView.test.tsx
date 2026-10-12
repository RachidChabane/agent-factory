import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithCockpit } from '../../test/render.tsx';
import { RequestsView } from './RequestsView.tsx';

const ROUTE = '/requests/:requestId?';

describe('RequestsView', () => {
  it('shows the challenge report with one card per item and the verdict summary', async () => {
    renderWithCockpit(<RequestsView />, { path: '/requests/R-17', route: ROUTE });
    expect(await screen.findByRole('heading', { name: /Rapport de challenge · 8 points/ })).toBeInTheDocument();
    expect(screen.getByText('Reorder an order in one click')).toBeInTheDocument();
    expect(screen.getByText(/Will the recipients all have a Storefront account/)).toBeInTheDocument();
    const summary = screen.getByRole('list', { name: 'Répartition des verdicts' });
    expect(within(summary).getByText(/garder/)).toBeInTheDocument();
    expect(screen.getAllByText('État actuel')).toHaveLength(8);
  });

  it('copies the draft reply', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<RequestsView />, { path: '/requests/R-17', route: ROUTE });
    await user.click(await screen.findByRole('button', { name: 'Copier la réponse' }));
    expect(await navigator.clipboard.readText()).toContain('Hi Dana');
    expect(await screen.findByRole('button', { name: 'Copié' })).toBeInTheDocument();
  });

  it('creates issues only from the specs the operator keeps', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<RequestsView />, { path: '/requests/R-17', route: ROUTE });
    expect(await screen.findByRole('button', { name: 'Créer 5 issues' })).toBeEnabled();
    await user.click(screen.getByRole('checkbox', { name: 'Retenir la spec Export order metadata as CSV' }));
    await user.click(screen.getByRole('button', { name: 'Créer 4 issues' }));
    await waitFor(() => expect(view.transport.commands).toHaveLength(1));
    expect(view.transport.commands[0]).toEqual({
      name: 'request.accept',
      body: { requestId: 'R-17', specIds: ['spec-reorder', 'spec-label', 'spec-search-index', 'spec-bulk-hide'] },
    });
  });

  it('edits a proposed spec before validation', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<RequestsView />, { path: '/requests/R-17', route: ROUTE });
    await user.click(await screen.findByRole('button', { name: 'Modifier la spec Hide several orders at once with undo' }));
    const form = screen.getByRole('form', { name: 'Modifier la spec Hide several orders at once with undo' });
    const title = within(form).getByLabelText('Titre');
    await user.clear(title);
    await user.type(title, 'Hide several orders at once');
    await user.click(within(form).getByRole('button', { name: 'Enregistrer la spec' }));
    await waitFor(() => expect(view.transport.commands).toHaveLength(1));
    expect(view.transport.commands[0]).toMatchObject({ name: 'request.update-spec', body: { requestId: 'R-17', specId: 'spec-bulk-hide', spec: { title: 'Hide several orders at once', type: 'ui' } } });
  });

  it('starts the challenge of a received request', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<RequestsView />, { path: '/requests/R-18', route: ROUTE });
    await user.click(await screen.findByRole('button', { name: 'Lancer le challenge' }));
    await waitFor(() => expect(view.transport.commands).toEqual([{ name: 'request.challenge', body: { requestId: 'R-18' } }]));
  });

  it('requires a reason to decline', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<RequestsView />, { path: '/requests/R-18', route: ROUTE });
    await user.click(await screen.findByRole('button', { name: 'Décliner' }));
    const dialog = screen.getByRole('dialog', { name: 'Décliner R-18 ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Décliner la demande' }));
    expect(within(dialog).getByText('Expliquez pourquoi la demande est déclinée.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Raison'), 'Out of scope for the storefront.');
    await user.click(within(dialog).getByRole('button', { name: 'Décliner la demande' }));
    await waitFor(() => expect(view.transport.commands).toEqual([{ name: 'request.decline', body: { requestId: 'R-18', reason: 'Out of scope for the storefront.' } }]));
  });

  it('records a new pasted request', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<RequestsView />, { path: '/requests?nouvelle=1', route: ROUTE });
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle demande' });
    await user.type(within(dialog).getByLabelText('Titre'), 'Offline wishlist');
    await user.type(within(dialog).getByLabelText('Demandeur'), 'Dana Reyes');
    await user.type(within(dialog).getByLabelText('Texte de la demande'), 'Let customers browse their wishlist without a connection.');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer la demande' }));
    await waitFor(() =>
      expect(view.transport.commands).toEqual([
        { name: 'request.create', body: { title: 'Offline wishlist', requester: 'Dana Reyes', body: 'Let customers browse their wishlist without a connection.', attachments: [] } },
      ]),
    );
  });
});
