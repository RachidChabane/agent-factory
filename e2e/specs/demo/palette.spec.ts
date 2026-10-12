import type { Locator, Page } from '@playwright/test';
import { openCockpit } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import { isLater } from '../../support/instants.ts';
import { LEDGER, STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

async function openPalette(page: Page): Promise<Locator> {
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole('combobox')).toBeFocused();
  return palette;
}

async function search(palette: Locator, words: string): Promise<void> {
  await palette.getByRole('combobox').fill(words);
}

test.describe('the command palette of the demonstration', () => {
  test.beforeEach(async ({ page, factory }) => {
    await openCockpit(page, factory, '/');
  });

  test('opens with Control K, takes the keyboard and closes with Escape', async ({ page }) => {
    const palette = await openPalette(page);
    await expect(palette.getByRole('combobox')).toHaveAttribute('placeholder', 'Search, or run an action…');
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });

  test('opens from the search button of the top bar', async ({ page }) => {
    await page.getByRole('button', { name: 'Search everywhere (⌘K)' }).click();
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  });

  test('offers a page for the factory, a page for each project and the actions of the factory', async ({ page }) => {
    const palette = await openPalette(page);
    await expect(palette.getByRole('group', { name: 'Go to' })).toBeVisible();
    await expect(palette.getByRole('group', { name: 'Projects' })).toBeVisible();
    await expect(palette.getByRole('group', { name: 'Actions' })).toBeVisible();
    await search(palette, 'go to');
    for (const destination of ['Board', 'Runs', 'Usage and costs', 'Settings']) await expect(palette.getByRole('option', { name: `Go to ${destination}` })).toBeVisible();
    await search(palette, 'storefront');
    await expect(palette.getByRole('option', { name: 'Open project Storefront' })).toBeVisible();
    await expect(palette.getByRole('option', { name: 'Delivery of Storefront' })).toBeVisible();
    await search(palette, 'pause');
    await expect(palette.getByRole('option', { name: 'Pause the factory' })).toBeVisible();
    await expect(palette.getByRole('option', { name: 'Pause Storefront' })).toBeVisible();
    await expect(palette.getByRole('option', { name: 'Pause Ledger' })).toBeVisible();
  });

  test('goes to a page of the factory with the keyboard', async ({ page }) => {
    const palette = await openPalette(page);
    await search(palette, 'usage');
    await expect(palette.getByRole('option').first()).toHaveAccessibleName(/^Go to Usage and costs/);
    await expect(palette.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/usage$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Usage and costs' })).toBeVisible();
    await expect(palette).toBeHidden();
  });

  test('goes to a page of the factory by clicking its option', async ({ page }) => {
    const palette = await openPalette(page);
    await search(palette, 'runs');
    await palette.getByRole('option', { name: 'Go to Runs' }).click();
    await expect(page).toHaveURL(/\/runs$/);
    await expect(page.getByRole('heading', { level: 1, name: /^Runs/ })).toBeVisible();
  });

  test('moves through the results with the arrow keys', async ({ page }) => {
    const palette = await openPalette(page);
    await search(palette, 'settings');
    const options = palette.getByRole('option');
    expect(await options.count()).toBeGreaterThan(2);
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'false');
    await page.keyboard.press('ArrowUp');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
  });

  test('goes to a project, then to one of its pages', async ({ page }) => {
    const palette = await openPalette(page);
    await search(palette, 'open project storefront');
    await expect(palette.getByRole('option').first()).toHaveAccessibleName(/^Open project Storefront/);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/projects/${STOREFRONT}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Storefront' })).toBeVisible();
    const again = await openPalette(page);
    await search(again, 'ledger delivery');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/projects/${LEDGER}/delivery$`));
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Delivery/ })).toHaveAttribute('aria-current', 'page');
  });

  test('says when nothing matches', async ({ page }) => {
    const palette = await openPalette(page);
    await search(palette, 'zzzzzz');
    await expect(palette.getByText('No result for “zzzzzz”')).toBeVisible();
    await expect(palette.getByRole('option')).toHaveCount(0);
  });

  test('does not offer to stop the factory, which the demonstration cannot do', async ({ page }) => {
    const palette = await openPalette(page);
    await search(palette, 'stop after running work');
    await expect(palette.getByRole('option')).toHaveCount(0);
  });

  test('refreshes the subscription usage from the palette', async ({ page, factory }) => {
    const before = (await factory.api.state()).usage.accounts;
    const outcome = await clickCommand(page, 'usage.refresh', async () => {
      const palette = await openPalette(page);
      await search(palette, 'refresh subscription');
      await expect(palette.getByRole('option').first()).toHaveAccessibleName(/^Refresh subscription usage/);
      await page.keyboard.press('Enter');
    });
    expect(outcome.effect).toBe(`Subscription usage read for ${before.length} account(s)`);
    const state = await factory.api.until('every account was read again', (current) => current.usage.accounts.every((account) => isLater(account.readAt, before.find((candidate) => candidate.name === account.name)?.readAt ?? null)));
    expect(state.usage.accounts.map((account) => account.lastFailure)).toEqual(before.map(() => null));
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
  });
});
