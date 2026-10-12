import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CockpitSnapshot } from '../contract/index.ts';
import { MINUTE_MS } from '../i18n/formatters.ts';
import { withConfiguration } from '../test/fixtures/mutate.ts';
import { renderInProviders, TEST_NOW } from '../test/harness.tsx';
import { emptySnapshot } from '../test/minimal-snapshot.ts';
import { AppRoutes } from './AppRoutes.tsx';
import { Shell } from './Shell.tsx';

const REFUSED_AT = new Date(TEST_NOW - 3 * MINUTE_MS).toISOString();
const REFUSAL = { at: REFUSED_AT, reason: 'projects.storefront.gate.timeoutMinutes must be a positive number' };

function renderShell(snapshot: CockpitSnapshot, options: { readonly path?: string; readonly locale?: 'en' | 'fr' } = {}) {
  return renderInProviders(
    <Shell>
      <AppRoutes />
    </Shell>,
    { snapshot, ...options },
  );
}

const restartNotice = () => screen.queryByRole('status', { name: 'Settings waiting for a restart' });
const refusalNotice = () => screen.queryByRole('status', { name: 'Configuration file refused' });

describe('configuration banners', () => {
  it('say nothing while nothing waits and the file was not refused', async () => {
    await renderShell(emptySnapshot(TEST_NOW));
    expect(restartNotice()).not.toBeInTheDocument();
    expect(refusalNotice()).not.toBeInTheDocument();
  });

  it('ask for a restart and name the sections that wait for it', async () => {
    await renderShell(withConfiguration(emptySnapshot(TEST_NOW), { restartRequired: ['server', 'projects.storefront.gate'] }));
    const notice = restartNotice();
    expect(notice).toHaveTextContent('Restart the factory to apply: server and projects.storefront.gate');
    expect(within(notice as HTMLElement).getAllByText(/^(server|projects\.storefront\.gate)$/).map((section) => section.tagName)).toEqual(['CODE', 'CODE']);
    expect(refusalNotice()).not.toBeInTheDocument();
  });

  it('name a single section without a conjunction', async () => {
    await renderShell(withConfiguration(emptySnapshot(TEST_NOW), { restartRequired: ['server'] }));
    expect(restartNotice()).toHaveTextContent(/^Restart the factory to apply: server/);
  });

  it('say when the file was refused, why, and that the factory keeps its previous settings', async () => {
    await renderShell(withConfiguration(emptySnapshot(TEST_NOW), { reloadFailure: REFUSAL }));
    const notice = refusalNotice();
    expect(notice).toHaveTextContent('The configuration file was refused at');
    expect(notice).toHaveTextContent('3 min. ago');
    expect(notice).toHaveTextContent(REFUSAL.reason);
    expect(notice).toHaveTextContent('The factory keeps its previous settings.');
    expect(restartNotice()).not.toBeInTheDocument();
    const time = within(notice as HTMLElement).getAllByText(/./, { selector: 'time' })[0];
    expect(time).toHaveAttribute('datetime', REFUSED_AT);
    expect(time).toHaveAttribute('title', expect.stringContaining('2026'));
  });

  it('show both notices when the file was refused and an earlier edit still waits for a restart', async () => {
    await renderShell(withConfiguration(emptySnapshot(TEST_NOW), { restartRequired: ['server'], reloadFailure: REFUSAL }));
    expect(restartNotice()).toBeInTheDocument();
    expect(refusalNotice()).toBeInTheDocument();
  });

  it('link to the settings, where the file is described', async () => {
    await renderShell(withConfiguration(emptySnapshot(TEST_NOW), { restartRequired: ['server'] }));
    expect(within(restartNotice() as HTMLElement).getByRole('link', { name: 'Open the settings' })).toHaveAttribute('href', '/settings');
  });

  it('offer no link to the page the operator is already on', async () => {
    await renderShell(withConfiguration(emptySnapshot(TEST_NOW), { restartRequired: ['server'] }), { path: '/settings' });
    expect(restartNotice()).toBeInTheDocument();
    expect(within(restartNotice() as HTMLElement).queryByRole('link')).not.toBeInTheDocument();
  });

  it('appear on every page of the cockpit', async () => {
    await renderShell(withConfiguration(emptySnapshot(TEST_NOW), { restartRequired: ['server'] }), { path: '/runs' });
    expect(restartNotice()).toBeInTheDocument();
  });

  it('are written in French', async () => {
    await renderShell(withConfiguration(emptySnapshot(TEST_NOW), { restartRequired: ['server', 'projects.storefront.gate'], reloadFailure: REFUSAL }), { locale: 'fr' });
    expect(screen.getByRole('status', { name: 'Réglages en attente d’un redémarrage' })).toHaveTextContent('Redémarrez l’usine pour appliquer : server et projects.storefront.gate');
    const refusal = screen.getByRole('status', { name: 'Fichier de configuration refusé' });
    expect(refusal).toHaveTextContent('Le fichier de configuration a été refusé le');
    expect(refusal).toHaveTextContent('il y a 3 min');
    expect(refusal).toHaveTextContent('L’usine conserve ses réglages précédents.');
    expect(within(refusal).getByRole('link', { name: 'Ouvrir les réglages' })).toBeInTheDocument();
  });
});
