import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render.tsx';

const AUDIT = 'bfd32d775ee4a53d323db1e3a778b905cf3aa923';

const PAGES = [
  '/',
  '/projects/storefront',
  '/projects/storefront/requests',
  '/projects/storefront/requests/R-15',
  '/projects/storefront/issues',
  '/projects/storefront/issues/45',
  '/projects/storefront/pull-requests',
  '/projects/storefront/pull-requests/57',
  '/projects/storefront/delivery',
  '/projects/storefront/releases',
  '/projects/storefront/releases/1.8.2',
  '/projects/storefront/audits',
  `/projects/storefront/audits/${AUDIT}`,
  '/projects/storefront/knowledge',
  '/projects/storefront/settings',
  '/projects/ledger',
  '/projects/ledger/issues/12',
  '/projects/ledger/pull-requests/22',
  '/runs',
  '/runs/run_7f3a2c',
  '/usage',
  '/settings',
] as const;

describe('the routes of the cockpit', () => {
  it.each(PAGES)('serves %s', async (path) => {
    await renderRoute(path);
    expect(await screen.findAllByRole('heading', { level: 1 })).not.toHaveLength(0);
    expect(screen.queryByText('Page not found')).not.toBeInTheDocument();
    expect(screen.queryByText(/not found$/)).not.toBeInTheDocument();
  });

  it('shows a not-found page, with a heading, for an address that matches nothing', async () => {
    await renderRoute('/nowhere');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
  });

  it('shows a not-found page for an unknown page of a known project', async () => {
    await renderRoute('/projects/storefront/nowhere');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
  });

  it('shows a not-found page for a project the installation does not drive', async () => {
    await renderRoute('/projects/nowhere/issues/12');
    expect(await screen.findByRole('heading', { level: 1, name: 'Project “nowhere” not found' })).toBeInTheDocument();
  });
});
