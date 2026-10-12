import type { Locator, Page } from '@playwright/test';
import { commandPath, type CommandBody, type CostsView, type InstallationSettingsView, type ProjectSettingsView, type RoleSetting } from '../../../packages/cockpit/src/contract/index.ts';
import { en } from '../../../packages/cockpit/src/i18n/catalog/en/index.ts';
import { MINUTE_MS } from '../../../packages/cockpit/src/i18n/formatters.ts';
import { MAX_FREE_MEMORY_THRESHOLD_PERCENT, MIN_FREE_MEMORY_THRESHOLD_PERCENT } from '../../../packages/domain/src/settings-bounds.ts';
import { projectOf } from '../../support/api.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import type { RunningFactory } from '../../support/factory.ts';
import { factValue } from '../../support/facts.ts';
import { english } from '../../support/formats.ts';
import { roleLabel } from '../../support/labels.ts';
import { LEDGER, STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const INSTALLATION_SETTINGS = '/settings';
const STOREFRONT_SETTINGS = `/projects/${STOREFRONT}/settings`;
const AUDITOR = 'auditor';
const ONE_MORE = 1;
const ONE_LESS = 1;
const DAILY_CAP_USD = 50;
const CEILING_NO_WORKTREE_POOL_HOLDS = 100;
const CONFLICT_STATUS = 409;
const SETTINGS_SAVED = /^Settings saved to (.+?)( and applied|; .+ apply after a restart)$/;

type Resources = InstallationSettingsView['resources'];
type Concurrency = ProjectSettingsView['concurrency'];
type Budget = Pick<CostsView, 'dailyCap' | 'perRunCapUsd'>;

function roleOf(roles: readonly RoleSetting[], role: string): RoleSetting {
  const found = roles.find((candidate) => candidate.role === role);
  if (found === undefined) throw new Error(`the settings hold no ${role} role`);
  return found;
}

function roleChangeOf(setting: RoleSetting): CommandBody<'settings.update-role'>['change'] {
  return { role: setting.role, model: setting.model, effort: setting.effort, maxBudgetUsd: setting.maxBudgetUsd, maxTurns: setting.maxTurns };
}

function dailyCapOf(budget: Pick<Budget, 'dailyCap'>): number | null {
  return budget.dailyCap.kind === 'usd' ? budget.dailyCap.amount : null;
}

function expectSavedTo(effect: string | null, configPath: string): void {
  expect(SETTINGS_SAVED.exec(effect ?? '')?.[1], `the effect "${effect}" names the configuration file`).toBe(configPath);
}

function roleForm(page: Page, role: string): Locator {
  return page.getByRole('form', { name: roleLabel(role), exact: true });
}

function section(page: Page, name: string): Locator {
  return page.getByRole('region', { name, exact: true });
}

async function expectRoleForm(form: Locator, setting: RoleSetting): Promise<void> {
  await expect(form.getByRole('combobox', { name: 'Model' })).toHaveValue(setting.model);
  await expect(form.getByRole('combobox', { name: 'Effort' })).toHaveValue(setting.effort);
  await expect(form.getByRole('textbox', { name: 'Max budget (USD)' })).toHaveValue(String(setting.maxBudgetUsd));
  await expect(form.getByRole('textbox', { name: 'Max turns' })).toHaveValue(String(setting.maxTurns));
  await expect(form).toContainText(`Timeout: ${english.duration(setting.timeoutMinutes * MINUTE_MS)}`);
  await expect(form.getByRole('button', { name: `Save ${roleLabel(setting.role)}` })).toBeDisabled();
}

function sameRole(left: RoleSetting, right: RoleSetting): boolean {
  return left.model === right.model && left.effort === right.effort && left.maxBudgetUsd === right.maxBudgetUsd && left.maxTurns === right.maxTurns;
}

function sameResources(left: Resources, right: Resources): boolean {
  return left.minimumFreeMemoryPercent === right.minimumFreeMemoryPercent && left.pauseAbovePressure === right.pauseAbovePressure && left.maxConcurrentRuns === right.maxConcurrentRuns;
}

async function restoreStorefrontRole(factory: RunningFactory, original: RoleSetting): Promise<void> {
  const current = roleOf(projectOf(await factory.api.state(), STOREFRONT).settings.roles, original.role);
  if (sameRole(current, original)) return;
  const reply = await factory.api.command('settings.update-role', { project: STOREFRONT, change: roleChangeOf(original) });
  expect(reply.status, 'restoring the role of the storefront').toBe(200);
}

async function restoreBudget(factory: RunningFactory, original: Budget): Promise<void> {
  const current = (await factory.api.state()).costs;
  if (dailyCapOf(current) === dailyCapOf(original) && current.perRunCapUsd === original.perRunCapUsd) return;
  const reply = await factory.api.command('settings.update-budget', { dailyCapUsd: dailyCapOf(original), perRunCapUsd: original.perRunCapUsd });
  expect(reply.status, 'restoring the budget caps').toBe(200);
}

async function restoreResources(factory: RunningFactory, original: Resources): Promise<void> {
  const acceptedByTheFactory = original.minimumFreeMemoryPercent >= MIN_FREE_MEMORY_THRESHOLD_PERCENT && original.minimumFreeMemoryPercent <= MAX_FREE_MEMORY_THRESHOLD_PERCENT;
  if (!acceptedByTheFactory || sameResources((await factory.api.state()).settings.resources, original)) return;
  const reply = await factory.api.command('settings.update-resources', original);
  expect(reply.status, 'restoring the machine limits').toBe(200);
}

async function restoreConcurrency(factory: RunningFactory, original: Concurrency): Promise<void> {
  const current = projectOf(await factory.api.state(), STOREFRONT).settings.concurrency;
  if (current.issues === original.issues && current.ceiling === original.ceiling) return;
  const reply = await factory.api.command('settings.update-concurrency', { project: STOREFRONT, ...original });
  expect(reply.status, 'restoring the concurrency of the storefront').toBe(200);
}

test.describe('the settings of the installation', () => {
  test.beforeEach(async ({ page, factory }) => {
    await openCockpit(page, factory, INSTALLATION_SETTINGS);
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  });

  test('says what runs: the version, the mode, the operator, the address, when it started and the run slots', async ({ page, factory }) => {
    const { installation } = await factory.api.state();
    const facts = section(page, 'Installation');
    await expect(factValue(facts, 'Version')).toHaveText(installation.version);
    await expect(factValue(facts, 'Mode')).toHaveText(en['vocab.installationMode.demo']);
    await expect(factValue(facts, 'Operator')).toHaveText(installation.operator);
    await expect(factValue(facts, 'Public URL').getByRole('link')).toHaveAttribute('href', installation.publicUrl);
    await expect(factValue(facts, 'Started').getByRole('time').first()).toHaveAttribute('datetime', installation.startedAt ?? '');
    await expect(facts.getByRole('list', { name: 'Run slots' }).getByRole('listitem').filter({ hasText: 'Run slot limit' })).toContainText(String(installation.runSlots.limit));
  });

  test('lists the default roles with their model, effort, limits and timeout', async ({ page, factory }) => {
    const { settings } = await factory.api.state();
    expect(settings.defaultRoles.length).toBeGreaterThan(0);
    await expect(section(page, 'Default roles').getByRole('list', { name: 'Roles and their limits' }).getByRole('listitem')).toHaveCount(settings.defaultRoles.length);
    for (const setting of settings.defaultRoles) await expectRoleForm(roleForm(page, setting.role), setting);
  });

  test('shows the limits of the machine the factory keeps to', async ({ page, factory }) => {
    const { resources } = (await factory.api.state()).settings;
    const form = page.getByRole('form', { name: 'Machine resources' });
    await expect(form.getByRole('textbox', { name: 'Minimum free memory (%)' })).toHaveValue(String(resources.minimumFreeMemoryPercent));
    await expect(form.getByRole('combobox', { name: 'Pause new runs above memory pressure' })).toHaveValue(resources.pauseAbovePressure);
    await expect(form.getByRole('textbox', { name: 'Agent runs at once' })).toHaveValue(String(resources.maxConcurrentRuns));
    await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('shows that no cap is set when the installation sets none', async ({ page, factory }) => {
    const { costs } = await factory.api.state();
    expect(costs.dailyCap).toEqual({ kind: 'none' });
    expect(costs.perRunCapUsd).toBeNull();
    const form = page.getByRole('form', { name: 'Budget caps' });
    await expect(form.getByRole('textbox', { name: 'Daily cap (USD)' })).toHaveValue('');
    await expect(form.getByRole('textbox', { name: 'Daily cap (USD)' })).toHaveAttribute('placeholder', 'No cap');
    await expect(form).toContainText('No daily cap');
    await expect(form.getByRole('textbox', { name: 'Per-run cap (USD)' })).toHaveValue('');
    await expect(form).toContainText('No per-run cap: the budget of each role is the only limit');
    await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('says that no notification channel is known and that the cockpit is reachable from this machine only', async ({ page, factory }) => {
    const { settings } = await factory.api.state();
    expect(settings.notifications).toEqual([]);
    expect(settings.remoteAccess).toBe('none');
    await expect(section(page, 'Notification channels')).toContainText('No notification channel is known.');
    const remote = section(page, 'Remote access');
    await expect(remote).toContainText(en['vocab.remoteAccess.none']);
    await expect(remote).toContainText('The cockpit is reachable from this machine only.');
  });

  test('shows where the configuration file is and that no setting waits for a restart', async ({ page, factory }) => {
    const { configuration } = (await factory.api.state()).settings;
    expect(configuration.restartRequired).toEqual([]);
    expect(configuration.reloadFailure).toBeNull();
    const file = section(page, 'Configuration file');
    await expect(factValue(file, 'Path')).toContainText(configuration.path);
    await expect(file.getByRole('button', { name: 'Copy the path' })).toBeVisible();
    await expect(factValue(file, 'Waiting for a restart')).toHaveText('No setting waits for a restart.');
    await expect(factValue(file, 'Last reload')).toHaveText('The factory has not refused the file.');
  });

  test('saves the limits of the machine', async ({ page, factory }) => {
    const before = await factory.api.state();
    const original = before.settings.resources;
    const saved = original.minimumFreeMemoryPercent === MIN_FREE_MEMORY_THRESHOLD_PERCENT ? MIN_FREE_MEMORY_THRESHOLD_PERCENT + ONE_MORE : MIN_FREE_MEMORY_THRESHOLD_PERCENT;
    const form = page.getByRole('form', { name: 'Machine resources' });
    const memory = form.getByRole('textbox', { name: 'Minimum free memory (%)' });
    try {
      await memory.fill(String(saved));
      await expect(memory).not.toHaveAttribute('aria-invalid', 'true');
      const outcome = await clickCommand(page, 'settings.update-resources', async () => {
        await form.getByRole('button', { name: 'Save' }).click();
      });
      expectSavedTo(outcome.effect, before.settings.configuration.path);
      const after = await factory.api.until('the machine limits are saved', (state) => state.settings.resources.minimumFreeMemoryPercent === saved);
      expect(after.settings.resources).toEqual({ ...original, minimumFreeMemoryPercent: saved });
      expect(after.resources.minimumFreeMemoryPercent).toBe(saved);
      expect(after.resources.pauseAbovePressure).toBe(original.pauseAbovePressure);
      await expect(memory).toHaveValue(String(saved));
      await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();
    } finally {
      await restoreResources(factory, original);
    }
  });

  test('sets a daily cap, then clears it: an empty field means no cap and never zero', async ({ page, factory }) => {
    const before = await factory.api.state();
    expect(before.costs.dailyCap).toEqual({ kind: 'none' });
    const form = page.getByRole('form', { name: 'Budget caps' });
    const dailyCap = form.getByRole('textbox', { name: 'Daily cap (USD)' });
    const save = form.getByRole('button', { name: 'Save' });
    try {
      await dailyCap.fill(String(DAILY_CAP_USD));
      const setting = await clickCommand(page, 'settings.update-budget', async () => {
        await save.click();
      });
      expectSavedTo(setting.effect, before.settings.configuration.path);
      const capped = await factory.api.until('the daily cap is set', (state) => state.costs.dailyCap.kind === 'usd');
      expect(capped.costs.dailyCap).toEqual({ kind: 'usd', amount: DAILY_CAP_USD });
      expect(capped.costs.perRunCapUsd).toBeNull();
      await expect(form).toContainText(`Current daily cap: ${english.usd(DAILY_CAP_USD)}`);
      await dailyCap.fill('');
      const clearing = page.waitForRequest((request) => request.url().endsWith(commandPath('settings.update-budget')) && request.method() === 'POST');
      const clearance = await clickCommand(page, 'settings.update-budget', async () => {
        await save.click();
      });
      expectSavedTo(clearance.effect, before.settings.configuration.path);
      expect((await clearing).postDataJSON()).toEqual({ dailyCapUsd: null, perRunCapUsd: null });
      const cleared = await factory.api.until('the daily cap is cleared', (state) => state.costs.dailyCap.kind === 'none');
      expect(cleared.costs.dailyCap).toEqual({ kind: 'none' });
      expect(cleared.costs.perRunCapUsd).toBeNull();
      await expect(form).toContainText('No daily cap');
      await expect(dailyCap).toHaveValue('');
    } finally {
      await restoreBudget(factory, before.costs);
    }
  });
});

test.describe('the settings of the storefront', () => {
  test.beforeEach(async ({ page, factory }) => {
    await openCockpit(page, factory, STOREFRONT_SETTINGS);
    await expect(page.getByRole('heading', { level: 1, name: 'Project settings' })).toBeVisible();
  });

  test('lists the roles with the model and the limits they work with in the project', async ({ page, factory }) => {
    const { settings } = projectOf(await factory.api.state(), STOREFRONT);
    await expect(section(page, 'Agent roles').getByRole('list', { name: 'Roles and their limits' }).getByRole('listitem')).toHaveCount(settings.roles.length);
    for (const setting of settings.roles) {
      const form = roleForm(page, setting.role);
      await expectRoleForm(form, setting);
      if (settings.overriddenPrompts.includes(setting.role)) await expect(form).toContainText('Prompt overridden');
      else await expect(form).not.toContainText('Prompt overridden');
    }
  });

  test('shows how many issues the factory works on at once and the ceiling', async ({ page, factory }) => {
    const { concurrency } = projectOf(await factory.api.state(), STOREFRONT).settings;
    const form = page.getByRole('form', { name: 'Concurrency' });
    await expect(form.getByRole('textbox', { name: 'Issues at once' })).toHaveValue(String(concurrency.issues));
    await expect(form.getByRole('textbox', { name: 'Ceiling' })).toHaveValue(String(concurrency.ceiling));
    await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('says that the project declares no setup command and lists its gate commands with the network each may reach', async ({ page, factory }) => {
    const { settings } = projectOf(await factory.api.state(), STOREFRONT);
    expect(settings.setup).toEqual([]);
    await expect(section(page, 'Setup commands')).toContainText('This project declares no setup command.');
    const gate = section(page, 'Gate commands');
    const groups = [
      { title: 'Before the acceptance checks', commands: settings.gate.beforeAcceptance },
      { title: 'After the acceptance checks', commands: settings.gate.afterAcceptance },
    ];
    for (const { title, commands } of groups) {
      const items = gate.getByRole('group', { name: title }).getByRole('list', { name: title }).getByRole('listitem');
      await expect(items).toHaveCount(commands.length);
      for (const command of commands) {
        const item = items.filter({ hasText: command.name });
        await expect(item).toContainText(command.run);
        await expect(item).toContainText(command.network === null ? 'No network' : `Network: ${command.network}`);
      }
    }
    await expect(gate).toContainText(`The gate times out after ${english.duration(settings.gate.timeoutMinutes * MINUTE_MS)}.`);
  });

  test('names the variables the check commands receive without their values', async ({ page, factory }) => {
    const { settings } = projectOf(await factory.api.state(), STOREFRONT);
    await expect(section(page, 'Check environment').getByRole('list', { name: 'Check environment' }).getByRole('listitem')).toHaveText(settings.environmentVariables);
  });

  test('states the labels, the branch prefix and the release model of the project', async ({ page, factory }) => {
    const { settings } = projectOf(await factory.api.state(), STOREFRONT);
    const conventions = section(page, 'Conventions');
    await expect(factValue(conventions, 'Factory label')).toHaveText(settings.labels.factory);
    await expect(factValue(conventions, 'Validated label')).toHaveText(settings.labels.validated);
    await expect(factValue(conventions, 'Audit label')).toHaveText(settings.labels.audit);
    await expect(factValue(conventions, 'Kind label prefix')).toHaveText(settings.labels.kindPrefix);
    await expect(factValue(conventions, 'Branch prefix')).toHaveText(settings.branchPrefix);
    await expect(factValue(conventions, 'Release model')).toHaveText(en[`vocab.releaseModel.${settings.releaseModel}`]);
  });

  test('lists the other automations of the repository with the branches and authors they match', async ({ page, factory }) => {
    const { settings } = projectOf(await factory.api.state(), STOREFRONT);
    expect(settings.automations.length).toBeGreaterThan(0);
    const automations = section(page, 'Automations').getByRole('list', { name: 'Automations' });
    for (const automation of settings.automations) {
      const item = automations.getByRole('listitem').filter({ hasText: automation.name });
      await expect(item).toContainText(automation.branches.length === 0 ? 'Any branch' : automation.branches.join(''));
      for (const author of automation.authors) await expect(item.getByText(author, { exact: true })).toBeVisible();
    }
  });

  test('lists the issue types of the project with the proof and the commit type of each', async ({ page, factory }) => {
    const { issueTypes } = projectOf(await factory.api.state(), STOREFRONT);
    const items = section(page, 'Issue types').getByRole('list', { name: 'Issue types' }).getByRole('listitem');
    await expect(items).toHaveCount(issueTypes.length);
    for (const type of issueTypes) {
      const item = items.filter({ has: page.getByText(type.label, { exact: true }) });
      await expect(item).toContainText(en[`vocab.proofStrategy.${type.proof}`]);
      await expect(item).toContainText(type.commitScope === null ? type.commitType : `${type.commitType}(${type.commitScope})`);
    }
  });

  test('saves the limits of one role of the storefront and leaves the default roles alone', async ({ page, factory }) => {
    const before = await factory.api.state();
    const original = roleOf(projectOf(before, STOREFRONT).settings.roles, AUDITOR);
    const defaults = roleOf(before.settings.defaultRoles, AUDITOR);
    const ledger = roleOf(projectOf(before, LEDGER).settings.roles, AUDITOR);
    const turns = original.maxTurns + ONE_MORE;
    const form = roleForm(page, AUDITOR);
    try {
      await form.getByRole('textbox', { name: 'Max turns' }).fill(String(turns));
      const outcome = await clickCommand(page, 'settings.update-role', async () => {
        await form.getByRole('button', { name: `Save ${roleLabel(AUDITOR)}` }).click();
      });
      expectSavedTo(outcome.effect, before.settings.configuration.path);
      const after = await factory.api.until('the auditor of the storefront has its new turns', (state) => roleOf(projectOf(state, STOREFRONT).settings.roles, AUDITOR).maxTurns === turns);
      expect(roleOf(projectOf(after, STOREFRONT).settings.roles, AUDITOR)).toEqual({ ...original, maxTurns: turns });
      expect(roleOf(after.settings.defaultRoles, AUDITOR)).toEqual(defaults);
      expect(roleOf(projectOf(after, LEDGER).settings.roles, AUDITOR)).toEqual(ledger);
      await expect(form.getByRole('textbox', { name: 'Max turns' })).toHaveValue(String(turns));
      await expect(form.getByRole('button', { name: `Save ${roleLabel(AUDITOR)}` })).toBeDisabled();
    } finally {
      await restoreStorefrontRole(factory, original);
    }
  });

  test('saves how many issues of the storefront the factory may work on at once', async ({ page, factory }) => {
    const before = await factory.api.state();
    const original = projectOf(before, STOREFRONT).settings.concurrency;
    const ledger = projectOf(before, LEDGER).settings.concurrency;
    const ceiling = original.ceiling - ONE_LESS;
    expect(ceiling, 'a ceiling the storefront can be lowered to').toBeGreaterThanOrEqual(original.issues);
    const form = page.getByRole('form', { name: 'Concurrency' });
    try {
      await form.getByRole('textbox', { name: 'Ceiling' }).fill(String(ceiling));
      const outcome = await clickCommand(page, 'settings.update-concurrency', async () => {
        await form.getByRole('button', { name: 'Save' }).click();
      });
      expectSavedTo(outcome.effect, before.settings.configuration.path);
      const after = await factory.api.until('the ceiling of the storefront is saved', (state) => projectOf(state, STOREFRONT).settings.concurrency.ceiling === ceiling);
      expect(projectOf(after, STOREFRONT).settings.concurrency).toEqual({ issues: original.issues, ceiling });
      expect(projectOf(after, LEDGER).settings.concurrency).toEqual(ledger);
      await expect(form.getByRole('textbox', { name: 'Ceiling' })).toHaveValue(String(ceiling));
      await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();
    } finally {
      await restoreConcurrency(factory, original);
    }
  });

  test('shows why the factory refuses a ceiling its worktrees cannot hold, and changes nothing', async ({ page, factory }) => {
    const before = await factory.api.state();
    const original = projectOf(before, STOREFRONT).settings.concurrency;
    const form = page.getByRole('form', { name: 'Concurrency' });
    try {
      await form.getByRole('textbox', { name: 'Ceiling' }).fill(String(CEILING_NO_WORKTREE_POOL_HOLDS));
      const outcome = await clickCommand(
        page,
        'settings.update-concurrency',
        async () => {
          await form.getByRole('button', { name: 'Save' }).click();
        },
        { status: CONFLICT_STATUS },
      );
      expect(outcome.error).toContain('must not exceed worktrees.size');
      const after = await factory.api.state();
      expect(projectOf(after, STOREFRONT).settings.concurrency).toEqual(original);
      expect(after.settings.configuration).toEqual(before.settings.configuration);
    } finally {
      await restoreConcurrency(factory, original);
    }
  });
});
