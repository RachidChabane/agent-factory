import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand, expectCommand } from '../../test/commands.ts';
import { renderApp, renderRoute } from '../../test/render.tsx';
import { LEDGER, openProjectSettings, replaceText, roleForm, STOREFRONT, withProjectSettings } from './settings-test-support.ts';

const section = (name: string) => screen.getByRole('region', { name });

function concurrencyFields() {
  const form = screen.getByRole('form', { name: 'Concurrency' });
  return {
    form,
    issues: within(form).getByLabelText('Issues at once'),
    ceiling: within(form).getByLabelText('Ceiling'),
    save: within(form).getByRole('button', { name: 'Save' }),
  };
}

describe('ProjectSettingsView page', () => {
  it('names the project and says once what the dollar limits mean', async () => {
    await openProjectSettings();
    expect(screen.getByText('How the factory works on Storefront: its agents, concurrency, commands, conventions and tools.')).toBeInTheDocument();
    expect(screen.getByText('Dollar figures are API-equivalent prices')).toBeInTheDocument();
  });

  it('lays out the sections of the project in a fixed order', async () => {
    await openProjectSettings();
    const titles = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(titles).toEqual(['Agent roles', 'Concurrency', 'Setup commands', 'Gate commands', 'Check environment', 'Films', 'Conventions', 'Automations', 'Issue types', 'Tools']);
  });

  it('says that the project does not exist for an unknown address', async () => {
    await renderRoute('/projects/nowhere/settings');
    expect(await screen.findByText('Project “nowhere” not found')).toBeInTheDocument();
  });
});

describe('ProjectSettingsView films', () => {
  it('says that the project declares no film command', async () => {
    await openProjectSettings();
    expect(within(section('Films')).getByText('No film command is declared for this project.')).toBeInTheDocument();
  });

  it('says where the film command runs, in which zone the arrivals are told and how long a recording may take', async () => {
    const snapshot = withProjectSettings(STOREFRONT, (settings) => ({ ...settings, films: { timeZone: 'Europe/Paris', timeoutMinutes: 20 } }));
    await openProjectSettings(STOREFRONT, { snapshot });
    const films = section('Films');
    expect(within(films).getByText('That command runs outside the sandbox', { exact: false })).toBeInTheDocument();
    expect(within(films).getByText('Europe/Paris')).toBeInTheDocument();
    expect(within(films).getByText('Time zone of the expected arrivals')).toBeInTheDocument();
    expect(within(films).getByText('Longest recording').nextElementSibling).toHaveTextContent('20');
  });

  it('is shown in French', async () => {
    await openProjectSettings(STOREFRONT, { locale: 'fr' });
    expect(within(section('Tournages')).getByText('Aucune commande de tournage n’est déclarée pour ce projet.')).toBeInTheDocument();
  });
});

describe('ProjectSettingsView when the project changes', () => {
  it('does not carry what was typed for one project over to the other', async () => {
    const view = await renderApp('/projects/storefront/settings');
    await screen.findByRole('heading', { level: 1, name: 'Project settings' });
    const budget = within(roleForm('Implementer')).getByLabelText('Max budget (USD)');
    await replaceText(view.user, budget, '55');
    await view.user.click(within(screen.getByRole('navigation')).getByRole('button', { name: /^Project:/ }));
    await view.user.click(within(await screen.findByRole('dialog', { name: 'Choose a project' })).getByRole('link', { name: /Ledger/ }));
    await view.expectLocation('/projects/ledger/settings');
    await waitFor(() => expect(within(roleForm('Implementer')).getByLabelText('Max budget (USD)')).toHaveValue('5'));
    expect(within(roleForm('Implementer')).getByRole('button', { name: 'Save Implementer' })).toBeDisabled();
  });
});

describe('ProjectSettingsView concurrency', () => {
  it('shows how many issues the project works on at once and the ceiling, with what each means', async () => {
    await openProjectSettings();
    const { form, issues, ceiling } = concurrencyFields();
    expect(issues).toHaveValue('2');
    expect(ceiling).toHaveValue('3');
    expect(issues).toHaveAccessibleDescription('The number of issues of this project the factory works on at the same time.');
    expect(ceiling).toHaveAccessibleDescription('The highest number of issues at once this project may be set to.');
    expect(within(form).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows the values of the project it belongs to', async () => {
    await openProjectSettings(LEDGER);
    expect(concurrencyFields().issues).toHaveValue('1');
    expect(concurrencyFields().ceiling).toHaveValue('2');
  });

  it('sends the project and both numbers', async () => {
    const view = await openProjectSettings();
    const { issues, ceiling, save } = concurrencyFields();
    await replaceText(view.user, issues, '3');
    await replaceText(view.user, ceiling, '5');
    await clickAndExpectCommand(view.user, save, view.transport, 'settings.update-concurrency', { project: STOREFRONT, issues: 3, ceiling: 5 });
  });

  it('sends the ceiling too when only the number of issues changes', async () => {
    const view = await openProjectSettings(LEDGER);
    const { issues, save } = concurrencyFields();
    await replaceText(view.user, issues, '2');
    await clickAndExpectCommand(view.user, save, view.transport, 'settings.update-concurrency', { project: LEDGER, issues: 2, ceiling: 2 });
  });

  it('accepts the same number for both fields', async () => {
    const view = await openProjectSettings();
    const { issues, ceiling, save } = concurrencyFields();
    await replaceText(view.user, issues, '3');
    expect(ceiling).toHaveValue('3');
    await view.user.click(save);
    await expectCommand(view.transport, 'settings.update-concurrency', { project: STOREFRONT, issues: 3, ceiling: 3 });
  });

  it.each([
    ['no number of issues', '', '3', 'Enter a whole number, 1 or more.'],
    ['zero issues', '0', '3', 'Enter a whole number, 1 or more.'],
    ['a fraction of an issue', '1.5', '3', 'Enter a whole number, 1 or more.'],
    ['a ceiling below the issues', '3', '2', 'The ceiling cannot be lower than the number of issues at once.'],
    ['a ceiling that is not a number', '2', 'many', 'Enter a whole number, 1 or more.'],
  ])('refuses %s, says why and keeps Save disabled', async (_, issuesText, ceilingText, message) => {
    const view = await openProjectSettings();
    const { form, issues, ceiling, save } = concurrencyFields();
    await replaceText(view.user, issues, issuesText);
    await replaceText(view.user, ceiling, ceilingText);
    expect(within(form).getByText(message)).toBeInTheDocument();
    expect(save).toBeDisabled();
    await view.user.click(save);
    expect(view.transport.commands).toEqual([]);
  });

  it('shows what the factory did, and its refusal', async () => {
    const view = await openProjectSettings();
    view.transport.effects.set('settings.update-concurrency', 'Storefront now works on 3 issues at once');
    await replaceText(view.user, concurrencyFields().issues, '3');
    await view.user.click(concurrencyFields().save);
    expect(await within(screen.getByRole('status')).findByText('Storefront now works on 3 issues at once')).toBeInTheDocument();
    view.transport.commandFailure = 'the ceiling of storefront is 3';
    await view.user.click(concurrencyFields().save);
    expect(await within(await screen.findByRole('alert')).findByText('the ceiling of storefront is 3')).toBeInTheDocument();
  });

  it('is disabled while the change is in flight', async () => {
    const view = await openProjectSettings();
    await replaceText(view.user, concurrencyFields().issues, '3');
    const release = view.transport.holdCommands();
    await view.user.click(concurrencyFields().save);
    await waitFor(() => expect(concurrencyFields().save).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(concurrencyFields().save).toBeEnabled());
  });
});

describe('ProjectSettingsView tools', () => {
  it('lists the tools of the project with their status', async () => {
    await openProjectSettings();
    const tools = section('Tools');
    expect(within(tools).getByRole('listitem', { name: 'gh' })).toHaveTextContent('Connected');
    expect(within(tools).getByRole('listitem', { name: 'playwright' })).toHaveTextContent('Missing');
    expect(within(tools).getByRole('listitem', { name: 'registry-login' })).toHaveTextContent('Not signed in');
    expect(tools).toHaveTextContent('2 of 6 connected');
  });

  it('says that a tool was never checked', async () => {
    await openProjectSettings();
    const tool = within(section('Tools')).getByRole('listitem', { name: 'infra-plan' });
    expect(tool).toHaveTextContent('Never checked');
    expect(tool).toHaveTextContent('No result has been recorded for this tool yet.');
  });

  it('checks a tool of the project with the project it belongs to', async () => {
    const view = await openProjectSettings();
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Check infra-plan' }), view.transport, 'tools.check', { project: STOREFRONT, tool: 'infra-plan' });
  });

  it('logs in to a tool that declares a login with the project it belongs to, and shows what the last login and keep-alive did', async () => {
    const view = await openProjectSettings();
    const gh = within(section('Tools')).getByRole('listitem', { name: 'gh' });
    expect(within(gh).getByText('Last login').closest('p')).toHaveTextContent(/Succeeded.*1 wk\. ago.*by Alex Morgan/);
    expect(within(gh).getByText('Last run').closest('p')).toHaveTextContent(/Succeeded.*20 min\. ago/);
    const registry = within(section('Tools')).getByRole('listitem', { name: 'registry-login' });
    expect(within(registry).getByText('Last login').closest('p')).toHaveTextContent(/Timed out.*the login was not completed within 5 minutes/);
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Log in to registry-login' }), view.transport, 'tools.login', { project: STOREFRONT, tool: 'registry-login' });
    expect(screen.queryByRole('button', { name: 'Log in to pnpm' })).not.toBeInTheDocument();
  });

  it('says that no login was recorded for a tool that declares one and never ran it', async () => {
    await openProjectSettings();
    const tool = within(section('Tools')).getByRole('listitem', { name: 'infra-plan' });
    expect(tool).toHaveTextContent('No login recorded yet.');
    expect(tool).toHaveTextContent('Not run yet.');
  });

  it('checks a tool of another project with that project', async () => {
    const view = await openProjectSettings(LEDGER);
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Check psql' }), view.transport, 'tools.check', { project: LEDGER, tool: 'psql' });
  });
});

describe('ProjectSettingsView in French', () => {
  it('writes the sections, the commands and the conventions in French', async () => {
    await openProjectSettings(STOREFRONT, { locale: 'fr' });
    const titles = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(titles).toEqual(['Rôles des agents', 'Concurrence', 'Commandes de préparation', 'Commandes de la gate', 'Environnement des checks', 'Tournages', 'Conventions', 'Automatisations', 'Types d’issue', 'Outils']);
    expect(screen.getByText('Réseau : downloads the packages from the private registry')).toBeInTheDocument();
    expect(screen.getAllByText('Pas de réseau').length).toBeGreaterThan(0);
    expect(screen.getByText('La gate expire au bout de 30 min.')).toBeInTheDocument();
    expect(screen.getByText('N’importe quel auteur')).toBeInTheDocument();
    expect(screen.getByText('Seuls leurs noms sont affichés : les valeurs restent sur la machine.', { exact: false })).toBeInTheDocument();
    expect(within(section('Conventions')).getByText('Pull requests de release')).toBeInTheDocument();
  });

  it('writes the concurrency form and its refusals in French', async () => {
    const view = await openProjectSettings(STOREFRONT, { locale: 'fr' });
    const form = screen.getByRole('form', { name: 'Concurrence' });
    await replaceText(view.user, within(form).getByLabelText('Issues en parallèle'), '4');
    expect(within(form).getByText('Le plafond ne peut pas être inférieur au nombre d’issues en parallèle.', { exact: false })).toBeInTheDocument();
    await replaceText(view.user, within(form).getByLabelText('Plafond'), '4');
    await clickAndExpectCommand(view.user, within(form).getByRole('button', { name: 'Enregistrer' }), view.transport, 'settings.update-concurrency', { project: STOREFRONT, issues: 4, ceiling: 4 });
  });

  it('names the issue types the cockpit knows in French', async () => {
    await openProjectSettings(LEDGER, { locale: 'fr' });
    const items = within(within(section('Types d’issue')).getByRole('list', { name: 'Types d’issue' })).getAllByRole('listitem');
    expect(items.some((item) => item.textContent?.includes('Documentation'))).toBe(true);
    expect(items.some((item) => item.textContent?.includes('Échoue sur la base'))).toBe(true);
  });
});
