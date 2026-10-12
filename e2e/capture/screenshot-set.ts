import type { Page } from '@playwright/test';
import type { CockpitSnapshot } from '../../packages/cockpit/src/contract/index.ts';
import { CART_BADGE_TOTAL } from '../support/story.ts';

/** One README screenshot: the page it shows and how to get that page ready. Add a row to add a picture. */
export interface Screenshot {
  readonly file: string;
  /** The address of the page, from what the factory holds. */
  readonly path: (state: CockpitSnapshot) => string;
  /** Waits for the page to show its content and puts the part worth showing in view. */
  readonly compose: (page: Page, state: CockpitSnapshot) => Promise<void>;
}

const STOREFRONT = 'storefront';

function cartBadgeIssue(state: CockpitSnapshot) {
  const issue = state.projects.find((project) => project.id === STOREFRONT)?.issues.find((candidate) => candidate.title === CART_BADGE_TOTAL.spec.title);
  if (issue === undefined) throw new Error('the demonstration has no cart badge issue');
  return issue;
}

function cartBadgeRun(state: CockpitSnapshot) {
  const issue = cartBadgeIssue(state);
  const run = state.runs.find((candidate) => candidate.project === STOREFRONT && candidate.subject.id === String(issue.number) && candidate.role === 'implementer');
  if (run === undefined) throw new Error('the cart badge issue has no implementer run');
  return run;
}

async function showHeading(page: Page, text: string | RegExp): Promise<void> {
  await page.getByRole('heading', { level: 1 }).filter({ hasText: text }).first().waitFor();
}

export const SCREENSHOTS: readonly Screenshot[] = [
  {
    file: 'board.png',
    path: () => '/board',
    compose: async (page) => {
      await page.getByRole('region', { name: 'Delivered', exact: true }).getByRole('article').first().waitFor();
    },
  },
  {
    file: 'issue.png',
    path: (state) => `/projects/${STOREFRONT}/issues/${cartBadgeIssue(state).number}`,
    compose: async (page) => {
      await showHeading(page, CART_BADGE_TOTAL.spec.title);
      await page.getByRole('region', { name: 'Attempts', exact: true }).waitFor();
      await page.getByRole('region', { name: 'Acceptance checks', exact: true }).evaluate((element) => element.scrollIntoView({ block: 'start' }));
    },
  },
  {
    file: 'pull-request.png',
    path: (state) => `/projects/${STOREFRONT}/pull-requests/${cartBadgeIssue(state).pullRequestNumber}`,
    compose: async (page) => {
      const evidence = page.getByRole('region', { name: 'Evidence', exact: true });
      await evidence.getByRole('region', { name: 'After, on the branch' }).waitFor();
      await evidence.evaluate((element) => element.scrollIntoView({ block: 'start' }));
    },
  },
  {
    file: 'delivery.png',
    path: () => `/projects/${STOREFRONT}/delivery`,
    compose: async (page) => {
      await showHeading(page, /Delivery/);
    },
  },
  {
    file: 'runs.png',
    path: (state) => `/runs/${cartBadgeRun(state).id}`,
    compose: async (page) => {
      await page.getByRole('log').waitFor();
    },
  },
  {
    file: 'usage.png',
    path: () => '/usage',
    compose: async (page) => {
      await showHeading(page, /Usage/);
    },
  },
];
