import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand } from '../../test/commands.ts';
import { LEDGER, openInstallationSettings, openProjectSettings, replaceText, roleFields, roleForm, STOREFRONT, withInstallationSettings, withProjectSettings } from './settings-test-support.ts';

describe('roles of a project', () => {
  it('lists the seven roles, each with its model, effort, budget, turns and timeout', async () => {
    await openProjectSettings();
    const names = ['Challenger', 'Checks author', 'Implementer', 'Reviewer', 'Auditor', 'Release auditor', 'Summarizer'];
    for (const name of names) expect(roleForm(name)).toBeInTheDocument();
    const implementer = roleFields('Implementer');
    expect(implementer.model).toHaveValue('claude-sonnet-5-5');
    expect(implementer.effort).toHaveDisplayValue('High');
    expect(implementer.budget).toHaveValue('5');
    expect(implementer.turns).toHaveValue('150');
    expect(implementer.form).toHaveTextContent('Timeout: 1 hr');
    expect(roleForm('Challenger')).toHaveTextContent('Timeout: 40 min');
    expect(roleForm('Summarizer')).toHaveTextContent('Timeout: 10 min');
  });

  it('marks the roles whose prompt the project replaces', async () => {
    await openProjectSettings();
    expect(within(roleForm('Implementer')).getByText('Prompt overridden')).toHaveAttribute('title', 'This project replaces the default prompt of this role.');
    expect(within(roleForm('Challenger')).getByText('Prompt overridden')).toBeInTheDocument();
    expect(within(roleForm('Reviewer')).queryByText('Prompt overridden')).not.toBeInTheDocument();
  });

  it('marks no role of a project that replaces no prompt', async () => {
    await openProjectSettings(LEDGER);
    expect(screen.queryByText('Prompt overridden')).not.toBeInTheDocument();
  });

  it('offers the models of the installation, and the one the role has even if the installation does not list it', async () => {
    const snapshot = withInstallationSettings((settings) => ({ ...settings, models: ['claude-opus-5-5', 'claude-haiku-5-5'] }));
    await openProjectSettings(STOREFRONT, { snapshot });
    expect(within(roleFields('Reviewer').model).getAllByRole('option').map((option) => option.textContent)).toEqual(['claude-opus-5-5', 'claude-haiku-5-5']);
    expect(within(roleFields('Implementer').model).getAllByRole('option').map((option) => option.textContent)).toEqual(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5']);
  });

  it('offers the five effort levels in words', async () => {
    await openProjectSettings();
    expect(within(roleFields('Implementer').effort).getAllByRole('option').map((option) => option.textContent)).toEqual(['Low', 'Medium', 'High', 'Very high', 'Maximum']);
  });

  it('says once what the dollar limits of the roles mean', async () => {
    await openProjectSettings();
    expect(screen.getByText('Dollar figures are API-equivalent prices')).toBeInTheDocument();
  });
});

describe('roles of the installation', () => {
  it('lists the default roles without any mark of a replaced prompt', async () => {
    await openInstallationSettings();
    expect(screen.getByRole('region', { name: 'Default roles' })).toBeInTheDocument();
    expect(roleForm('Implementer')).toBeInTheDocument();
    expect(screen.queryByText('Prompt overridden')).not.toBeInTheDocument();
  });

  it('addresses the installation defaults with a null project', async () => {
    const view = await openInstallationSettings();
    const { turns, save } = roleFields('Challenger');
    await replaceText(view.user, turns, '160');
    await clickAndExpectCommand(view.user, save, view.transport, 'settings.update-role', {
      project: null,
      change: { role: 'challenger', model: 'claude-opus-5-5', effort: 'high', maxBudgetUsd: 4, maxTurns: 160 },
    });
  });

  it('says that no role is configured when the installation holds none', async () => {
    const snapshot = withInstallationSettings((settings) => ({ ...settings, defaultRoles: [] }));
    await openInstallationSettings({ snapshot });
    expect(screen.getByText('No role is configured.')).toBeInTheDocument();
  });
});

describe('roles in French', () => {
  it('names the roles, the fields and the buttons in French', async () => {
    await openProjectSettings(STOREFRONT, { locale: 'fr' });
    const form = roleForm('Implémenteur');
    expect(within(form).getByLabelText('Modèle')).toHaveValue('claude-sonnet-5-5');
    expect(within(form).getByLabelText('Effort')).toHaveDisplayValue('Élevé');
    expect(within(form).getByLabelText('Budget max. (USD)')).toHaveValue('5');
    expect(within(form).getByLabelText('Tours max.')).toHaveValue('150');
    expect(within(form).getByText('Prompt remplacé')).toBeInTheDocument();
    expect(form).toHaveTextContent('Délai maximal : 1 h');
    expect(within(form).getByRole('button', { name: 'Enregistrer Implémenteur' })).toBeDisabled();
  });

  it('writes a decimal budget with a comma and reads a comma back', async () => {
    const snapshot = withProjectSettings(STOREFRONT, (settings) => ({ ...settings, roles: settings.roles.map((role) => (role.role === 'reviewer' ? { ...role, maxBudgetUsd: 3.25 } : role)) }));
    const view = await openProjectSettings(STOREFRONT, { locale: 'fr', snapshot });
    const form = roleForm('Relecteur');
    const budget = within(form).getByLabelText('Budget max. (USD)');
    expect(budget).toHaveValue('3,25');
    await replaceText(view.user, budget, '4,5');
    await clickAndExpectCommand(view.user, within(form).getByRole('button', { name: 'Enregistrer Relecteur' }), view.transport, 'settings.update-role', {
      project: STOREFRONT,
      change: { role: 'reviewer', model: 'claude-opus-5-5', effort: 'medium', maxBudgetUsd: 4.5, maxTurns: 60 },
    });
  });

  it('says in French why a value is refused', async () => {
    const view = await openProjectSettings(STOREFRONT, { locale: 'fr' });
    const form = roleForm('Relecteur');
    await replaceText(view.user, within(form).getByLabelText('Budget max. (USD)'), '0');
    await replaceText(view.user, within(form).getByLabelText('Tours max.'), '0');
    expect(within(form).getByText('Saisissez un montant supérieur à 0, jusqu’à 100 USD.')).toBeInTheDocument();
    expect(within(form).getByText('Saisissez un nombre entier de 1 à 500.')).toBeInTheDocument();
  });
});
