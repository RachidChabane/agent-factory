import { expect, type Locator, type Page } from '@playwright/test';
import { API_COMMANDS_PATH } from '../../packages/cockpit/src/contract/index.ts';
import type { RunningFactory } from './factory.ts';

/** The cockpit's own navigation and pages, by the names the operator reads. */
export async function openCockpit(page: Page, factory: RunningFactory, path = '/'): Promise<void> {
  await page.goto(`${factory.origin}${path}`);
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
}

/** A column of the board. */
export function column(page: Page, name: string): Locator {
  return page.getByRole('region', { name, exact: true });
}

/** A card of the board, found by its title. */
export function card(scope: Page | Locator, title: string | RegExp): Locator {
  return scope.getByRole('article', { name: title });
}

/** The detail of a pull request: the article that carries its title, apart from the articles nested in it, such as a film. */
export function pullRequestDetail(page: Page, title: string): Locator {
  return page.getByRole('article').filter({ has: page.getByRole('heading', { level: 1, name: title, exact: true }) });
}

export function sidebar(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Main navigation' });
}

/** The commands the page sends from now on, in the order it sends them: the proof that a click which must not act sent nothing. */
export function recordCommandsSent(page: Page): string[] {
  const sent: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (request.method() === 'POST' && pathname.startsWith(`${API_COMMANDS_PATH}/`)) sent.push(pathname);
  });
  return sent;
}
