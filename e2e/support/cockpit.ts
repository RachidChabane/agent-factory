import { expect, type Locator, type Page } from '@playwright/test';
import { API_COMMANDS_PATH, API_STATE_PATH, CockpitSnapshotSchema, type CockpitSnapshot } from '../../packages/cockpit/src/contract/index.ts';
import type { Locale } from '../../packages/cockpit/src/i18n/locale.ts';
import type { RunningFactory } from './factory.ts';
import { wordsIn } from './words.ts';

/** Opens a page of the cockpit and waits for its navigation, which the cockpit names in the language it is shown in. */
export async function openCockpit(page: Page, factory: RunningFactory, path = '/', language: Locale = 'en'): Promise<void> {
  await page.goto(`${factory.origin}${path}`);
  await expect(page.getByRole('navigation', { name: wordsIn(language).t('nav.main') })).toBeVisible();
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

/** The snapshots a page receives: the last one is what the page shows. */
export interface SnapshotTrail {
  latest(): CockpitSnapshot;
}

/**
 * Follows the snapshots the page receives from now on. A value the factory estimates from its clock, such as the
 * arrival of a film, moves with every snapshot, so a spec compares the page with the snapshot the page holds.
 */
export function followSnapshots(page: Page): SnapshotTrail {
  let latest: CockpitSnapshot | null = null;
  let unreadable: unknown = null;
  page.on('response', (response) => {
    if (new URL(response.url()).pathname !== API_STATE_PATH) return;
    void response
      .json()
      .then((body: unknown) => {
        latest = CockpitSnapshotSchema.parse(body);
      })
      .catch((error: unknown) => {
        unreadable = error;
      });
  });
  return {
    latest: () => {
      if (unreadable !== null) throw new Error('the page received a snapshot that does not parse', { cause: unreadable });
      if (latest === null) throw new Error('the page has received no snapshot yet');
      return latest;
    },
  };
}
