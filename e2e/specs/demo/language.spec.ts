import type { Page } from '@playwright/test';
import { LOCALE_QUERY_PARAMETER, LOCALE_STORAGE_KEY } from '../../../packages/cockpit/src/i18n/locale.ts';
import { openCockpit } from '../../support/cockpit.ts';
import type { RunningFactory } from '../../support/factory.ts';
import { expect, test } from '../../support/test.ts';

const ENGLISH_NAVIGATION = 'Main navigation';
const FRENCH_NAVIGATION = 'Navigation principale';

function htmlOf(page: Page) {
  return page.locator('html');
}

function storedLanguage(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), LOCALE_STORAGE_KEY);
}

async function openInFrench(page: Page, factory: RunningFactory, path = '/'): Promise<void> {
  await page.goto(`${factory.origin}${path}?${LOCALE_QUERY_PARAMETER}=fr`);
  await expect(page.getByRole('navigation', { name: FRENCH_NAVIGATION })).toBeVisible();
}

test.describe('the language of the cockpit', () => {
  test('starts in English and names each language in itself', async ({ page, factory }) => {
    await openCockpit(page, factory, '/usage');
    await expect(htmlOf(page)).toHaveAttribute('lang', 'en');
    const switcher = page.getByRole('radiogroup', { name: 'Language' });
    await expect(switcher.getByRole('radio', { name: 'English' })).toBeChecked();
    await expect(switcher.getByRole('radio', { name: 'Français' })).not.toBeChecked();
    await expect(page.getByRole('heading', { level: 1, name: 'Usage and costs' })).toBeVisible();
  });

  test('switches every word of the page to French and back to English', async ({ page, factory }) => {
    await openCockpit(page, factory, '/usage');
    await page.getByRole('radio', { name: 'Français' }).click();
    await expect(htmlOf(page)).toHaveAttribute('lang', 'fr');
    const navigation = page.getByRole('navigation', { name: FRENCH_NAVIGATION });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole('link', { name: /^Tableau/ })).toBeVisible();
    await expect(navigation.getByRole('link', { name: /^Réglages/ })).toBeVisible();
    await expect(navigation.getByRole('link', { name: /^Usage et coûts/ })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Langue' }).getByRole('radio', { name: 'Français' })).toBeChecked();
    await expect(page.getByRole('heading', { level: 1, name: 'Usage et coûts' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Actualiser l’usage' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Usage and costs' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: ENGLISH_NAVIGATION })).toHaveCount(0);

    await page.getByRole('radio', { name: 'English' }).click();
    await expect(htmlOf(page)).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('navigation', { name: ENGLISH_NAVIGATION })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Usage and costs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh usage' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Usage et coûts' })).toHaveCount(0);
  });

  test('remembers the language after a reload, until the operator switches back', async ({ page, factory }) => {
    await openCockpit(page, factory, '/');
    expect(await storedLanguage(page)).toBeNull();
    await page.getByRole('radio', { name: 'Français' }).click();
    await expect(htmlOf(page)).toHaveAttribute('lang', 'fr');
    expect(await storedLanguage(page)).toBe('fr');

    await page.reload();
    await expect(page.getByRole('navigation', { name: FRENCH_NAVIGATION })).toBeVisible();
    await expect(htmlOf(page)).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('radio', { name: 'Français' })).toBeChecked();

    await page.getByRole('radio', { name: 'English' }).click();
    expect(await storedLanguage(page)).toBe('en');
    await page.reload();
    await expect(page.getByRole('navigation', { name: ENGLISH_NAVIGATION })).toBeVisible();
    await expect(htmlOf(page)).toHaveAttribute('lang', 'en');
  });

  test('opens in French when the address asks for it, without remembering it', async ({ page, factory }) => {
    await openInFrench(page, factory);
    await expect(htmlOf(page)).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('radiogroup', { name: 'Langue' }).getByRole('radio', { name: 'Français' })).toBeChecked();
    expect(await storedLanguage(page)).toBeNull();
    await openCockpit(page, factory, '/');
    await expect(htmlOf(page)).toHaveAttribute('lang', 'en');
  });

  test('lets the address win over the language the operator chose before', async ({ page, factory }) => {
    await openCockpit(page, factory, '/');
    await page.getByRole('radio', { name: 'Français' }).click();
    expect(await storedLanguage(page)).toBe('fr');
    await page.goto(`${factory.origin}/?${LOCALE_QUERY_PARAMETER}=en`);
    await expect(page.getByRole('navigation', { name: ENGLISH_NAVIGATION })).toBeVisible();
    await expect(htmlOf(page)).toHaveAttribute('lang', 'en');
  });
});
