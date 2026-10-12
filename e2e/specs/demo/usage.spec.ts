import type { Locator, Page } from '@playwright/test';
import type { CostEntry, UsageAccountView, UsageLimitView } from '../../../packages/cockpit/src/contract/index.ts';
import { en } from '../../../packages/cockpit/src/i18n/catalog/en/index.ts';
import { MINUTE_MS } from '../../../packages/cockpit/src/i18n/formatters.ts';
import { ONE_LOOK, untilPageAgreesWithFactory } from '../../support/agreement.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import { english } from '../../support/formats.ts';
import { isLater } from '../../support/instants.ts';
import { roleLabel } from '../../support/labels.ts';
import { expect, test } from '../../support/test.ts';

const PRIMARY_ACCOUNT = 'primary';
const USAGE_READ_EVENT = 'usage.read';
/** How many entries a card of the breakdown lists before the operator asks for the rest. */
const ENTRIES_LISTED = 8;

function accountOf(accounts: readonly UsageAccountView[]): UsageAccountView {
  const account = accounts.find((candidate) => candidate.name === PRIMARY_ACCOUNT);
  if (account === undefined) throw new Error(`the installation reports no account ${PRIMARY_ACCOUNT}`);
  return account;
}

function readOf(account: UsageAccountView): { readonly source: NonNullable<UsageAccountView['source']>; readonly readAt: string } {
  if (account.source === null || account.readAt === null) throw new Error(`the account ${account.name} was never read`);
  return { source: account.source, readAt: account.readAt };
}

function accountCard(page: Page): Locator {
  return page.getByRole('group', { name: PRIMARY_ACCOUNT, exact: true });
}

function limitName(limit: UsageLimitView): string {
  const kind = en[`vocab.usageLimitKind.${limit.kind}`];
  return limit.scope === null ? kind : `${kind} · ${limit.scope}`;
}

function loginOf(account: UsageAccountView): string {
  const { identity } = account;
  if (identity === null) return en['account.loginUnknown'];
  const plan = identity.plan === null ? null : `${identity.plan} plan`;
  return [identity.email, identity.organization, plan].filter((part) => part !== null).join(' · ');
}

function runCount(count: number): string {
  return count === 1 ? '1 run' : `${count} runs`;
}

function figureCard(figures: Locator, label: string): Locator {
  return figures.locator(':scope > *').filter({ hasText: new RegExp(`^${label}`) });
}

async function expectEntry(item: Locator, entry: CostEntry): Promise<void> {
  await expect(item).toContainText(english.usd(entry.costUsd), ONE_LOOK);
  await expect(item).toContainText('API-equivalent', ONE_LOOK);
  await expect(item).toContainText(runCount(entry.runs), ONE_LOOK);
  await expect(item).toContainText(`${english.compact(entry.tokens.withCache)} tokens including cache`, ONE_LOOK);
  await expect(item).toContainText(`${english.compact(entry.tokens.withoutCache)} tokens excluding cache`, ONE_LOOK);
}

test.describe('the usage and the costs of the demonstration', () => {
  test.beforeEach(async ({ page, factory }) => {
    await openCockpit(page, factory, '/usage');
    await expect(page.getByRole('heading', { level: 1, name: 'Usage and costs' })).toBeVisible();
  });

  test('shows the account that runs the agents, who it is logged in as, where its usage was read and when', async ({ page, factory }) => {
    const section = page.getByRole('region', { name: 'Subscription usage' });
    await expect(section.getByRole('list', { name: 'Accounts' }).getByRole('group')).toHaveCount(1);
    await untilPageAgreesWithFactory(async () => {
      const account = accountOf((await factory.api.state()).usage.accounts);
      const { source, readAt } = readOf(account);
      await expect(accountCard(page).getByRole('heading', { level: 3 })).toHaveText(`${account.name} — ${loginOf(account)}`, ONE_LOOK);
      await expect(accountCard(page)).toContainText(en[`vocab.billing.${account.billing}`], ONE_LOOK);
      await expect(accountCard(page)).toContainText(`Source: ${en[`vocab.usageSource.${source}`]}`, ONE_LOOK);
      await expect(accountCard(page).getByText(/^Read /)).toHaveAttribute('datetime', readAt, ONE_LOOK);
    });
  });

  test('states how often the usage is read and after how long a reading is stale', async ({ page, factory }) => {
    const { usage } = await factory.api.state();
    const refresh = english.duration(usage.refreshMinutes * MINUTE_MS);
    const stale = english.duration(usage.staleAfterMinutes * MINUTE_MS);
    await expect(page.getByRole('region', { name: 'Subscription usage' })).toContainText(`Usage is read every ${refresh}. A reading older than ${stale} is shown as stale.`);
  });

  test('draws each limit of the account with its utilization, its freshness, where the factory pauses and when it resets', async ({ page, factory }) => {
    const limits = accountCard(page).getByRole('list', { name: `Limits of ${PRIMARY_ACCOUNT}` }).getByRole('listitem');
    await untilPageAgreesWithFactory(async () => {
      const account = accountOf((await factory.api.state()).usage.accounts);
      expect(account.limits.length).toBeGreaterThan(0);
      await expect(limits).toHaveCount(account.limits.length, ONE_LOOK);
      for (const limit of account.limits) {
        const row = limits.filter({ hasText: limitName(limit) });
        await expect(row).toContainText(en[`vocab.usageFreshness.${limit.freshness}`], ONE_LOOK);
        await expect(row).toContainText(english.percent(limit.utilization), ONE_LOOK);
        await expect(row.getByRole('meter', { name: `Utilization of ${limitName(limit)}` })).toHaveAttribute('aria-valuenow', String(Math.round(limit.utilization * 100)), ONE_LOOK);
        await expect(row).toContainText(`The factory pauses at ${english.percent(limit.pauseAt)}`, ONE_LOOK);
        expect(limit.resetsAt).not.toBeNull();
        await expect(row).toContainText('Resets', ONE_LOOK);
        await expect(row.getByText(english.dateTime(limit.resetsAt ?? ''))).toBeVisible(ONE_LOOK);
      }
    });
  });

  test('reads the subscription usage again when asked and shows the new reading time', async ({ page, factory }) => {
    const before = accountOf((await factory.api.state()).usage.accounts);
    const outcome = await clickCommand(page, 'usage.refresh', async () => {
      await page.getByRole('button', { name: 'Refresh usage' }).click();
    });
    expect(outcome.effect).toBe('Subscription usage read for 1 account(s)');
    const state = await factory.api.until('the account was read again', (current) => isLater(accountOf(current.usage.accounts).readAt, before.readAt));
    expect(accountOf(state.usage.accounts).lastFailure).toBeNull();
    expect(state.activity.some((event) => event.type === USAGE_READ_EVENT && event.subject === `usage/${PRIMARY_ACCOUNT}` && isLater(event.occurredAt, before.readAt))).toBe(true);
    await untilPageAgreesWithFactory(async () => {
      const { readAt, source } = readOf(accountOf((await factory.api.state()).usage.accounts));
      expect(isLater(readAt, before.readAt)).toBe(true);
      await expect(accountCard(page).getByText(/^Read /)).toHaveAttribute('datetime', readAt, ONE_LOOK);
      await expect(accountCard(page)).toContainText(`Source: ${en[`vocab.usageSource.${source}`]}`, ONE_LOOK);
    });
  });

  test('says that the dollar figures are API-equivalent prices and shows the cost of today and of the month', async ({ page, factory }) => {
    expect((await factory.api.state()).costs.basis).toBe('subscription-equivalent');
    const section = page.getByRole('region', { name: 'Costs' });
    await expect(section.getByRole('note')).toContainText('Dollar figures are API-equivalent prices');
    await expect(section.getByRole('note')).toContainText('The subscription covers this usage: it is not money spent.');
    const figures = section.getByRole('group', { name: 'Cost figures' });
    await untilPageAgreesWithFactory(async () => {
      const { costs } = await factory.api.state();
      const today = figureCard(figures, 'Today');
      await expect(today).toContainText(english.usd(costs.today.costUsd), ONE_LOOK);
      await expect(today).toContainText('API-equivalent', ONE_LOOK);
      await expect(today).toContainText(`${english.calendarDay(costs.today.date)} · ${runCount(costs.today.runs)}`, ONE_LOOK);
      const month = figureCard(figures, 'Month to date');
      await expect(month).toContainText(english.usd(costs.monthToDateUsd), ONE_LOOK);
      await expect(month).toContainText('Since the first day of the month', ONE_LOOK);
    });
  });

  test('says that no daily cap and no per-run cap are set', async ({ page, factory }) => {
    const { costs } = await factory.api.state();
    expect(costs.dailyCap).toEqual({ kind: 'none' });
    expect(costs.perRunCapUsd).toBeNull();
    const figures = page.getByRole('region', { name: 'Costs' }).getByRole('group', { name: 'Cost figures' });
    await expect(figureCard(figures, 'Daily cap')).toContainText('No daily cap');
    await expect(figureCard(figures, 'Daily cap')).toContainText('No daily cost pauses the factory.');
    await expect(figureCard(figures, 'Per-run cap')).toContainText('No per-run cap');
    await expect(figureCard(figures, 'Per-run cap')).toContainText('Each run keeps the budget of its role.');
    await expect(page.getByRole('region', { name: 'Cost per day' })).toContainText('No daily cap: the chart draws no limit line.');
  });

  test('draws the cost of each day of the period with its total, its average and its number of runs', async ({ page, factory }) => {
    const section = page.getByRole('region', { name: 'Cost per day' });
    await untilPageAgreesWithFactory(async () => {
      const { costs } = await factory.api.state();
      const total = costs.daily.reduce((sum, day) => sum + day.costUsd, 0);
      const runs = costs.daily.reduce((sum, day) => sum + day.runs, 0);
      await expect(section).toContainText(`The last ${costs.daily.length} days`, ONE_LOOK);
      await expect(section.getByRole('img', { name: `Cost per day over the last ${costs.daily.length} days` })).toBeVisible(ONE_LOOK);
      await expect(section.getByRole('definition').nth(0)).toContainText(english.usd(total), ONE_LOOK);
      await expect(section.getByRole('definition').nth(1)).toContainText(english.usd(total / costs.daily.length), ONE_LOOK);
      await expect(section.getByRole('definition').nth(2)).toHaveText(english.integer(runs), ONE_LOOK);
    });
  });

  test('states the token totals with the cache and without it, and what the cache adds', async ({ page, factory }) => {
    const section = page.getByRole('region', { name: 'Tokens' });
    await untilPageAgreesWithFactory(async () => {
      const { tokens } = (await factory.api.state()).costs;
      await expect(section.getByRole('term').nth(0)).toHaveText('Including cache', ONE_LOOK);
      await expect(section.getByRole('definition').nth(0)).toHaveText(english.integer(tokens.withCache), ONE_LOOK);
      await expect(section.getByRole('term').nth(1)).toHaveText('Excluding cache', ONE_LOOK);
      await expect(section.getByRole('definition').nth(1)).toHaveText(english.integer(tokens.withoutCache), ONE_LOOK);
      await expect(section.getByRole('definition').nth(2)).toHaveText(english.integer(tokens.input), ONE_LOOK);
      await expect(section.getByRole('definition').nth(3)).toHaveText(english.integer(tokens.output), ONE_LOOK);
      await expect(section.getByRole('definition').nth(4)).toHaveText(english.integer(tokens.cacheRead), ONE_LOOK);
      await expect(section.getByRole('definition').nth(5)).toHaveText(english.integer(tokens.cacheCreation), ONE_LOOK);
    });
    await expect(section.getByRole('term').nth(2)).toHaveText('Input');
    await expect(section.getByRole('term').nth(3)).toHaveText('Output');
    await expect(section.getByRole('term').nth(4)).toHaveText('Cache read');
    await expect(section.getByRole('term').nth(5)).toHaveText('Cache creation');
    await expect(section).toContainText('Including cache adds the tokens read from and written to the prompt cache to the input and output tokens.');
  });

  test('splits the cost by project, by role, by model and by issue', async ({ page, factory }) => {
    const section = page.getByRole('region', { name: 'Breakdown' });
    await untilPageAgreesWithFactory(async () => {
      const state = await factory.api.state();
      const { costs } = state;
      const byProject = section.getByRole('list', { name: 'By project' }).getByRole('listitem');
      await expect(byProject).toHaveCount(costs.byProject.length, ONE_LOOK);
      for (const entry of costs.byProject) {
        const name = state.projects.find((project) => project.id === entry.key)?.name ?? entry.key;
        await expectEntry(byProject.filter({ has: page.getByRole('link', { name, exact: true }) }), entry);
      }
      const byRole = section.getByRole('list', { name: 'By role' }).getByRole('listitem');
      await expect(byRole).toHaveCount(costs.byRole.length, ONE_LOOK);
      for (const entry of costs.byRole) await expectEntry(byRole.filter({ hasText: roleLabel(entry.key) }), entry);
      const byModel = section.getByRole('list', { name: 'By model' }).getByRole('listitem');
      await expect(byModel).toHaveCount(costs.byModel.length, ONE_LOOK);
      for (const entry of costs.byModel) await expectEntry(byModel.filter({ hasText: entry.key }), entry);
      const dearestIssues = costs.byIssue.toSorted((left, right) => right.costUsd - left.costUsd).slice(0, ENTRIES_LISTED);
      const byIssue = section.getByRole('list', { name: 'By issue' }).getByRole('listitem');
      await expect(byIssue).toHaveCount(dearestIssues.length, ONE_LOOK);
      for (const entry of dearestIssues) {
        const name = state.projects.find((project) => project.id === entry.project)?.name ?? entry.project;
        await expectEntry(byIssue.filter({ has: page.getByRole('link', { name: `Open issue #${entry.issueNumber} of ${name}` }) }), entry);
      }
    });
  });
});
