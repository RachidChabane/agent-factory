import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithCockpit } from '../../test/render.tsx';
import { KnowledgeView } from './KnowledgeView.tsx';

const SEARCH_PLACEHOLDER = 'Rechercher dans les connaissances…';

describe('KnowledgeView', () => {
  it('shows the refresh age and the product map first', async () => {
    renderWithCockpit(<KnowledgeView />);
    expect(await screen.findByText('Mis à jour il y a 3 h')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Carte produit/ })).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('Background workers')).toBeInTheDocument();
    expect(within(panel).getByText('assistant/skills')).toBeInTheDocument();
  });

  it('shows counts on every tab', async () => {
    renderWithCockpit(<KnowledgeView />);
    await screen.findByRole('tablist');
    expect(screen.getByRole('tab', { name: /Carte produit\s*5/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Écrans\s*5/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Décisions\s*5/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Sources\s*5/ })).toBeInTheDocument();
  });

  it('switches tabs and resolves the area name of each screen', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<KnowledgeView />);
    await user.click(await screen.findByRole('tab', { name: /Écrans/ }));
    const table = screen.getByRole('table', { name: 'Écrans' });
    expect(within(table).getByText('/orders')).toBeInTheDocument();
    expect(within(table).getAllByText('Web storefront').length).toBeGreaterThan(0);
  });

  it('lists decisions newest first with their status', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<KnowledgeView />);
    await user.click(await screen.findByRole('tab', { name: /Décisions/ }));
    const ids = screen.getAllByText(/^ADR-\d+$/).map((node) => node.textContent);
    expect(ids).toEqual(['ADR-0015', 'ADR-0014', 'ADR-0013', 'ADR-0012', 'ADR-0011']);
    expect(screen.getByText('Proposée')).toBeInTheDocument();
    expect(screen.getByText('Remplacée')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Lire/ })).toHaveLength(5);
  });

  it('renders http locations as links and others as plain text', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<KnowledgeView />);
    await user.click(await screen.findByRole('tab', { name: /Sources/ }));
    const table = screen.getByRole('table', { name: 'Sources' });
    expect(within(table).getByRole('link', { name: 'https://github.com/example-org/storefront' })).toBeInTheDocument();
    expect(within(table).getByText('Slack').closest('a')).toBeNull();
  });

  it('filters every tab with the search field', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<KnowledgeView />);
    await user.type(await screen.findByPlaceholderText(SEARCH_PLACEHOLDER), 'pagination');
    expect(screen.getByRole('tab', { name: /Décisions\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Carte produit\s*0/ })).toBeInTheDocument();
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Décisions/ }));
    expect(screen.getByText('Cursor-based pagination for list endpoints')).toBeInTheDocument();
    expect(screen.queryByText('Product briefs use a neutral, factual register')).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<KnowledgeView />);
    await user.type(await screen.findByPlaceholderText(SEARCH_PLACEHOLDER), 'zzzzzz');
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
    expect(screen.getByText(/Rien ne correspond à « zzzzzz »/)).toBeInTheDocument();
  });
});
