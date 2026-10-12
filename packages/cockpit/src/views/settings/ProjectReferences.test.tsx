import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BRAND_ASSETS_FAILURE, READY_SNAPSHOT_COMMIT, ICON_SET_COMMIT } from '../../test/fixtures/storefront/references.ts';
import { LEDGER, openProjectSettings, STOREFRONT } from './settings-test-support.ts';

const section = (name: string) => screen.getByRole('region', { name });
const referenceList = (name = 'Reference repositories') => within(section(name)).getByRole('list', { name });
const reference = (name: string) => within(referenceList()).getByRole('listitem', { name });

describe('ProjectSettingsView references', () => {
  it('lists each repository the project cites with its ref, the commit it resolved to and the state of its snapshot', async () => {
    await openProjectSettings();
    const tokens = reference('design-tokens');

    expect(tokens).toHaveTextContent('example-org/design-tokens @ v2.4.0');
    expect(within(tokens).getByText(READY_SNAPSHOT_COMMIT.slice(0, 7))).toHaveAttribute('title', READY_SNAPSHOT_COMMIT);
    expect(tokens).toHaveTextContent('Snapshot ready');
    expect(within(referenceList()).getAllByRole('listitem').map((item) => item.getAttribute('aria-label'))).toEqual(['design-tokens', 'legacy-checkout', 'icon-set', 'brand-assets', 'copy-deck']);
  });

  it('says what a snapshot that is not ready is waiting for', async () => {
    await openProjectSettings();
    const notBuilt = reference('icon-set');
    const missing = reference('brand-assets');

    expect(notBuilt).toHaveTextContent('Snapshot not built');
    expect(within(notBuilt).getByText(ICON_SET_COMMIT.slice(0, 7))).toBeInTheDocument();
    expect(notBuilt).toHaveTextContent('The snapshot is built when the factory starts, or by agent-factory validate.');
    expect(missing).toHaveTextContent('Ref missing from the source');
    expect(missing).toHaveTextContent('Run git fetch --tags in it, then restart the factory.');
    expect(within(missing).getByText('—')).toBeInTheDocument();
    expect(within(reference('design-tokens')).queryByText(/Run git fetch/)).not.toBeInTheDocument();
  });

  it('shows when each state was read, marks an old reading stale and spells out why the last read failed', async () => {
    await openProjectSettings();

    expect(within(reference('legacy-checkout')).getByText(/^Read 2 min/)).toBeInTheDocument();
    expect(within(reference('legacy-checkout')).queryByText('Stale')).not.toBeInTheDocument();
    expect(within(reference('brand-assets')).getByText(/^Read 40 min/)).toBeInTheDocument();
    expect(within(reference('brand-assets')).getByText('Stale')).toBeInTheDocument();
    expect(within(reference('brand-assets')).getByText(new RegExp(`The last read failed \\(${BRAND_ASSETS_FAILURE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`))).toBeInTheDocument();
  });

  it('says that a snapshot was never read', async () => {
    await openProjectSettings();
    const unread = reference('copy-deck');

    expect(unread).toHaveTextContent('The snapshot has not been read yet.');
    expect(within(unread).getByText('Not read yet')).toBeInTheDocument();
    expect(within(unread).getByText('—')).toBeInTheDocument();
  });

  it('says that a project cites no reference repository', async () => {
    await openProjectSettings(LEDGER);

    expect(within(section('Reference repositories')).getByText('This project cites no reference repository.')).toBeInTheDocument();
    expect(within(section('Reference repositories')).queryByRole('list')).not.toBeInTheDocument();
  });

  it('only shows the references: it has no button to press', async () => {
    await openProjectSettings(STOREFRONT);

    expect(within(section('Reference repositories')).queryAllByRole('button')).toEqual([]);
  });

  it('speaks French', async () => {
    await openProjectSettings(STOREFRONT, { locale: 'fr' });
    const list = within(section('Dépôts de référence')).getByRole('list', { name: 'Dépôts de référence' });

    expect(within(list).getByRole('listitem', { name: 'design-tokens' })).toHaveTextContent('Instantané prêt');
    expect(within(list).getByRole('listitem', { name: 'icon-set' })).toHaveTextContent('Instantané non construit');
    expect(within(list).getByRole('listitem', { name: 'brand-assets' })).toHaveTextContent('Ref absente de la source');
    expect(within(list).getByRole('listitem', { name: 'brand-assets' })).toHaveTextContent('Lancez git fetch --tags dedans, puis redémarrez l’usine.');
    expect(within(list).getByRole('listitem', { name: 'copy-deck' })).toHaveTextContent('L’instantané n’a pas encore été relevé.');
  });
});
