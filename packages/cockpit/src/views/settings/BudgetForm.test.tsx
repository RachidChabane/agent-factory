import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CockpitSnapshot } from '../../contract/index.ts';
import { clickAndExpectCommand } from '../../test/commands.ts';
import { openInstallationSettings, replaceText, withCosts } from './settings-test-support.ts';

const section = (name: string) => screen.getByRole('region', { name });

function budgetFields() {
  const form = screen.getByRole('form', { name: 'Budget caps' });
  return {
    form,
    daily: within(form).getByLabelText('Daily cap (USD)'),
    perRun: within(form).getByLabelText('Per-run cap (USD)'),
    save: within(form).getByRole('button', { name: 'Save' }),
  };
}


const capped = (): CockpitSnapshot => withCosts((costs) => ({ ...costs, dailyCap: { kind: 'usd', amount: 50 }, perRunCapUsd: 5 }));

describe('BudgetForm', () => {
  it('follows the basis of the costs when the installation is billed per token', async () => {
    await openInstallationSettings({ snapshot: withCosts((costs) => ({ ...costs, basis: 'metered' })) });
    expect(screen.getByText('Dollar figures are metered prices')).toBeInTheDocument();
    expect(within(budgetFields().form).getByText('Metered')).toBeInTheDocument();
  });

  it('shows an empty field and says there is no daily cap when none is set', async () => {
    await openInstallationSettings();
    const { daily, save } = budgetFields();
    expect(daily).toHaveValue('');
    expect(daily).toHaveAttribute('placeholder', 'No cap');
    expect(daily).toHaveAccessibleDescription('No daily cap');
    expect(save).toBeDisabled();
  });

  it('shows the per-run cap with what it means', async () => {
    await openInstallationSettings();
    const { perRun } = budgetFields();
    expect(perRun).toHaveValue('5');
    expect(perRun).toHaveAccessibleDescription(/^Current per-run cap: \$5\.00\s?API-equivalent$/);
  });

  it('says there is no per-run cap, and that the budget of each role is then the only limit', async () => {
    await openInstallationSettings({ snapshot: withCosts((costs) => ({ ...costs, perRunCapUsd: null })) });
    expect(budgetFields().perRun).toHaveValue('');
    expect(budgetFields().perRun).toHaveAccessibleDescription('No per-run cap: the budget of each role is the only limit');
  });

  it('shows a daily cap that is set, as an API-equivalent amount', async () => {
    await openInstallationSettings({ snapshot: capped() });
    expect(budgetFields().daily).toHaveValue('50');
    expect(budgetFields().daily).toHaveAccessibleDescription(/^Current daily cap: \$50\.00\s?API-equivalent$/);
  });

  it('explains the caps once, in the description of the section', async () => {
    await openInstallationSettings();
    expect(section('Budget caps')).toHaveTextContent('Leave a field empty for no cap.');
    expect(section('Budget caps')).toHaveTextContent('The daily cap counts the spend of each UTC day');
  });

  it('sends both caps: an amount and null for the one left empty', async () => {
    const view = await openInstallationSettings();
    await replaceText(view.user, budgetFields().daily, '75.5');
    await clickAndExpectCommand(view.user, budgetFields().save, view.transport, 'settings.update-budget', { dailyCapUsd: 75.5, perRunCapUsd: 5 });
  });

  it('sends null for a cap that is emptied: an empty field means no cap, never zero', async () => {
    const view = await openInstallationSettings();
    await replaceText(view.user, budgetFields().perRun, '');
    await clickAndExpectCommand(view.user, budgetFields().save, view.transport, 'settings.update-budget', { dailyCapUsd: null, perRunCapUsd: null });
  });

  it('sends null for a daily cap that is removed and keeps the per-run cap', async () => {
    const view = await openInstallationSettings({ snapshot: capped() });
    await replaceText(view.user, budgetFields().daily, '');
    await clickAndExpectCommand(view.user, budgetFields().save, view.transport, 'settings.update-budget', { dailyCapUsd: null, perRunCapUsd: 5 });
  });

  it('sends two nulls when both caps are removed', async () => {
    const view = await openInstallationSettings({ snapshot: capped() });
    await replaceText(view.user, budgetFields().daily, '');
    await replaceText(view.user, budgetFields().perRun, '   ');
    await clickAndExpectCommand(view.user, budgetFields().save, view.transport, 'settings.update-budget', { dailyCapUsd: null, perRunCapUsd: null });
  });

  it('sends both amounts when both caps are set', async () => {
    const view = await openInstallationSettings();
    await replaceText(view.user, budgetFields().daily, '100');
    await replaceText(view.user, budgetFields().perRun, '2.5');
    await clickAndExpectCommand(view.user, budgetFields().save, view.transport, 'settings.update-budget', { dailyCapUsd: 100, perRunCapUsd: 2.5 });
  });

  it.each([
    ['zero', '0'],
    ['negative', '-10'],
    ['above 1,000', '1001'],
    ['not a number', 'a lot'],
    ['written with a comma in English', '12,5'],
  ])('refuses a daily cap that is %s, says why and keeps Save disabled', async (_, text) => {
    const view = await openInstallationSettings();
    const { form, daily, save } = budgetFields();
    await replaceText(view.user, daily, text);
    expect(within(form).getByText('Enter an amount above 0, up to 1,000 USD, or leave the field empty.')).toBeInTheDocument();
    expect(daily).toBeInvalid();
    expect(save).toBeDisabled();
    await view.user.click(save);
    expect(view.transport.commands).toEqual([]);
  });

  it.each([
    ['zero', '0'],
    ['above 100', '100.5'],
    ['not a number', 'five'],
  ])('refuses a per-run cap that is %s, says why and keeps Save disabled', async (_, text) => {
    const view = await openInstallationSettings();
    const { form, perRun, save } = budgetFields();
    await replaceText(view.user, perRun, text);
    expect(within(form).getByText('Enter an amount above 0, up to 100 USD, or leave the field empty.')).toBeInTheDocument();
    expect(save).toBeDisabled();
  });

  it('accepts the ceilings themselves', async () => {
    const view = await openInstallationSettings();
    await replaceText(view.user, budgetFields().daily, '1000');
    await replaceText(view.user, budgetFields().perRun, '100');
    expect(budgetFields().save).toBeEnabled();
    expect(within(budgetFields().form).queryByText(/^Enter /)).not.toBeInTheDocument();
  });

  it('shows what the factory did, and its refusal', async () => {
    const view = await openInstallationSettings();
    view.transport.effects.set('settings.update-budget', 'Daily cap set to $75.50');
    await replaceText(view.user, budgetFields().daily, '75.5');
    await view.user.click(budgetFields().save);
    expect(await within(screen.getByRole('status')).findByText('Daily cap set to $75.50')).toBeInTheDocument();
    view.transport.commandFailure = 'the budget file is locked';
    await view.user.click(budgetFields().save);
    expect(await within(await screen.findByRole('alert')).findByText('the budget file is locked')).toBeInTheDocument();
  });
});

describe('BudgetForm in French', () => {
  it('writes the budget form in French: a comma is the decimal mark, an empty field is no cap', async () => {
    const snapshot = withCosts((costs) => ({ ...costs, dailyCap: { kind: 'usd', amount: 42.5 }, perRunCapUsd: null }));
    const view = await openInstallationSettings({ locale: 'fr', snapshot });
    const form = screen.getByRole('form', { name: 'Plafonds de budget' });
    const daily = within(form).getByLabelText('Plafond quotidien (USD)');
    const perRun = within(form).getByLabelText('Plafond par run (USD)');
    expect(daily).toHaveValue('42,5');
    expect(perRun).toHaveAttribute('placeholder', 'Aucun plafond');
    expect(perRun).toHaveAccessibleDescription('Aucun plafond par run : le budget de chaque rôle est la seule limite');
    await replaceText(view.user, daily, '12,5');
    await replaceText(view.user, perRun, '2,25');
    await clickAndExpectCommand(view.user, within(form).getByRole('button', { name: 'Enregistrer' }), view.transport, 'settings.update-budget', { dailyCapUsd: 12.5, perRunCapUsd: 2.25 });
  });

  it('says in French that there is no daily cap', async () => {
    await openInstallationSettings({ locale: 'fr' });
    const form = screen.getByRole('form', { name: 'Plafonds de budget' });
    expect(within(form).getByLabelText('Plafond quotidien (USD)')).toHaveAccessibleDescription('Aucun plafond quotidien');
  });
});
