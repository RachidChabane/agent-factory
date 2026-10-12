import { createdFile } from '../patch.ts';
import type { PatchedFile } from '../patch.ts';
import { CHECK_PATH } from './paths.ts';

/** Frozen checks of the issues being worked on. */
export const STATUS_FILTER_CHECK_FILES: readonly PatchedFile[] = [
  createdFile(CHECK_PATH.statusFilter, [
    "import { test, expect } from '@playwright/test';",
    "import { signedInAs } from '../support/session';",
    '',
    "test('filters the order history by status and keeps the choice in the address', async ({ page }) => {",
    "  await signedInAs(page, 'dana.reyes@example.com');",
    "  await page.goto('/orders');",
    "  await page.getByLabel('Status').selectOption('delivered');",
    '  await expect(page).toHaveURL(/\\?status=delivered$/);',
    "  await expect(page.getByTestId('order-row')).toHaveCount(3);",
    '  await page.reload();',
    "  await expect(page.getByLabel('Status')).toHaveValue('delivered');",
    '});',
  ]),
  createdFile(CHECK_PATH.statusFilterEmpty, [
    "import { test, expect } from '@playwright/test';",
    "import { signedInAs } from '../support/session';",
    '',
    "test('tells the customer when no order has the chosen status', async ({ page }) => {",
    "  await signedInAs(page, 'riley.chen@example.com');",
    "  await page.goto('/orders?status=returned');",
    "  await expect(page.getByText('No orders with this status')).toBeVisible();",
    "  await page.getByRole('link', { name: 'Clear the filter' }).click();",
    "  await expect(page.getByTestId('order-row')).not.toHaveCount(0);",
    '});',
  ]),
];

const PROMO_SAVINGS_LINES: readonly string[] = [
  "import { test, expect } from '@playwright/test';",
  "import { applyPromoCode } from '../support/cart';",
  '',
  "test('shows what the promo code saves in the cart summary', async ({ page }) => {",
  "  await page.goto('/cart?shop=fr');",
  "  await applyPromoCode(page, 'WELCOME10');",
  "  const savings = page.getByTestId('promo-savings');",
  "  await expect(savings).toHaveText('-$4.20');",
  '});',
];

export const PROMO_SAVINGS_TEST_NAME = 'shows what the promo code saves in the cart summary';
export const PROMO_SAVINGS_TEST_LINE = PROMO_SAVINGS_LINES.findIndex((line) => line.startsWith('test(')) + 1;
export const PROMO_SAVINGS_ASSERTION_LINE = PROMO_SAVINGS_LINES.findIndex((line) => line.includes('toHaveText')) + 1;

export const PROMO_SAVINGS_CHECK_FILES: readonly PatchedFile[] = [createdFile(CHECK_PATH.promoSavings, PROMO_SAVINGS_LINES)];
