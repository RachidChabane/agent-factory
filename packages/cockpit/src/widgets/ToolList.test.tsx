import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ToolSessionView, ToolView } from '../contract/index.ts';
import { HOUR_MS, MINUTE_MS } from '../i18n/formatters.ts';
import { clickAndExpectCommand } from '../test/commands.ts';
import { renderWidget, TEST_NOW } from '../test/harness.tsx';
import { ToolList } from './ToolList.tsx';

const checkedAgo = (offset: number) => new Date(TEST_NOW - offset).toISOString();

const GIT: ToolView = {
  name: 'git',
  scope: 'installation',
  builtIn: true,
  description: null,
  status: 'connected',
  version: '2.51.0',
  detail: 'git version 2.51.0',
  fixCommand: null,
  installHint: null,
  checkedAt: checkedAgo(5 * MINUTE_MS),
  loginCommand: null,
  lastLogin: null,
  keepAlive: null,
};
const CLOUD: ToolView = {
  name: 'cloud',
  scope: 'installation',
  builtIn: false,
  description: 'Deploys the preview environments',
  status: 'unauthenticated',
  version: null,
  detail: 'The session expired',
  fixCommand: 'cloud auth login',
  installHint: 'https://example.com/cloud-cli',
  checkedAt: checkedAgo(20 * HOUR_MS),
  loginCommand: null,
  lastLogin: null,
  keepAlive: null,
};
const TRACKER: ToolView = {
  name: 'tracker',
  scope: 'installation',
  builtIn: false,
  description: null,
  status: null,
  version: null,
  detail: null,
  fixCommand: null,
  installHint: null,
  checkedAt: null,
  loginCommand: null,
  lastLogin: null,
  keepAlive: null,
};

const SESSION: ToolSessionView = { at: checkedAgo(3 * HOUR_MS), outcome: 'succeeded', detail: 'exit code 0 after 3 s', operator: 'Alex Morgan' };
const SIGN_IN: ToolView = {
  ...CLOUD,
  name: 'sso-cli',
  loginCommand: 'sso-cli login --browser',
  lastLogin: SESSION,
  keepAlive: { command: 'sso-cli whoami', everyMinutes: 30, last: { at: checkedAgo(12 * MINUTE_MS), outcome: 'failed', detail: 'the session expired', operator: 'factory' } },
};
const LOGIN_NEVER_RUN: ToolView = { ...SIGN_IN, name: 'vpn', loginCommand: 'vpn up', lastLogin: null, keepAlive: { command: 'vpn status', everyMinutes: 60, last: null } };

describe('ToolList', () => {
  it('shows each tool with its status, version and the age of its last check', async () => {
    await renderWidget(<ToolList tools={[GIT, CLOUD, TRACKER]} project={null} />);
    const git = screen.getByRole('listitem', { name: 'git' });
    expect(within(git).getByText('Connected')).toBeInTheDocument();
    expect(within(git).getByText('2.51.0')).toBeInTheDocument();
    expect(within(git).getByText(/^Checked 5 min/)).toBeInTheDocument();
    expect(within(git).getByText('Built in')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 connected')).toBeInTheDocument();
  });

  it('says that a tool was never checked instead of inventing a status', async () => {
    await renderWidget(<ToolList tools={[TRACKER]} project={null} />);
    const tracker = screen.getByRole('listitem', { name: 'tracker' });
    expect(within(tracker).getByText('Never checked')).toBeInTheDocument();
    expect(within(tracker).getByText('No result has been recorded for this tool yet.')).toBeInTheDocument();
    expect(within(tracker).getByText('Version not reported')).toBeInTheDocument();
    expect(within(tracker).queryByText(/^Checked/)).not.toBeInTheDocument();
  });

  it('shows how to fix a tool that is not signed in, and marks an old check stale', async () => {
    await renderWidget(<ToolList tools={[CLOUD]} project={null} />);
    const cloud = screen.getByRole('listitem', { name: 'cloud' });
    expect(within(cloud).getByText('Not signed in')).toBeInTheDocument();
    expect(within(cloud).getByText('cloud auth login')).toBeInTheDocument();
    expect(within(cloud).getByText(/https:\/\/example\.com\/cloud-cli/)).toBeInTheDocument();
    expect(within(cloud).getByText('Stale')).toBeInTheDocument();
  });

  it('checks an installation tool with a null project and a project tool with its project', async () => {
    const installation = await renderWidget(<ToolList tools={[GIT]} project={null} />);
    await clickAndExpectCommand(installation.user, screen.getByRole('button', { name: 'Check git' }), installation.transport, 'tools.check', { project: null, tool: 'git' });
    installation.unmount();
    const project = await renderWidget(<ToolList tools={[{ ...GIT, scope: 'project' }]} project="storefront" />);
    await clickAndExpectCommand(project.user, screen.getByRole('button', { name: 'Check git' }), project.transport, 'tools.check', { project: 'storefront', tool: 'git' });
  });

  it('says that no tool is configured', async () => {
    await renderWidget(<ToolList tools={[]} project="ledger" />);
    expect(screen.getByText('No tool is configured.')).toBeInTheDocument();
  });

  describe('login', () => {
    it('offers to log in to a tool that declares a login, and says which command it starts on the factory machine', async () => {
      await renderWidget(<ToolList tools={[SIGN_IN]} project={null} />);
      const row = screen.getByRole('listitem', { name: 'sso-cli' });
      const login = within(row).getByRole('button', { name: 'Log in to sso-cli' });
      expect(login).toHaveAttribute('title', 'Starts sso-cli login --browser on the factory’s machine.');
      expect(row).toHaveTextContent('Starts sso-cli login --browser on the factory’s machine.');
    });

    it('sends tools.login with the tool, for the installation or for its project', async () => {
      const installation = await renderWidget(<ToolList tools={[SIGN_IN]} project={null} />);
      await clickAndExpectCommand(installation.user, screen.getByRole('button', { name: 'Log in to sso-cli' }), installation.transport, 'tools.login', { project: null, tool: 'sso-cli' });
      installation.unmount();
      const project = await renderWidget(<ToolList tools={[{ ...SIGN_IN, scope: 'project' }]} project="storefront" />);
      await clickAndExpectCommand(project.user, screen.getByRole('button', { name: 'Log in to sso-cli' }), project.transport, 'tools.login', { project: 'storefront', tool: 'sso-cli' });
    });

    it('shows what the factory says it did, and its refusal when the tool declares no login', async () => {
      const view = await renderWidget(<ToolList tools={[SIGN_IN]} project={null} />);
      view.transport.effects.set('tools.login', 'sso-cli: login succeeded (exit code 0 after 3 s); the tool is now connected');
      await view.user.click(screen.getByRole('button', { name: 'Log in to sso-cli' }));
      expect(await within(screen.getByRole('status')).findByText('sso-cli: login succeeded (exit code 0 after 3 s); the tool is now connected')).toBeInTheDocument();
      view.transport.commandFailure = 'sso-cli declares no login';
      await view.user.click(screen.getByRole('button', { name: 'Log in to sso-cli' }));
      expect(await within(screen.getByRole('alert')).findByText('sso-cli declares no login')).toBeInTheDocument();
    });

    it('is disabled while the login runs', async () => {
      const view = await renderWidget(<ToolList tools={[SIGN_IN]} project={null} />);
      const release = view.transport.holdCommands();
      await view.user.click(screen.getByRole('button', { name: 'Log in to sso-cli' }));
      expect(await screen.findByRole('button', { name: 'Log in to sso-cli' })).toBeDisabled();
      release();
      await screen.findByRole('button', { name: 'Log in to sso-cli' });
      expect(view.transport.commands).toHaveLength(1);
    });

    it('offers no login for a tool that declares none', async () => {
      await renderWidget(<ToolList tools={[GIT, CLOUD]} project={null} />);
      expect(screen.queryByRole('button', { name: /^Log in/ })).not.toBeInTheDocument();
      expect(screen.queryByText('Last login')).not.toBeInTheDocument();
    });

    it('shows the last login with how it ended, when and by whom, and the last keep-alive run', async () => {
      await renderWidget(<ToolList tools={[SIGN_IN]} project={null} />);
      const row = screen.getByRole('listitem', { name: 'sso-cli' });
      const login = within(row).getByText('Last login').closest('p') as HTMLElement;
      expect(login).toHaveTextContent('Succeeded');
      expect(login).toHaveTextContent(/3 hr\. ago/);
      expect(login).toHaveTextContent('by Alex Morgan');
      expect(login).toHaveTextContent('exit code 0 after 3 s');
      expect(within(login).getByText(/3 hr\. ago/)).toHaveAttribute('title', expect.stringContaining('2026'));
      expect(within(row).getByText('Kept alive').closest('p')).toHaveTextContent('sso-cli whoami, every 30 min');
      const keepAlive = within(row).getByText('Last run').closest('p') as HTMLElement;
      expect(keepAlive).toHaveTextContent('Failed');
      expect(keepAlive).toHaveTextContent(/12 min\. ago/);
      expect(keepAlive).toHaveTextContent('the session expired');
    });

    it('says that nothing was recorded rather than inventing a login or a run', async () => {
      await renderWidget(<ToolList tools={[LOGIN_NEVER_RUN]} project={null} />);
      const row = screen.getByRole('listitem', { name: 'vpn' });
      expect(within(row).getByText('No login recorded yet.')).toBeInTheDocument();
      expect(within(row).getByText('Not run yet.')).toBeInTheDocument();
      expect(row).toHaveTextContent('vpn status, every 1 hr');
    });

    it('is written in French', async () => {
      await renderWidget(<ToolList tools={[SIGN_IN, LOGIN_NEVER_RUN]} project={null} />, { locale: 'fr' });
      expect(screen.getByRole('button', { name: 'Se connecter à sso-cli' })).toHaveAttribute('title', 'Lance sso-cli login --browser sur la machine de l’usine.');
      const row = screen.getByRole('listitem', { name: 'sso-cli' });
      expect(within(row).getByText('Dernière connexion').closest('p')).toHaveTextContent('Réussie');
      expect(within(row).getByText('Dernière connexion').closest('p')).toHaveTextContent('par Alex Morgan');
      expect(within(row).getByText('Session maintenue').closest('p')).toHaveTextContent('sso-cli whoami, intervalle de 30 min');
      expect(within(screen.getByRole('listitem', { name: 'vpn' })).getByText('Aucune connexion enregistrée pour l’instant.')).toBeInTheDocument();
    });
  });
});
