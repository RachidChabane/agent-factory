import type { Page } from '@playwright/test';
import { THEME_QUERY_PARAMETER, THEME_STORAGE_KEY } from '../../../packages/cockpit/src/app/theme.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { expect, test } from '../../support/test.ts';

const TO_LIGHT = 'Switch to the light theme';
const TO_DARK = 'Switch to the dark theme';

function htmlOf(page: Page) {
  return page.locator('html');
}

function storedTheme(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), THEME_STORAGE_KEY);
}

test.describe('the theme of the cockpit', () => {
  test.describe('in a browser that prefers the dark scheme', () => {
    test.use({ colorScheme: 'dark' });

    test('starts dark and switches to light and back with the button of the top bar', async ({ page, factory }) => {
      await openCockpit(page, factory, '/');
      await expect(htmlOf(page)).toHaveAttribute('data-theme', 'dark');
      await page.getByRole('button', { name: TO_LIGHT }).click();
      await expect(htmlOf(page)).toHaveAttribute('data-theme', 'light');
      await expect(page.getByRole('button', { name: TO_LIGHT })).toHaveCount(0);
      await page.getByRole('button', { name: TO_DARK }).click();
      await expect(htmlOf(page)).toHaveAttribute('data-theme', 'dark');
      await expect(page.getByRole('button', { name: TO_LIGHT })).toBeVisible();
    });

    test('keeps the theme the operator chose after a reload', async ({ page, factory }) => {
      await openCockpit(page, factory, '/');
      expect(await storedTheme(page)).toBeNull();
      await page.getByRole('button', { name: TO_LIGHT }).click();
      await expect(htmlOf(page)).toHaveAttribute('data-theme', 'light');
      expect(await storedTheme(page)).toBe('light');
      await page.reload();
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      await expect(htmlOf(page)).toHaveAttribute('data-theme', 'light');
      await expect(page.getByRole('button', { name: TO_DARK })).toBeVisible();
    });
  });

  test.describe('in a browser that prefers the light scheme', () => {
    test.use({ colorScheme: 'light' });

    test('starts light, and a theme chosen before wins over the scheme of the browser', async ({ page, factory }) => {
      await openCockpit(page, factory, '/');
      await expect(htmlOf(page)).toHaveAttribute('data-theme', 'light');
      await page.getByRole('button', { name: TO_DARK }).click();
      await expect(htmlOf(page)).toHaveAttribute('data-theme', 'dark');
      await page.reload();
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      await expect(htmlOf(page)).toHaveAttribute('data-theme', 'dark');
    });

    test('takes the theme named in the address without remembering it', async ({ page, factory }) => {
      await page.goto(`${factory.origin}/?${THEME_QUERY_PARAMETER}=dark`);
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      await expect(htmlOf(page)).toHaveAttribute('data-theme', 'dark');
      expect(await storedTheme(page)).toBeNull();
    });
  });
});
