import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithCockpit } from '../../test/render.tsx';
import { ReleasesView } from './ReleasesView.tsx';

const ROUTE = '/releases/:releaseId?';

describe('ReleasesView', () => {
  it('shows the blocked gate with its translated blocking reason', async () => {
    renderWithCockpit(<ReleasesView />, { path: '/releases/storefront-v2.3.1', route: ROUTE });
    expect(await screen.findByText('Non promouvable')).toBeInTheDocument();
    const reasons = screen.getByRole('list', { name: 'Raisons bloquantes' });
    expect(within(reasons).getByText('Audit « à challenger » ouvert sur le commit e27b4d9')).toBeInTheDocument();
    expect(screen.getByText('1 audit ouvert : A-15')).toBeInTheDocument();
  });

  it('links to the production workflow without any deploy button', async () => {
    renderWithCockpit(<ReleasesView />, { path: '/releases/storefront-v2.3.1', route: ROUTE });
    const link = await screen.findByRole('link', { name: /Ouvrir le workflow de production/ });
    expect(link).toHaveAttribute('href', 'https://github.com/example-org/storefront/actions/workflows/deploy-prod.yml');
    expect(screen.queryByRole('button', { name: /[Dd]éployer/ })).not.toBeInTheDocument();
  });

  it('re-evaluates the gate on order', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<ReleasesView />, { path: '/releases/storefront-v2.3.1', route: ROUTE });
    await user.click(await screen.findByRole('button', { name: 'Réévaluer le gate' }));
    await waitFor(() => expect(view.transport.commands).toEqual([{ name: 'release.evaluate', body: { releaseId: 'storefront-v2.3.1' } }]));
  });

  it('cuts the open release on order', async () => {
    const user = userEvent.setup();
    const view = renderWithCockpit(<ReleasesView />, { path: '/releases/storefront-v2.4.0', route: ROUTE });
    await user.click(await screen.findByRole('button', { name: 'Couper la release' }));
    await waitFor(() => expect(view.transport.commands).toEqual([{ name: 'release.cut', body: { releaseId: 'storefront-v2.4.0' } }]));
  });

  it('lists every commit with its attribution and audit verdict', async () => {
    renderWithCockpit(<ReleasesView />, { path: '/releases/storefront-v2.3.1', route: ROUTE });
    expect(await screen.findByText('Tone update for the product-brief skill (#305)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /A-15 · À challenger/ })).toBeInTheDocument();
    expect(screen.getAllByText('Usine')).toHaveLength(2);
  });
});
