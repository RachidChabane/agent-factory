import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { projectOf } from '../../support/api.ts';
import { card, column, openCockpit } from '../../support/cockpit.ts';
import { expectDecisionListed } from '../../support/decisions.ts';
import { CART_BADGE_TOTAL, CATEGORY_FILTER, DELIVERY_ESTIMATES, DISCOUNT_ROUNDING, ORDER_HISTORY_PAGINATION, PAYMENT_RETRIES, PDF_INVOICES, SAVED_CARTS, STOREFRONT, TAX_ROUNDING, GIFT_PICKS_TITLE } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';
import { wordsIn } from '../../support/words.ts';

const words = wordsIn('en');

test.describe('the board of the demonstration', () => {
  test.beforeEach(async ({ page, factory }) => {
    await openCockpit(page, factory, paths.board());
    await expect(page.getByRole('heading', { level: 1, name: /^Board/ })).toBeVisible();
  });

  test('says that the projects are fictional and shows the run slots of the factory', async ({ page }) => {
    await expect(page.getByRole('note')).toHaveText(/fictional projects driven by a simulated agent/);
    await expect(page.getByText('Run slots 0/1').first()).toBeVisible();
  });

  test('puts the work of the story in the column of its state', async ({ page }) => {
    await expect(card(column(page, 'Requests'), SAVED_CARTS.title)).toBeVisible();
    await expect(card(column(page, 'Requests'), DELIVERY_ESTIMATES.title)).toBeVisible();
    await expect(card(column(page, 'Requests'), PDF_INVOICES.title)).toBeVisible();
    await expect(card(column(page, 'Specs'), GIFT_PICKS_TITLE)).toBeVisible();
    await expect(card(column(page, 'Specs'), TAX_ROUNDING.spec.title)).toBeVisible();
    await expect(card(column(page, 'Specs'), ORDER_HISTORY_PAGINATION.spec.title)).toBeVisible();
    await expect(card(column(page, 'Pull requests'), CART_BADGE_TOTAL.spec.title)).toBeVisible();
    await expect(card(column(page, 'Pull requests'), PAYMENT_RETRIES.spec.title)).toBeVisible();
    await expect(card(column(page, 'Needs a human'), DISCOUNT_ROUNDING.spec.title)).toBeVisible();
    await expect(card(column(page, 'Delivered'), CATEGORY_FILTER.spec.title)).toBeVisible();
  });

  test('keeps the time of every card inside the card, whatever the room its column leaves', async ({ page }) => {
    const cards = await page.getByRole('main').getByRole('article').all();
    expect(cards.length).toBeGreaterThan(0);
    for (const article of cards) {
      const frame = await article.boundingBox();
      const time = await article.getByRole('time').boundingBox();
      if (frame === null || time === null) throw new Error('a card or its time is not laid out');
      expect(time.x + time.width, 'the time ends before the right edge of its card').toBeLessThanOrEqual(frame.x + frame.width);
      expect(time.y + time.height, 'the time ends above the bottom edge of its card').toBeLessThanOrEqual(frame.y + frame.height);
    }
  });

  test('shows the agent that waits for the operator in the runs in progress', async ({ page }) => {
    const running = page.getByRole('region', { name: 'Runs in progress' });
    await expect(running.getByRole('link', { name: new RegExp(`Implementer · #3 ${DISCOUNT_ROUNDING.spec.title}`) })).toBeVisible();
    await expect(running).toContainText('Waiting for your answer');
  });

  test('flags what waits for the operator, in the words of the action it asks for', async ({ page }) => {
    await expect(column(page, 'Pull requests').getByText('Merge to order')).toHaveCount(3);
    await expect(card(column(page, 'Requests'), SAVED_CARTS.title)).toContainText('Challenge to start');
    await expect(card(column(page, 'Requests'), DELIVERY_ESTIMATES.title)).toContainText('Challenge to review');
    await expect(card(column(page, 'Needs a human'), DISCOUNT_ROUNDING.spec.title)).toContainText('Agent question');
  });

  test('links a card to the page of its subject, in its own project', async ({ page }) => {
    await card(column(page, 'Delivered'), CATEGORY_FILTER.spec.title).getByRole('link').click();
    await expect(page).toHaveURL(/\/projects\/storefront\/issues\/1$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(CATEGORY_FILTER.spec.title);
  });

  test('narrows the board to one project and to the words typed', async ({ page }) => {
    await page.getByRole('radio', { name: 'Ledger' }).click();
    await expect(page).toHaveURL(/project=ledger/);
    await expect(card(column(page, 'Requests'), PDF_INVOICES.title)).toBeVisible();
    await expect(card(column(page, 'Requests'), SAVED_CARTS.title)).toHaveCount(0);
    await page.getByRole('radio', { name: 'All projects' }).click();
    await page.getByRole('searchbox', { name: 'Filter the board' }).fill('VAT');
    await expect(card(column(page, 'Specs'), TAX_ROUNDING.spec.title)).toBeVisible();
    await expect(card(column(page, 'Specs'), GIFT_PICKS_TITLE)).toHaveCount(0);
  });

  test('opens the form of a new request and sends nothing when it is cancelled', async ({ page, factory }) => {
    const before = (await factory.api.state()).sequence;
    await page.getByRole('button', { name: 'New request' }).click();
    const dialog = page.getByRole('dialog', { name: 'New request' });
    await expect(dialog.getByRole('textbox', { name: 'Requester' })).toHaveValue('Alex Morgan');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect((await factory.api.state()).sequence).toBe(before);
  });

  test('lists on the overview of a project what it delegates and what its orchestrator decided in the operator\'s place: who, why, under which rule and when', async ({ page, factory }) => {
    const state = await factory.api.state();
    const { delegatedDecisions, settings } = projectOf(state, STOREFRONT);
    const [decision] = delegatedDecisions;
    if (decision === undefined) throw new Error('the orchestrator of the storefront decided nothing');
    expect(decision.reason).toBe(DISCOUNT_ROUNDING.delegatedValidation);
    await openCockpit(page, factory, paths.project(STOREFRONT));
    const section = page.getByRole('region', { name: 'Delegated decisions', exact: true });
    const delegated = section.getByLabel(words.t('autonomy.policy.label'));
    await expect(delegated).toContainText(words.t('autonomy.policy.intro', { actor: settings.autonomy.actor }));
    await expect(delegated.getByRole('listitem')).toHaveText([
      words.t('autonomy.policy.validateSpecs'),
      words.t('autonomy.policy.resume'),
      words.t('autonomy.policy.mergeWhen', { types: 'Fix', conditions: words.t('autonomy.condition.films-recorded') }),
    ]);
    const items = section.getByRole('list', { name: 'Delegated decisions' }).getByRole('listitem');
    await expect(items).toHaveCount(delegatedDecisions.length);
    await expectDecisionListed(items.first(), STOREFRONT, decision);
  });
});
