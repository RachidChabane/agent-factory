import type { Locator, Page } from '@playwright/test';
import { imagePath } from '../../../packages/application/src/requests/request-files.ts';
import { requestAttachmentPath } from '../../../packages/cockpit/src/contract/index.ts';
import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { MAX_ATTACHMENTS } from '../../../packages/cockpit/src/widgets/attachment-intake.ts';
import { issueOf, requestOf } from '../../support/api.ts';
import { column, openCockpit } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import { AGENT_WORK_TEST_TIMEOUT_MS } from '../../support/factory-activity.ts';
import type { RunningFactory } from '../../support/factory.ts';
import { CHALLENGE_TIMEOUT_MS, receiveChallengedRequest, settled, untilPullRequestIsOpen } from '../../support/scenes.ts';
import { CHECKOUT_SCREENSHOT } from '../../support/screenshot.ts';
import { DELIVERY_ESTIMATES, GIFT_FINDING, GIFT_PICKS_TITLE, LEDGER, ORDER_HISTORY_PAGINATION, PDF_INVOICES, PRICE_CEILING_TITLE, SAVED_CARTS, STOREFRONT, TAX_ROUNDING } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const COCKPIT_CHANNEL = 'cockpit';
const PROPOSED_SPEC_TITLES = (GIFT_FINDING.challenge?.specs ?? []).map((spec) => spec.title);
const ONE_SPEC_SELECTED = `1 of ${PROPOSED_SPEC_TITLES.length} selected`;
const EDITED_NEED_SENTENCE = 'The picks are the first thing a customer sees when the catalogue opens.';
const EMPTY_COLUMNS = [
  { name: 'Requests', words: 'No open request' },
  { name: 'Specs', words: 'No spec waiting' },
  { name: 'Checks', words: 'No checks in progress' },
  { name: 'Implementation', words: 'No agent at work' },
  { name: 'Pull requests', words: 'No pull request open' },
  { name: 'Needs a human', words: 'Nothing needs a human' },
  { name: 'Delivered', words: 'Nothing delivered this week' },
] as const;
const DEMONSTRATION_ONLY_TITLES = [SAVED_CARTS.title, DELIVERY_ESTIMATES.title, PDF_INVOICES.title, TAX_ROUNDING.spec.title, ORDER_HISTORY_PAGINATION.spec.title];

function requestList(page: Page): Locator {
  return page.getByRole('region', { name: 'Request list' });
}

function proposedSpec(page: Page, title: string): Locator {
  return page.getByRole('list', { name: 'Proposed specs' }).getByRole('article').filter({ has: page.getByRole('heading', { level: 3, name: title }) });
}

async function openRequest(page: Page, factory: RunningFactory, requestId: string): Promise<void> {
  await openCockpit(page, factory, paths.request(STOREFRONT, requestId));
  await expect(page.getByRole('heading', { level: 1, name: GIFT_FINDING.title })).toBeVisible();
}

function captured(pattern: RegExp, effect: string | null): string {
  const value = effect === null ? undefined : pattern.exec(effect)?.[1];
  if (value === undefined) throw new Error(`"${effect}" does not match ${pattern}`);
  return value;
}

test.describe('the board of a rehearsal', () => {
  test('says that no remote forge is written', async ({ page, factory }) => {
    await openCockpit(page, factory, paths.board());
    await expect(page.getByRole('note')).toHaveText('Rehearsal mode: no remote forge is written. Branches, pull requests and merges stay on local forges.');
  });

  test('plays no story of the demonstration and holds no work for the ledger', async ({ page, factory }) => {
    await openCockpit(page, factory, paths.board(LEDGER));
    for (const { name, words } of EMPTY_COLUMNS) await expect(column(page, name)).toContainText(words);
    await expect(page.getByRole('main').getByRole('article')).toHaveCount(0);
    await openCockpit(page, factory, paths.board());
    for (const title of DEMONSTRATION_ONLY_TITLES) await expect(page.getByText(title)).toHaveCount(0);
  });
});

test.describe('a request from its first word to its issues', () => {
  test.describe.configure({ mode: 'serial' });
  let requestId = '';
  let editedNeed = '';

  test.beforeAll(async ({ factory }) => {
    await settled(factory);
  });

  test('records the request typed in the New request dialog with its screenshot', async ({ page, factory }) => {
    const { operator } = (await factory.api.state()).installation;
    await openCockpit(page, factory, paths.requests(STOREFRONT));
    await requestList(page).getByRole('button', { name: 'New request' }).click();
    const dialog = page.getByRole('dialog', { name: 'New request' });
    await expect(dialog.getByRole('textbox', { name: 'Requester' })).toHaveValue(operator);
    await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill(GIFT_FINDING.title);
    await dialog.getByRole('textbox', { name: 'Request text' }).fill(GIFT_FINDING.body);
    await dialog.getByLabel('browse your files').setInputFiles(CHECKOUT_SCREENSHOT);
    await expect(dialog.getByText(`1 of ${MAX_ATTACHMENTS} attached`)).toBeVisible();
    await expect(dialog.getByRole('list', { name: 'Attached screenshots' }).getByRole('img', { name: CHECKOUT_SCREENSHOT.name })).toBeVisible();

    const outcome = await clickCommand(page, 'request.create', async () => {
      await dialog.getByRole('button', { name: 'Save the request' }).click();
    });
    requestId = captured(/^Request (\S+) received for storefront with 1 attachment\(s\)$/, outcome.effect);

    const created = requestOf(await factory.api.state(), STOREFRONT, requestId);
    expect(created).toMatchObject({ title: GIFT_FINDING.title, requester: operator, channel: COCKPIT_CHANNEL, state: 'received', challenge: null });
    expect(created.body.trim()).toBe(GIFT_FINDING.body.trim());
    const screenshotUrl = requestAttachmentPath(STOREFRONT, requestId, imagePath(CHECKOUT_SCREENSHOT.name));
    expect(created.attachments).toEqual([{ name: CHECKOUT_SCREENSHOT.name, mediaType: CHECKOUT_SCREENSHOT.mimeType, url: screenshotUrl }]);
    const served = await fetch(`${factory.origin}${screenshotUrl}`);
    expect(served.status).toBe(200);
    expect(Buffer.from(await served.arrayBuffer()).equals(CHECKOUT_SCREENSHOT.buffer)).toBe(true);

    await expect(dialog).toBeHidden();
    await expect(requestList(page).locator(`a[href="${paths.request(STOREFRONT, requestId)}"]`)).toContainText(GIFT_FINDING.title);
  });

  test('runs the challenge of the request it recorded', async ({ page, factory }) => {
    await openRequest(page, factory, requestId);
    await expect(page.getByRole('region', { name: 'Request', exact: true }).getByRole('img', { name: CHECKOUT_SCREENSHOT.name })).toBeVisible();

    const outcome = await clickCommand(page, 'request.challenge', async () => {
      await page.getByRole('button', { name: 'Run the challenge', exact: true }).click();
    });
    expect(outcome.effect).toBe(`The challenge of request ${requestId} is queued; the daemon picks it up at its next tick`);

    const state = await factory.api.until(`request ${requestId} to be challenged`, (snapshot) => requestOf(snapshot, STOREFRONT, requestId).state === 'challenged', { timeoutMs: CHALLENGE_TIMEOUT_MS });
    const report = requestOf(state, STOREFRONT, requestId).challenge;
    expect(report?.specs.map((spec) => spec.title)).toEqual(PROPOSED_SPEC_TITLES);
    await expect(page.getByRole('region', { name: 'Challenge report' })).toContainText(report?.summary ?? '');
    await expect(page.getByRole('list', { name: 'Proposed specs' }).getByRole('heading', { level: 3 })).toHaveText(PROPOSED_SPEC_TITLES);
  });

  test('saves the need of a proposed spec rewritten in its dialog', async ({ page, factory }) => {
    const before = requestOf(await factory.api.state(), STOREFRONT, requestId).challenge?.specs.find((spec) => spec.title === GIFT_PICKS_TITLE);
    if (before === undefined) throw new Error(`request ${requestId} proposes no spec titled "${GIFT_PICKS_TITLE}"`);
    await openRequest(page, factory, requestId);
    await page.getByRole('button', { name: `Edit the spec “${GIFT_PICKS_TITLE}”`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit the proposed spec' });
    const need = dialog.getByRole('textbox', { name: 'Need', exact: true });
    await expect(need).toHaveValue(before.need);
    editedNeed = `${before.need} ${EDITED_NEED_SENTENCE}`;
    await need.fill(editedNeed);

    const outcome = await clickCommand(page, 'request.update-spec', async () => {
      await dialog.getByRole('button', { name: 'Save the spec' }).click();
    });
    expect(outcome.effect).toBe(`Proposed spec ${before.id} of request ${requestId} saved`);

    const saved = requestOf(await factory.api.state(), STOREFRONT, requestId).challenge?.specs.find((spec) => spec.id === before.id);
    expect(saved).toMatchObject({ title: GIFT_PICKS_TITLE, need: editedNeed, acceptanceCriteria: before.acceptanceCriteria, outOfScope: before.outOfScope, expectedProof: before.expectedProof });
    await expect(dialog).toBeHidden();
    await expect(proposedSpec(page, GIFT_PICKS_TITLE)).toContainText(editedNeed);
  });

  test('creates the draft issue of the spec that stays ticked with Create issues', async ({ page, factory }) => {
    await openRequest(page, factory, requestId);
    await page.getByRole('checkbox', { name: PRICE_CEILING_TITLE }).uncheck();
    await expect(page.getByText(ONE_SPEC_SELECTED)).toBeVisible();
    await page.getByRole('button', { name: 'Create issues', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Create 1 issue?' });
    await expect(dialog.getByRole('list', { name: 'Specs that become issues' }).getByRole('listitem')).toHaveText([GIFT_PICKS_TITLE]);

    const outcome = await clickCommand(page, 'request.accept', async () => {
      await dialog.getByRole('button', { name: 'Create the issue', exact: true }).click();
    });
    const issueNumber = Number(captured(/^Issue\(s\) #(\d+) created on storefront; validate their specs to let the factory take them$/, outcome.effect));

    const state = await factory.api.state();
    expect(requestOf(state, STOREFRONT, requestId)).toMatchObject({ state: 'accepted', issueNumbers: [issueNumber] });
    expect(requestOf(state, STOREFRONT, requestId).challenge?.specs.map((spec) => spec.issueNumber)).toEqual([issueNumber, null]);
    const issue = issueOf(state, STOREFRONT, issueNumber);
    expect(issue).toMatchObject({ title: GIFT_PICKS_TITLE, state: 'spec-draft', requestId, paused: false });
    expect(issue.spec.need).toBe(editedNeed);

    const created = page.getByRole('list', { name: 'Issues created from this request' }).getByRole('link');
    await expect(created).toContainText(GIFT_PICKS_TITLE);
    await created.click();
    await expect(page).toHaveURL(new RegExp(`${paths.issue(STOREFRONT, issueNumber)}$`));
    await expect(page.getByRole('button', { name: 'Validate spec', exact: true })).toBeEnabled();
    await expect(page.getByRole('region', { name: 'Specification' })).toContainText(editedNeed);
  });
});

test.describe('a request that the operator starts at once', () => {
  test('creates and starts the issue of the spec that stays ticked, and the factory takes it to a pull request', async ({ page, factory }) => {
    test.setTimeout(AGENT_WORK_TEST_TIMEOUT_MS);
    await settled(factory);
    const request = await receiveChallengedRequest(factory, GIFT_FINDING);
    await openRequest(page, factory, request.id);
    await page.getByRole('checkbox', { name: GIFT_PICKS_TITLE }).uncheck();
    await expect(page.getByText(ONE_SPEC_SELECTED)).toBeVisible();
    await page.getByRole('button', { name: 'Create and start', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Create 1 issue and start it?' });
    await expect(dialog.getByRole('list', { name: 'Specs that become issues' }).getByRole('listitem')).toHaveText([PRICE_CEILING_TITLE]);

    const outcome = await clickCommand(page, 'request.accept', async () => {
      await dialog.getByRole('button', { name: 'Create and start the issue', exact: true }).click();
    });
    const issueNumber = Number(captured(/^Issue\(s\) #(\d+) created on storefront and validated; the daemon picks it up at its next tick$/, outcome.effect));

    const state = await factory.api.state();
    expect(requestOf(state, STOREFRONT, request.id)).toMatchObject({ state: 'accepted', issueNumbers: [issueNumber] });
    expect(issueOf(state, STOREFRONT, issueNumber)).toMatchObject({ title: PRICE_CEILING_TITLE, requestId: request.id });
    expect(issueOf(state, STOREFRONT, issueNumber).state).not.toBe('spec-draft');

    const delivered = await untilPullRequestIsOpen(factory, issueNumber);
    expect(issueOf(delivered, STOREFRONT, issueNumber).pullRequestNumber).not.toBeNull();
  });
});
