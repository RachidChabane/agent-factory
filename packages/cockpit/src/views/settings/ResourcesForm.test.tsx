import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand, expectCommand } from '../../test/commands.ts';
import { openInstallationSettings, replaceText, withInstallationSettings } from './settings-test-support.ts';

function resourcesFields() {
  const form = screen.getByRole('form', { name: 'Machine resources' });
  return {
    form,
    memory: within(form).getByLabelText('Minimum free memory (%)'),
    pressure: within(form).getByLabelText('Pause new runs above memory pressure'),
    runs: within(form).getByLabelText('Agent runs at once'),
    save: within(form).getByRole('button', { name: 'Save' }),
  };
}

describe('ResourcesForm', () => {
  it('shows the limits of the machine with what each means', async () => {
    await openInstallationSettings();
    const { memory, pressure, runs, save } = resourcesFields();
    expect(memory).toHaveValue('40');
    expect(pressure).toHaveDisplayValue('normal');
    expect(runs).toHaveValue('3');
    expect(memory).toHaveAccessibleDescription('Below this share of free memory, the factory starts no new run.');
    expect(runs).toHaveAccessibleDescription('The most agent runs that work at the same time, across all projects.');
    expect(save).toBeDisabled();
  });

  it('offers only the pressure levels the factory accepts: critical would never pause', async () => {
    await openInstallationSettings();
    const options = within(resourcesFields().pressure).getAllByRole('option');
    expect(options.map((option) => [option.textContent, (option as HTMLOptionElement).value])).toEqual([
      ['normal', 'normal'],
      ['high', 'warn'],
    ]);
    expect(resourcesFields().pressure).toHaveAccessibleDescription(/Critical is not offered: it would never pause\./);
  });

  it('sends all three fields, whichever one changed', async () => {
    const view = await openInstallationSettings();
    const { memory, save } = resourcesFields();
    await replaceText(view.user, memory, '55');
    await clickAndExpectCommand(view.user, save, view.transport, 'settings.update-resources', { minimumFreeMemoryPercent: 55, pauseAbovePressure: 'normal', maxConcurrentRuns: 3 });
  });

  it('sends the level that was chosen and the number of runs that was typed', async () => {
    const view = await openInstallationSettings();
    const { pressure, runs, save } = resourcesFields();
    await view.user.selectOptions(pressure, 'high');
    await replaceText(view.user, runs, '8');
    await clickAndExpectCommand(view.user, save, view.transport, 'settings.update-resources', { minimumFreeMemoryPercent: 40, pauseAbovePressure: 'warn', maxConcurrentRuns: 8 });
  });

  it('accepts a threshold with a decimal part', async () => {
    const view = await openInstallationSettings();
    await replaceText(view.user, resourcesFields().memory, '42.5');
    await view.user.click(resourcesFields().save);
    await expectCommand(view.transport, 'settings.update-resources', { minimumFreeMemoryPercent: 42.5, pauseAbovePressure: 'normal', maxConcurrentRuns: 3 });
  });

  it.each([
    ['below 10', '9'],
    ['above 90', '91'],
    ['negative', '-5'],
    ['not a number', 'half'],
    ['empty', ''],
  ])('refuses a free-memory threshold that is %s, says why and keeps Save disabled', async (_, text) => {
    const view = await openInstallationSettings();
    const { form, memory, save } = resourcesFields();
    await replaceText(view.user, memory, text);
    expect(within(form).getByText('Enter a percentage from 10 to 90.')).toBeInTheDocument();
    expect(memory).toBeInvalid();
    expect(save).toBeDisabled();
  });

  it.each([
    ['zero', '0'],
    ['above the 16 the factory allows', '17'],
    ['a fraction', '1.5'],
    ['not a number', 'several'],
    ['empty', ''],
  ])('refuses a number of runs that is %s, says why and keeps Save disabled', async (_, text) => {
    const view = await openInstallationSettings();
    const { form, runs, save } = resourcesFields();
    await replaceText(view.user, runs, text);
    expect(within(form).getByText('Enter a whole number from 1 to 16.')).toBeInTheDocument();
    expect(save).toBeDisabled();
    await view.user.click(save);
    expect(view.transport.commands).toEqual([]);
  });

  it.each([
    ['memory', '10'],
    ['memory', '90'],
    ['runs', '1'],
    ['runs', '16'],
  ] as const)('accepts the bound of %s: %s', async (field, text) => {
    const view = await openInstallationSettings();
    const fields = resourcesFields();
    await replaceText(view.user, field === 'memory' ? fields.memory : fields.runs, text);
    expect(within(fields.form).queryByText(/^Enter /)).not.toBeInTheDocument();
    expect(fields.save).toBeEnabled();
  });

  it('shows the level the installation holds, and sends it unchanged with the other fields', async () => {
    const snapshot = withInstallationSettings((settings) => ({ ...settings, resources: { ...settings.resources, pauseAbovePressure: 'warn' } }));
    const view = await openInstallationSettings({ snapshot });
    const { pressure, runs, save } = resourcesFields();
    expect(pressure).toHaveDisplayValue('high');
    expect(save).toBeDisabled();
    await replaceText(view.user, runs, '4');
    await clickAndExpectCommand(view.user, save, view.transport, 'settings.update-resources', { minimumFreeMemoryPercent: 40, pauseAbovePressure: 'warn', maxConcurrentRuns: 4 });
  });

  it('shows what the factory did, and its refusal', async () => {
    const view = await openInstallationSettings();
    view.transport.effects.set('settings.update-resources', 'Free memory threshold set to 55%');
    await replaceText(view.user, resourcesFields().memory, '55');
    await view.user.click(resourcesFields().save);
    expect(await within(screen.getByRole('status')).findByText('Free memory threshold set to 55%')).toBeInTheDocument();
    view.transport.commandFailure = 'scheduling must pause above normal or warn memory pressure, not critical';
    await view.user.click(resourcesFields().save);
    expect(await within(await screen.findByRole('alert')).findByText('scheduling must pause above normal or warn memory pressure, not critical')).toBeInTheDocument();
  });

  it('is disabled while the change is in flight', async () => {
    const view = await openInstallationSettings();
    await replaceText(view.user, resourcesFields().memory, '55');
    const release = view.transport.holdCommands();
    await view.user.click(resourcesFields().save);
    await waitFor(() => expect(resourcesFields().save).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(resourcesFields().save).toBeEnabled());
  });
});

describe('ResourcesForm in French', () => {
  it('writes the resources form in French and sends the same command', async () => {
    const view = await openInstallationSettings({ locale: 'fr' });
    const form = screen.getByRole('form', { name: 'Ressources de la machine' });
    const memory = within(form).getByLabelText('Mémoire libre minimale (%)');
    await replaceText(view.user, memory, '9');
    expect(within(form).getByText('Saisissez un pourcentage de 10 à 90.')).toBeInTheDocument();
    await replaceText(view.user, memory, '42,5');
    const pressure = within(form).getByLabelText('Suspendre les nouveaux runs au-delà de la pression mémoire');
    expect(within(pressure).getAllByRole('option').map((option) => option.textContent)).toEqual(['normale', 'élevée']);
    await view.user.selectOptions(pressure, 'élevée');
    await clickAndExpectCommand(view.user, within(form).getByRole('button', { name: 'Enregistrer' }), view.transport, 'settings.update-resources', {
      minimumFreeMemoryPercent: 42.5,
      pauseAbovePressure: 'warn',
      maxConcurrentRuns: 3,
    });
  });
});
