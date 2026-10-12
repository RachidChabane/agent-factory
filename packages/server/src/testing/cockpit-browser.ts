import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const COCKPIT_PACKAGE = '@agent-factory/cockpit';
const BUILD_NICENESS = '10';
const BUILD_TIMEOUT_MS = 180_000;
const MENU_RENDER_TIMEOUT_MS = 10_000;
const SIDEBAR_SELECTOR = 'nav.sidebar';
const CONTENT_SELECTOR = 'main#content';
const HEADING_SELECTOR = `${CONTENT_SELECTOR} h1`;
const BUSY_SELECTOR = `${CONTENT_SELECTOR} [aria-busy="true"]`;
const ASSETS_PATH_PREFIX = '/assets/';

/** Whether the Chromium that Playwright drives is installed on this machine; a test that needs it is skipped without. */
export function chromiumInstalled(): boolean {
  return existsSync(chromium.executablePath());
}

export function launchChromium(): Promise<Browser> {
  return chromium.launch();
}

/** Builds the cockpit of the working tree into a directory, at a low priority. */
export function buildCockpit(outputDirectory: string): void {
  execFileSync('nice', ['-n', BUILD_NICENESS, 'pnpm', '--filter', COCKPIT_PACKAGE, 'exec', 'vite', 'build', '--outDir', outputDirectory, '--emptyOutDir'], {
    cwd: REPOSITORY_ROOT,
    stdio: 'pipe',
    timeout: BUILD_TIMEOUT_MS,
  });
}

export interface MenuEntry {
  readonly href: string;
  readonly label: string;
}

/** The entries of the sidebar, in the order they are drawn. */
export async function menuEntries(page: Page): Promise<readonly MenuEntry[]> {
  const links = await page.locator(`${SIDEBAR_SELECTOR} a.sidebar__link`).all();
  return Promise.all(links.map(async (link) => ({ href: (await link.getAttribute('href')) ?? '', label: ((await link.locator('.sidebar__label').textContent()) ?? '').trim() })));
}

export function menuLink(page: Page, href: string) {
  return page.locator(`${SIDEBAR_SELECTOR} a[href="${href}"]`);
}

/**
 * Clicks the entry in the page itself and resolves with the milliseconds until the view of its address is drawn: the
 * address is reached, a heading other than the previous view's stands, and nothing is still loading.
 */
const MENU_CLICK_SCRIPT = `({ href, sidebar, heading, busy, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const started = performance.now();
    if (location.pathname + location.search === href) {
      resolve(0);
      return;
    }
    const previous = document.querySelector(heading);
    const ready = () => {
      const current = document.querySelector(heading);
      return location.pathname + location.search === href && current !== null && current !== previous && document.querySelector(busy) === null;
    };
    const settle = () => {
      if (!ready()) return;
      observer.disconnect();
      clearTimeout(deadline);
      resolve(performance.now() - started);
    };
    const observer = new MutationObserver(settle);
    const deadline = setTimeout(() => {
      observer.disconnect();
      reject(new Error(href + ' did not render within ' + timeoutMs + ' ms'));
    }, timeoutMs);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    const link = document.querySelector(sidebar + ' a[href="' + href + '"]');
    if (link === null) {
      observer.disconnect();
      clearTimeout(deadline);
      reject(new Error('no menu entry for ' + href));
      return;
    }
    link.click();
    settle();
  })`;

export async function clickMenuAndMeasure(page: Page, href: string): Promise<number> {
  const arguments_ = JSON.stringify({ href, sidebar: SIDEBAR_SELECTOR, heading: HEADING_SELECTOR, busy: BUSY_SELECTOR, timeoutMs: MENU_RENDER_TIMEOUT_MS });
  const measured: unknown = await page.evaluate(`(${MENU_CLICK_SCRIPT})(${arguments_})`);
  if (typeof measured !== 'number') throw new Error(`the menu click measured ${String(measured)}`);
  return measured;
}

const ASSET_TRANSFER_SCRIPT = `performance
  .getEntriesByType('resource')
  .filter((entry) => new URL(entry.name).pathname.startsWith('${ASSETS_PATH_PREFIX}'))
  .map((entry) => entry.transferSize)`;

/** The bytes the browser transferred for each hashed asset of the page: none when it served them from its cache. */
export async function assetTransferSizes(page: Page): Promise<readonly number[]> {
  const sizes: unknown = await page.evaluate(ASSET_TRANSFER_SCRIPT);
  if (!Array.isArray(sizes) || !sizes.every((size): size is number => typeof size === 'number')) throw new Error('the page reported no transfer sizes');
  return sizes;
}

export const COCKPIT_HEADING_SELECTOR = HEADING_SELECTOR;
export const COCKPIT_ALERT_SELECTOR = `${CONTENT_SELECTOR} [role="alert"]`;
export const COCKPIT_SIDEBAR_SELECTOR = SIDEBAR_SELECTOR;
