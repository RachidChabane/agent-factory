import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand } from '../../test/commands.ts';
import { CONFIGURATION_PATH } from '../../test/fixtures/installation.ts';
import { withConfiguration } from '../../test/fixtures/mutate.ts';
import { fixtureSnapshot } from '../../test/render.tsx';
import { openInstallationSettings, withInstallationSettings } from './settings-test-support.ts';

const section = (name: string) => screen.getByRole('region', { name });

describe('InstallationSettingsView page', () => {
  it('lays out the sections of the installation in a fixed order, the configuration file last', async () => {
    await openInstallationSettings();
    const titles = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(titles).toEqual(['Installation', 'Default roles', 'Machine resources', 'Budget caps', 'Notification channels', 'Remote access', 'Tools', 'Configuration file']);
  });

  it('says once what the dollar figures of the page mean', async () => {
    await openInstallationSettings();
    expect(screen.getByText('Dollar figures are API-equivalent prices')).toBeInTheDocument();
  });

});

describe('InstallationSettingsView facts', () => {
  it('shows the version, the mode, the operator, the public address and when the factory started', async () => {
    await openInstallationSettings();
    const installation = section('Installation');
    const value = (label: string) => within(installation).getByText(label).closest('div')?.querySelector('dd');
    expect(value('Version')).toHaveTextContent('0.1.0');
    expect(value('Mode')).toHaveTextContent('Live');
    expect(value('Operator')).toHaveTextContent('Alex Morgan');
    expect(value('Started')).toHaveTextContent('Oct 8, 2026, 4:00 AM (4 days ago)');
  });

  it('opens the public address in a new tab', async () => {
    await openInstallationSettings();
    const link = within(section('Installation')).getByRole('link', { name: 'https://factory.example.com' });
    expect(link).toHaveAttribute('href', 'https://factory.example.com');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('gives the exact start time when the age is hovered', async () => {
    await openInstallationSettings();
    expect(within(section('Installation')).getByText('4 days ago')).toHaveAttribute('title', 'October 8, 2026 at 4:00:00 AM UTC');
  });

  it('says that the start time is not reported rather than inventing one', async () => {
    const snapshot = { ...fixtureSnapshot(), installation: { ...fixtureSnapshot().installation, startedAt: null } };
    await openInstallationSettings({ snapshot });
    expect(within(section('Installation')).getByText('The start time is not reported.')).toBeInTheDocument();
  });

  it.each([
    ['demo', 'Demo'],
    ['rehearsal', 'Rehearsal'],
  ] as const)('names the %s mode', async (mode, word) => {
    const snapshot = { ...fixtureSnapshot(), installation: { ...fixtureSnapshot().installation, mode } };
    await openInstallationSettings({ snapshot });
    expect(within(section('Installation')).getByText(word)).toBeInTheDocument();
  });

  it('counts the run slots: the limit, those running and those waited for', async () => {
    await openInstallationSettings();
    const slots = within(section('Installation')).getByRole('list', { name: 'Run slots' });
    expect(within(slots).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Run slot limit3', 'Running2', 'Waiting for a slot1']);
  });
});

describe('InstallationSettingsView notification channels', () => {
  it('lists each channel and whether its secret is set', async () => {
    await openInstallationSettings();
    const channels = within(section('Notification channels')).getByRole('list', { name: 'Notification channels' });
    const items = within(channels).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Desktop notificationConfigured',
      'SlackConfigured',
      'Google ChatNot configuredThe environment variable that holds its secret is not set.',
      'WebhookConfigured',
    ]);
  });

  it('explains what configured means, and offers no command', async () => {
    await openInstallationSettings();
    const channels = section('Notification channels');
    expect(channels).toHaveTextContent('A channel is configured when the environment variable that holds its secret is set.');
    expect(within(channels).queryByRole('button')).not.toBeInTheDocument();
  });

  it('says that no channel is known', async () => {
    await openInstallationSettings({ snapshot: withInstallationSettings((settings) => ({ ...settings, notifications: [] })) });
    expect(screen.getByText('No notification channel is known.')).toBeInTheDocument();
  });
});

describe('InstallationSettingsView remote access', () => {
  it('says what Tailscale access means', async () => {
    await openInstallationSettings();
    const access = section('Remote access');
    expect(access).toHaveTextContent('Tailscale');
    expect(access).toHaveTextContent('The cockpit is also reachable through your Tailscale network, for requests that carry a Tailscale identity.');
  });

  it('says that without remote access the cockpit answers on this machine only', async () => {
    await openInstallationSettings({ snapshot: withInstallationSettings((settings) => ({ ...settings, remoteAccess: 'none' })) });
    expect(section('Remote access')).toHaveTextContent('None');
    expect(section('Remote access')).toHaveTextContent('The cockpit is reachable from this machine only.');
  });
});

describe('InstallationSettingsView tools', () => {
  it('lists the tools of the installation with their status, and marks an old check stale', async () => {
    await openInstallationSettings();
    const tools = section('Tools');
    expect(tools).toHaveTextContent('4 of 4 connected');
    expect(within(within(tools).getByRole('listitem', { name: 'git' })).getByText('Connected')).toBeInTheDocument();
    expect(within(within(tools).getByRole('listitem', { name: 'tailscale' })).getByText('Stale')).toBeInTheDocument();
  });

  it('checks a tool of the installation with a null project', async () => {
    const view = await openInstallationSettings();
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Check git' }), view.transport, 'tools.check', { project: null, tool: 'git' });
  });

  it('checks another tool with a null project too', async () => {
    const view = await openInstallationSettings();
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Check tailscale' }), view.transport, 'tools.check', { project: null, tool: 'tailscale' });
  });

  it('says that a tool of the installation was never checked', async () => {
    const snapshot = { ...fixtureSnapshot(), tools: fixtureSnapshot().tools.map((tool) => (tool.name === 'sandbox' ? { ...tool, status: null, version: null, detail: null, checkedAt: null } : tool)) };
    await openInstallationSettings({ snapshot });
    expect(within(section('Tools')).getByRole('listitem', { name: 'sandbox' })).toHaveTextContent('Never checked');
  });
});

describe('InstallationSettingsView configuration file', () => {
  it('shows where the factory reads its settings from, and that nothing waits', async () => {
    await openInstallationSettings();
    const file = section('Configuration file');
    expect(file).toHaveTextContent(CONFIGURATION_PATH);
    expect(file).toHaveTextContent('No setting waits for a restart.');
    expect(file).toHaveTextContent('The factory has not refused the file.');
  });

  it('shows the sections that wait for a restart and why the last reload was refused', async () => {
    const snapshot = withConfiguration(fixtureSnapshot(), {
      restartRequired: ['server', 'projects.storefront.gate'],
      reloadFailure: { at: '2026-10-12T09:40:00.000Z', reason: 'projects[0].gate.timeoutMinutes: must be a positive number of minutes' },
    });
    await openInstallationSettings({ snapshot });
    const file = section('Configuration file');
    expect(file).toHaveTextContent(CONFIGURATION_PATH);
    expect(within(file).getByText('server')).toBeInTheDocument();
    expect(within(file).getByText('projects.storefront.gate')).toBeInTheDocument();
    expect(file).not.toHaveTextContent('No setting waits for a restart.');
    expect(file).toHaveTextContent('projects[0].gate.timeoutMinutes: must be a positive number of minutes');
    expect(file).toHaveTextContent('The factory keeps its previous settings.');
  });
});

describe('InstallationSettingsView in French', () => {
  it('writes the page, the facts and the sections in French', async () => {
    await openInstallationSettings({ locale: 'fr' });
    const titles = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(titles.slice(0, 7)).toEqual(['Installation', 'Rôles par défaut', 'Ressources de la machine', 'Plafonds de budget', 'Canaux de notification', 'Accès à distance', 'Outils']);
    const installation = section('Installation');
    expect(installation).toHaveTextContent('Production');
    expect(installation).toHaveTextContent('il y a 4 j');
    expect(installation).toHaveTextContent('Limite de créneaux de run3');
    expect(section('Canaux de notification')).toHaveTextContent('Non configuré');
    expect(section('Accès à distance')).toHaveTextContent('Le cockpit est aussi accessible par votre réseau Tailscale');
  });

  it('says that the start time is not reported, in French', async () => {
    const snapshot = { ...fixtureSnapshot(), installation: { ...fixtureSnapshot().installation, startedAt: null } };
    await openInstallationSettings({ snapshot, locale: 'fr' });
    expect(screen.getByText('L’heure de démarrage n’est pas communiquée.')).toBeInTheDocument();
  });
});
