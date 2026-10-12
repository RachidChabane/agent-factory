import type { Locator, Page } from '@playwright/test';
import type { ChallengeVerdict, RequestView } from '../../../packages/cockpit/src/contract/index.ts';
import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { requestOf } from '../../support/api.ts';
import { openCockpit, recordCommandsSent } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import type { RunningFactory } from '../../support/factory.ts';
import { requestNamed } from '../../support/project-facts.ts';
import { DELIVERY_ESTIMATES, GIFT_FINDING, GIFT_PICKS_TITLE, PRICE_CEILING_TITLE, SAVED_CARTS, STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const DECLINE_REASON = 'The shop has no carrier or warehouse data yet, so any delivery date would be a guess.';
const VERDICT_WORDS: Readonly<Record<ChallengeVerdict, string>> = { keep: 'Keep', adjust: 'Adjust', split: 'Split', ask: 'Question', decline: 'Decline' };
const REPORT_FACETS = ['Current state', 'Intent', 'Idea', 'Method'] as const;

function pointsWord(count: number): string {
  return `${count} ${count === 1 ? 'point' : 'points'}`;
}

function requestList(page: Page): Locator {
  return page.getByRole('region', { name: 'Request list' });
}

function declineButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Decline', exact: true });
}

async function openRequest(page: Page, factory: RunningFactory, request: RequestView): Promise<void> {
  await openCockpit(page, factory, paths.request(STOREFRONT, request.id));
  await expect(page.getByRole('heading', { level: 1, name: request.title })).toBeVisible();
}

test.describe('the requests of the storefront in the demonstration', () => {
  test('groups the requests by what they ask of the operator', async ({ page, factory }) => {
    await openCockpit(page, factory, paths.requests(STOREFRONT));
    const list = requestList(page);
    const needsYou = list.getByRole('region', { name: 'Needs you', exact: true });
    const closed = list.getByRole('region', { name: 'Closed', exact: true });
    await expect(needsYou.getByRole('link', { name: DELIVERY_ESTIMATES.title })).toContainText(`Challenged · ${pointsWord(DELIVERY_ESTIMATES.challenge?.items.length ?? 0)}`);
    await expect(needsYou.getByRole('link', { name: SAVED_CARTS.title })).toContainText('Received');
    await expect(closed.getByRole('link', { name: GIFT_FINDING.title })).toContainText(`Accepted · ${pointsWord(GIFT_FINDING.challenge?.items.length ?? 0)}`);
    await expect(closed.getByRole('link', { name: SAVED_CARTS.title })).toHaveCount(0);
    await expect(needsYou.getByRole('link', { name: GIFT_FINDING.title })).toHaveCount(0);
  });

  test('opens the request the operator picks in the list', async ({ page, factory }) => {
    const request = requestNamed(await factory.api.state(), STOREFRONT, SAVED_CARTS.title);
    await openCockpit(page, factory, paths.requests(STOREFRONT));
    await requestList(page).getByRole('link', { name: SAVED_CARTS.title }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${STOREFRONT}/requests/${request.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: SAVED_CARTS.title })).toBeVisible();
    await expect(requestList(page).getByRole('link', { name: SAVED_CARTS.title })).toHaveAttribute('aria-current', 'page');
  });

  test('shows a request with its text, its challenge report, its reply and the specs it proposes', async ({ page, factory }) => {
    const request = requestNamed(await factory.api.state(), STOREFRONT, GIFT_FINDING.title);
    const report = request.challenge;
    if (report === null || report.runId === null) throw new Error(`the request ${request.id} has no challenge report written by a run`);
    await openRequest(page, factory, request);

    const [firstLineOfText = request.title] = request.body.trim().split('\n');
    const source = page.getByRole('region', { name: 'Request', exact: true });
    await expect(source).toContainText(firstLineOfText);
    await expect(source).toContainText('No attachment.');
    await expect(page.getByRole('article').first()).toContainText(`Requester: ${request.requester}`);
    await expect(page.getByRole('article').first()).toContainText(`Channel: ${request.channel}`);

    const challenge = page.getByRole('region', { name: 'Challenge report' });
    await expect(challenge).toContainText(pointsWord(report.items.length));
    await expect(challenge).toContainText(report.summary);
    const verdicts = challenge.getByRole('list', { name: 'Verdicts' });
    for (const verdict of new Set(report.items.map((item) => item.verdict))) {
      const count = report.items.filter((item) => item.verdict === verdict).length;
      await expect(verdicts).toContainText(`${VERDICT_WORDS[verdict]}: ${count}`);
    }
    await expect(challenge.getByRole('link', { name: /^Challenger run / })).toHaveAttribute('href', `/runs/${report.runId}`);
    const points = challenge.getByRole('list', { name: 'Points of the report' });
    await expect(points.getByRole('heading', { level: 3 })).toHaveText(report.items.map((item) => item.title));
    await expect(points.getByRole('term')).toHaveCount(report.items.length * REPORT_FACETS.length);
    for (const facet of REPORT_FACETS) await expect(points.getByRole('term').filter({ hasText: facet })).toHaveCount(report.items.length);
    for (const item of report.items) if (item.question !== null) await expect(challenge).toContainText(item.question);

    await expect(page.getByRole('region', { name: 'Proposed reply to the requester' })).toContainText(report.reply);
    await expect(page.getByRole('button', { name: 'Copy the reply' })).toBeVisible();

    const specs = page.getByRole('region', { name: 'Proposed specs' });
    await expect(specs.getByRole('heading', { level: 3 })).toHaveText([GIFT_PICKS_TITLE, PRICE_CEILING_TITLE]);
    for (const spec of report.specs) {
      const card = specs.getByRole('article').filter({ has: page.getByRole('heading', { level: 3, name: spec.title }) });
      for (const label of ['Need', 'Acceptance criteria', 'Out of scope', 'Expected proof']) await expect(card).toContainText(label);
      if (spec.issueNumber !== null) await expect(card.getByRole('link', { name: `Issue #${spec.issueNumber}` })).toHaveAttribute('href', paths.issue(STOREFRONT, spec.issueNumber));
    }
    await expect(specs.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Create/ })).toHaveCount(0);

    const created = page.getByRole('region', { name: 'Created issues' });
    for (const number of request.issueNumbers) await expect(created.getByRole('link', { name: new RegExp(`^#${number} `) })).toHaveAttribute('href', paths.issue(STOREFRONT, number));
  });

  test('shows a received request that has no challenge yet', async ({ page, factory }) => {
    const request = requestNamed(await factory.api.state(), STOREFRONT, SAVED_CARTS.title);
    expect(request.challenge).toBeNull();
    await openRequest(page, factory, request);
    const challenge = page.getByRole('region', { name: 'Challenge report' });
    await expect(challenge).toContainText('Not challenged yet');
    await expect(challenge).toContainText('Run the challenge to have the challenger review this request before any issue is written.');
    await expect(page.getByRole('button', { name: 'Run the challenge' })).toBeEnabled();
    await expect(page.getByRole('region', { name: 'Proposed specs' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Proposed reply to the requester' })).toHaveCount(0);
    await expect(declineButton(page)).toHaveCount(0);
  });

  test('asks for the reason before declining a request and sends nothing without it', async ({ page, factory }) => {
    const request = requestNamed(await factory.api.state(), STOREFRONT, DELIVERY_ESTIMATES.title);
    const sent = recordCommandsSent(page);
    await openRequest(page, factory, request);
    await declineButton(page).click();
    const dialog = page.getByRole('dialog', { name: `Decline ${request.id}?` });
    await expect(dialog).toContainText('The reason is kept with the request. No issue is created.');
    await dialog.getByRole('button', { name: 'Decline the request' }).click();
    await expect(dialog.getByText('Explain why the request is declined.')).toBeVisible();
    expect(sent).toEqual([]);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(sent).toEqual([]);
    expect(requestOf(await factory.api.state(), STOREFRONT, request.id).state).toBe('challenged');
  });

  test('declines a challenged request with the reason typed in its dialog', async ({ page, factory }) => {
    const request = requestNamed(await factory.api.state(), STOREFRONT, DELIVERY_ESTIMATES.title);
    expect(request.state).toBe('challenged');
    await openRequest(page, factory, request);
    const dialog = page.getByRole('dialog', { name: `Decline ${request.id}?` });
    const outcome = await clickCommand(page, 'request.decline', async () => {
      await declineButton(page).click();
      await dialog.getByRole('textbox', { name: 'Reason' }).fill(DECLINE_REASON);
      await dialog.getByRole('button', { name: 'Decline the request' }).click();
    });
    expect(outcome.effect).toBe(`Request ${request.id} declined`);

    const state = await factory.api.until('the request is declined', (snapshot) => requestOf(snapshot, STOREFRONT, request.id).state === 'declined');
    expect(requestOf(state, STOREFRONT, request.id).declineReason).toBe(DECLINE_REASON);

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('region', { name: 'Request declined' })).toContainText(DECLINE_REASON);
    await expect(declineButton(page)).toHaveCount(0);
    await expect(requestList(page).getByRole('region', { name: 'Closed', exact: true }).getByRole('link', { name: DELIVERY_ESTIMATES.title })).toContainText('Declined');
    await expect(requestList(page).getByRole('region', { name: 'Needs you', exact: true }).getByRole('link', { name: DELIVERY_ESTIMATES.title })).toHaveCount(0);
  });
});
