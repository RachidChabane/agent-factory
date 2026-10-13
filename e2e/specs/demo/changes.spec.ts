import { openCockpit, sidebar } from '../../support/cockpit.ts';
import { expect, test } from '../../support/test.ts';

const SEEN_STORAGE_KEY = 'agent-factory.changes.seen-at';

test.describe('the landing page of the demonstration', () => {
  test.beforeEach(async ({ page, factory }) => {
    await openCockpit(page, factory, '/');
    await expect(page.getByRole('heading', { level: 1, name: 'Changes' })).toBeVisible();
  });

  test('lands on what changed and what waits for the operator, with the board one click away', async ({ page }) => {
    await expect(page.getByRole('region', { name: 'Waiting for you' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Summary of the period' })).toBeVisible();
    await sidebar(page).getByRole('link', { name: 'Board' }).click();
    await expect(page).toHaveURL(/\/board$/);
    await expect(page.getByRole('heading', { level: 1, name: /^Board/ })).toBeVisible();
  });

  test('keeps the period in the address and what was seen in the browser', async ({ page }) => {
    await expect(page).toHaveURL(/[?&]since=/);
    await page.getByRole('radio', { name: '7 days' }).click();
    await expect(page.getByRole('radio', { name: '7 days' })).toBeChecked();
    expect(await page.evaluate((key) => window.localStorage.getItem(key), SEEN_STORAGE_KEY)).toBeNull();
    await page.getByRole('button', { name: 'Mark as seen' }).click();
    await expect(page.getByText('Marked as seen')).toBeVisible();
    expect(await page.evaluate((key) => window.localStorage.getItem(key), SEEN_STORAGE_KEY)).not.toBeNull();
    await page.reload();
    await expect(page.getByText(/^Last seen:/)).toBeVisible();
  });
});
