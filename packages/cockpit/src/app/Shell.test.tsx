import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithCockpit } from '../test/render.tsx';
import { AppRoutes } from './App.tsx';
import { Shell } from './Shell.tsx';

function renderShell(path = '/') {
  return renderWithCockpit(
    <Shell>
      <AppRoutes />
    </Shell>,
    { path },
  );
}

const LAZY_TIMEOUT = { timeout: 4000 };

describe('Shell', () => {
  it('opens the palette with Ctrl+K and runs a search result with the keyboard', async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findByRole('region', { name: /Vous concerne/ }, LAZY_TIMEOUT);
    await user.keyboard('{Control>}k{/Control}');
    const palette = screen.getByRole('dialog', { name: 'Palette de commandes' });
    const input = within(palette).getByRole('combobox');
    expect(input).toHaveFocus();
    await user.type(input, 'coûts');
    const options = within(palette).getAllByRole('option');
    expect(options[0]).toHaveTextContent('Coûts');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: /Coûts/ }, LAZY_TIMEOUT)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Palette de commandes' })).not.toBeInTheDocument();
  });

  it('moves through palette results with the arrow keys and closes with Escape', async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findByRole('region', { name: /Vous concerne/ }, LAZY_TIMEOUT);
    await user.keyboard('{Meta>}k{/Meta}');
    const palette = screen.getByRole('dialog', { name: 'Palette de commandes' });
    await user.type(within(palette).getByRole('combobox'), 'valider la spec');
    const options = within(palette).getAllByRole('option');
    expect(options[0]).toHaveTextContent('Valider la spec #232');
    expect(options[1]).toHaveTextContent('Valider la spec #231');
    await user.keyboard('{ArrowDown}');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowUp}');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Palette de commandes' })).not.toBeInTheDocument();
  });

  it('runs an action from the palette', async () => {
    const user = userEvent.setup();
    const view = renderShell();
    await screen.findByRole('region', { name: /Vous concerne/ }, LAZY_TIMEOUT);
    await user.keyboard('{Control>}k{/Control}');
    await user.type(screen.getByRole('combobox'), 'lancer le challenge');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(view.transport.commands).toEqual([{ name: 'request.challenge', body: { requestId: 'R-18' } }]));
  });

  it('navigates with the g-then-letter shortcuts', async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findByRole('region', { name: /Vous concerne/ }, LAZY_TIMEOUT);
    await user.keyboard('gi');
    expect(await screen.findByRole('table', { name: 'Issues' }, LAZY_TIMEOUT)).toBeInTheDocument();
  });

  it('mirrors "Vous concerne" in the notification centre', async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findByRole('region', { name: /Vous concerne/ }, LAZY_TIMEOUT);
    await user.click(screen.getByRole('button', { name: /Notifications : 8 éléments vous concernent/ }));
    const panel = screen.getByRole('dialog', { name: 'Vous concerne' });
    expect(within(panel).getAllByRole('link')).toHaveLength(9);
    expect(within(panel).getByText('Merge à ordonner')).toBeInTheDocument();
  });

  it('toggles the theme', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(await screen.findByRole('button', { name: 'Passer au thème clair' }));
    expect(document.documentElement.dataset['theme']).toBe('light');
    await user.click(screen.getByRole('button', { name: 'Passer au thème sombre' }));
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('warns when the event stream is lost', async () => {
    const view = renderShell();
    await screen.findByRole('region', { name: /Vous concerne/ }, LAZY_TIMEOUT);
    act(() => view.transport.handlers?.onDisconnect());
    expect(screen.getByText(/les données affichées peuvent être en retard/)).toBeInTheDocument();
  });
});
