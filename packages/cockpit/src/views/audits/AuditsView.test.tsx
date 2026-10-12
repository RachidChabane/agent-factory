import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithCockpit } from '../../test/render.tsx';
import { AuditsView } from './AuditsView.tsx';

const ROUTE = '/audits/:auditId?';

describe('AuditsView', () => {
  it('shows the challenge on a skill-prompt change with findings per level', async () => {
    renderWithCockpit(<AuditsView />, { path: '/audits/A-15', route: ROUTE });
    expect(await screen.findByRole('heading', { name: 'Tone update for the product-brief skill (#305)' })).toBeInTheDocument();
    expect(screen.getByText(/pas d’une branche factory/)).toBeInTheDocument();
    expect(screen.getByText('Bloque la release storefront-v2.3.1')).toBeInTheDocument();
    expect(screen.getByText('Intention')).toBeInTheDocument();
    expect(screen.getByText('Méthode')).toBeInTheDocument();
    expect(screen.getByText(/Audit A-15: product-brief tone changed without evaluation/)).toBeInTheDocument();
  });

  it('publishes the drafted audit issue', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<AuditsView />, { path: '/audits/A-15', route: ROUTE });
    await user.click(await screen.findByRole('button', { name: 'Publier l’issue d’audit' }));
    await waitFor(() => expect(view.transport.commands).toEqual([{ name: 'audit.publish-issue', body: { auditId: 'A-15' } }]));
  });

  it('resolves an audit with a note', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<AuditsView />, { path: '/audits/A-15', route: ROUTE });
    await user.click(await screen.findByRole('button', { name: 'Marquer résolu' }));
    const dialog = screen.getByRole('dialog', { name: 'Marquer A-15 comme résolu ?' });
    await user.type(within(dialog).getByLabelText('Note de résolution'), 'Ton reverté, cas d’évaluation ajoutés.');
    await user.click(within(dialog).getByRole('button', { name: 'Marquer résolu' }));
    await waitFor(() => expect(view.transport.commands).toEqual([{ name: 'audit.resolve', body: { auditId: 'A-15', note: 'Ton reverté, cas d’évaluation ajoutés.' } }]));
  });

  it('lists audits needing the operator first', async () => {
    renderWithCockpit(<AuditsView />, { path: '/audits', route: ROUTE });
    const list = await screen.findByRole('region', { name: 'Liste des audits' });
    const links = within(list).getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/audits/A-15');
    expect(links).toHaveLength(3);
  });
});
