import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithCockpit } from '../../test/render.tsx';
import { BoardView } from './BoardView.tsx';

describe('BoardView', () => {
  it('shows the three columns with their counts once the snapshot is loaded', async () => {
    renderWithCockpit(<BoardView />);
    const needsYou = await screen.findByRole('region', { name: /Vous concerne/ });
    expect(screen.getByRole('region', { name: /En activité/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Terminé/ })).toBeInTheDocument();
    expect(within(needsYou).getByText('Display the savings of each order in the history list')).toBeInTheDocument();
    expect(within(needsYou).getByText('Merge à ordonner')).toBeInTheDocument();
  });

  it('marks the live implementer card with the agent preview', async () => {
    renderWithCockpit(<BoardView />);
    const inProgress = await screen.findByRole('region', { name: /En activité/ });
    const card = within(inProgress).getByText('Filter the order history by status').closest('a');
    expect(card).not.toBeNull();
    expect(card).toHaveAttribute('href', '/runs/run_7f3a2c');
    expect(within(card ?? document.body).getByText('Claude')).toBeInTheDocument();
  });

  it('filters cards with the search field', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<BoardView />);
    await screen.findByRole('region', { name: /Vous concerne/ });
    await user.type(screen.getByPlaceholderText(/Filtrer par issue/), 'pagination');
    expect(screen.getByText('Paginate the order history endpoint with cursors')).toBeInTheDocument();
    expect(screen.queryByText('Filter the order history by status')).not.toBeInTheDocument();
    expect(screen.getByText(/1 au total/)).toBeInTheDocument();
  });

  it('moves focus between cards with the arrow keys', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<BoardView />);
    const needsYou = await screen.findByRole('region', { name: /Vous concerne/ });
    const cards = within(needsYou).getAllByRole('link');
    const first = cards[0];
    const second = cards[1];
    if (first === undefined || second === undefined) throw new Error('expected at least two cards');
    first.focus();
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    const inProgress = screen.getByRole('region', { name: /En activité/ });
    expect(within(inProgress).getAllByRole('link')[1]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(within(inProgress).getAllByRole('link')[0]).toHaveFocus();
  });

  it('focuses the filter field with the slash key', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<BoardView />);
    await screen.findByRole('region', { name: /Vous concerne/ });
    await user.keyboard('/');
    expect(screen.getByPlaceholderText(/Filtrer par issue/)).toHaveFocus();
  });
});
