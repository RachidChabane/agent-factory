import type { Locator, Page } from '@playwright/test';
import type { PullRequestView } from '../../packages/cockpit/src/contract/index.ts';

/** The videos of a pull request, where the Film button and the queue of its films are. */
export function filmsRegion(page: Page): Locator {
  return page.getByRole('region', { name: 'Videos', exact: true });
}

/** The form that orders a film on a pull request. */
export function filmOrderForm(page: Page, pullRequest: Pick<PullRequestView, 'number'>): Locator {
  return page.getByRole('dialog', { name: `Film pull request #${pullRequest.number}` });
}

/** Opens the form of the Film button, names the scenario and confirms: the clicks that send `pr.film`. */
export async function submitFilmOrder(page: Page, pullRequest: Pick<PullRequestView, 'number'>, scenario: string): Promise<void> {
  await filmsRegion(page).getByRole('button', { name: 'Film', exact: true }).click();
  const form = filmOrderForm(page, pullRequest);
  await form.getByRole('textbox', { name: 'Scenario name' }).fill(scenario);
  await form.getByRole('button', { name: 'Order the film' }).click();
}
