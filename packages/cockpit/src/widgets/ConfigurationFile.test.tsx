import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../i18n/formatters.ts';
import { CONFIGURATION_PATH } from '../test/fixtures/installation.ts';
import { renderWidget, TEST_NOW } from '../test/harness.tsx';
import type { ConfigurationState } from './ConfigurationFile.tsx';
import { ConfigurationFile } from './ConfigurationFile.tsx';

const QUIET: ConfigurationState = { path: CONFIGURATION_PATH, restartRequired: [], reloadFailure: null };
const REFUSED_AT = new Date(TEST_NOW - 12 * MINUTE_MS).toISOString();

const section = () => screen.getByRole('region', { name: 'Configuration file' });
const row = (label: string) => within(section()).getByText(label).closest('div') as HTMLElement;

describe('ConfigurationFile', () => {
  it('names the file the factory reads its settings from, with a way to copy its path', async () => {
    await renderWidget(<ConfigurationFile configuration={QUIET} />);
    expect(row('Path')).toHaveTextContent(CONFIGURATION_PATH);
    expect(within(row('Path')).getByRole('button', { name: 'Copy the path' })).toBeInTheDocument();
  });

  it('says that nothing waits for a restart and that the file was not refused, rather than staying silent', async () => {
    await renderWidget(<ConfigurationFile configuration={QUIET} />);
    expect(row('Waiting for a restart')).toHaveTextContent('No setting waits for a restart.');
    expect(row('Last reload')).toHaveTextContent('The factory has not refused the file.');
  });

  it('lists every section that applies only after a restart', async () => {
    await renderWidget(<ConfigurationFile configuration={{ ...QUIET, restartRequired: ['server', 'projects.storefront.gate'] }} />);
    const pending = row('Waiting for a restart');
    expect(pending).toHaveTextContent('apply only once the factory restarts');
    expect(within(pending).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['server', 'projects.storefront.gate']);
    expect(pending).not.toHaveTextContent('No setting waits for a restart.');
  });

  it('gives the time and the reason a hand edit was refused and says the previous settings stay in force', async () => {
    await renderWidget(<ConfigurationFile configuration={{ ...QUIET, reloadFailure: { at: REFUSED_AT, reason: 'unknown key projects.storefront.gates' } }} />);
    const reload = row('Last reload');
    expect(reload).toHaveTextContent('Refused at');
    expect(reload).toHaveTextContent('12 min. ago');
    expect(reload).toHaveTextContent('unknown key projects.storefront.gates');
    expect(reload).toHaveTextContent('The factory keeps its previous settings.');
    expect(reload).not.toHaveTextContent('The factory has not refused the file.');
    expect(within(reload).getAllByText(/./, { selector: 'time' })[0]).toHaveAttribute('datetime', REFUSED_AT);
  });

  it('is written in French', async () => {
    await renderWidget(<ConfigurationFile configuration={{ ...QUIET, restartRequired: ['server'] }} />, { locale: 'fr' });
    const french = screen.getByRole('region', { name: 'Fichier de configuration' });
    expect(within(french).getByText('Chemin')).toBeInTheDocument();
    expect(within(french).getByText('En attente d’un redémarrage')).toBeInTheDocument();
    expect(within(french).getByText('L’usine n’a pas refusé le fichier.')).toBeInTheDocument();
  });
});
