import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand, expectCommand } from '../../test/commands.ts';
import { LEDGER, openProjectSettings, replaceText, roleFields, STOREFRONT, withProjectSettings } from './settings-test-support.ts';

describe('saving a role of a project', () => {
  it('keeps Save disabled until the role changes, and disables it again once the change is undone', async () => {
    const view = await openProjectSettings();
    const { save, budget } = roleFields('Implementer');
    expect(save).toBeDisabled();
    await view.user.type(budget, '0');
    expect(save).toBeEnabled();
    await view.user.type(budget, '{backspace}');
    expect(save).toBeDisabled();
  });

  it('sends the project, the role and its four settings, and nothing else', async () => {
    const view = await openProjectSettings();
    const { model, effort, budget, turns, save } = roleFields('Implementer');
    await view.user.selectOptions(model, 'claude-opus-5-5');
    await view.user.selectOptions(effort, 'Very high');
    await replaceText(view.user, budget, '7.5');
    await replaceText(view.user, turns, '200');
    await clickAndExpectCommand(view.user, save, view.transport, 'settings.update-role', {
      project: STOREFRONT,
      change: { role: 'implementer', model: 'claude-opus-5-5', effort: 'xhigh', maxBudgetUsd: 7.5, maxTurns: 200 },
    });
  });

  it('addresses the project that owns the page', async () => {
    const view = await openProjectSettings(LEDGER);
    const { turns, save } = roleFields('Reviewer');
    await replaceText(view.user, turns, '61');
    await clickAndExpectCommand(view.user, save, view.transport, 'settings.update-role', {
      project: LEDGER,
      change: { role: 'reviewer', model: 'claude-opus-5-5', effort: 'medium', maxBudgetUsd: 3, maxTurns: 61 },
    });
  });

  it('saves a single role: the others keep their Save disabled and send nothing', async () => {
    const view = await openProjectSettings();
    await replaceText(view.user, roleFields('Auditor').turns, '85');
    expect(roleFields('Reviewer').save).toBeDisabled();
    expect(roleFields('Implementer').save).toBeDisabled();
    await clickAndExpectCommand(view.user, roleFields('Auditor').save, view.transport, 'settings.update-role', {
      project: STOREFRONT,
      change: { role: 'auditor', model: 'claude-opus-5-5', effort: 'medium', maxBudgetUsd: 3, maxTurns: 85 },
    });
  });

  it('sends the values trimmed, as numbers', async () => {
    const view = await openProjectSettings();
    const { budget, turns, save } = roleFields('Summarizer');
    await replaceText(view.user, budget, '  2.25 ');
    await replaceText(view.user, turns, ' 31 ');
    await clickAndExpectCommand(view.user, save, view.transport, 'settings.update-role', {
      project: STOREFRONT,
      change: { role: 'summarizer', model: 'claude-haiku-5-5', effort: 'low', maxBudgetUsd: 2.25, maxTurns: 31 },
    });
  });

  it('saves from the keyboard with Enter', async () => {
    const view = await openProjectSettings();
    await view.user.type(roleFields('Reviewer').budget, '5{enter}');
    await expectCommand(view.transport, 'settings.update-role', {
      project: STOREFRONT,
      change: { role: 'reviewer', model: 'claude-opus-5-5', effort: 'medium', maxBudgetUsd: 35, maxTurns: 60 },
    });
  });

  it('sends nothing on Enter while the role is unchanged or invalid', async () => {
    const view = await openProjectSettings();
    await view.user.type(roleFields('Reviewer').turns, '{enter}');
    await replaceText(view.user, roleFields('Reviewer').budget, 'free{enter}');
    expect(view.transport.commands).toEqual([]);
  });

  it('shows what the factory did once it accepted the change', async () => {
    const view = await openProjectSettings();
    view.transport.effects.set('settings.update-role', 'Implementer of storefront now runs on claude-opus-5-5');
    await view.user.selectOptions(roleFields('Implementer').model, 'claude-opus-5-5');
    await view.user.click(roleFields('Implementer').save);
    expect(await within(screen.getByRole('status')).findByText('Implementer of storefront now runs on claude-opus-5-5')).toBeInTheDocument();
  });

  it('shows the refusal of the factory', async () => {
    const view = await openProjectSettings();
    view.transport.commandFailure = 'the settings file is locked';
    await view.user.selectOptions(roleFields('Implementer').model, 'claude-opus-5-5');
    await view.user.click(roleFields('Implementer').save);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('The command failed')).toBeInTheDocument();
    expect(within(alert).getByText('the settings file is locked')).toBeInTheDocument();
  });

  it('is disabled while the change is in flight', async () => {
    const view = await openProjectSettings();
    const { effort, save } = roleFields('Implementer');
    await view.user.selectOptions(effort, 'Low');
    const release = view.transport.holdCommands();
    await view.user.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(save).toBeEnabled());
    expect(view.transport.commands).toHaveLength(1);
  });
});

describe('validation of a role', () => {
  it.each([
    ['zero', '0'],
    ['negative', '-2'],
    ['above the ceiling of 100', '100.5'],
    ['not a number', 'a lot'],
    ['written with a comma in English', '4,5'],
    ['empty', ''],
  ])('refuses a budget that is %s, says why, and keeps Save disabled', async (_, text) => {
    const view = await openProjectSettings();
    const { form, budget, save } = roleFields('Implementer');
    await replaceText(view.user, budget, text);
    expect(within(form).getByText('Enter an amount above 0, up to 100 USD.')).toBeInTheDocument();
    expect(budget).toBeInvalid();
    expect(budget).toHaveAccessibleDescription('Enter an amount above 0, up to 100 USD.');
    expect(save).toBeDisabled();
    await view.user.click(save);
    expect(view.transport.commands).toEqual([]);
  });

  it.each([
    ['zero', '0'],
    ['above 500', '501'],
    ['a fraction', '2.5'],
    ['not a number', 'many'],
    ['empty', ''],
  ])('refuses turns that are %s', async (_, text) => {
    const view = await openProjectSettings();
    const { form, turns, save } = roleFields('Implementer');
    await replaceText(view.user, turns, text);
    expect(within(form).getByText('Enter a whole number from 1 to 500.')).toBeInTheDocument();
    expect(save).toBeDisabled();
  });

  it.each([
    ['100', 'the budget ceiling', 'budget'],
    ['0.01', 'a cent', 'budget'],
    ['500', 'the turn ceiling', 'turns'],
    ['1', 'one turn', 'turns'],
  ] as const)('accepts %s, %s', async (text, _, field) => {
    const view = await openProjectSettings();
    const fields = roleFields('Implementer');
    await replaceText(view.user, fields[field], text);
    expect(within(fields.form).queryByText(/^Enter /)).not.toBeInTheDocument();
    expect(fields.save).toBeEnabled();
  });

  it('shows no error while every role holds values the factory accepts', async () => {
    await openProjectSettings();
    expect(screen.queryByText(/^Enter /)).not.toBeInTheDocument();
  });

  it('flags a model name the factory would refuse, which only another model can fix', async () => {
    const snapshot = withProjectSettings(STOREFRONT, (settings) => ({ ...settings, roles: settings.roles.map((role) => (role.role === 'auditor' ? { ...role, model: 'sonnet; rm -rf /' } : role)) }));
    const view = await openProjectSettings(STOREFRONT, { snapshot });
    const { form, model, save } = roleFields('Auditor');
    expect(within(form).getByText('This is not a valid model name.')).toBeInTheDocument();
    await view.user.selectOptions(model, 'claude-opus-5-5');
    expect(within(form).queryByText('This is not a valid model name.')).not.toBeInTheDocument();
    expect(save).toBeEnabled();
  });
});
