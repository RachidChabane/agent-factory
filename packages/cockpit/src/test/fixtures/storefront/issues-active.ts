import { evidencePath, type IssueView } from '../../../contract/index.ts';
import { storefrontLinks } from '../forge-links.ts';
import { attemptsOf, costOfIssue, frozenCheck, openCheck, specOfProposal } from '../issue-parts.ts';
import { STOREFRONT_ID } from '../project-ids.ts';
import { runOf, type RunWorld } from '../runs.ts';
import { issueView } from '../seeds.ts';
import { days, hours, type FixtureClock } from '../time.ts';
import { ORDER_HISTORY_CHALLENGE } from './challenges.ts';
import { PROMO_SAVINGS_FINDING } from './decisions.ts';
import { HTTP_TIMEOUT_SPEC } from './audit-conclusions.ts';
import { ISSUE, issueBranch, PULL_REQUEST, REQUEST, RUN, titleOf } from './ids.ts';
import { CHECK_PATH } from './paths.ts';

const STATUS_FILTER_SPEC_INDEX = 1;

function screenshot(issueNumber: number, file: string): string {
  return evidencePath(STOREFRONT_ID, issueNumber, `checks/${file}`);
}

/** The issues that are still moving through the pipeline or waiting for it, from the oldest to the newest. */
export function activeIssues(clock: FixtureClock, runs: RunWorld): IssueView[] {
  const ago = (minutes: number): string => clock.minutesAgo(minutes);
  const common = (number: number) => ({
    number,
    title: titleOf(number),
    url: storefrontLinks.issue(number),
    costUsd: costOfIssue(runs, STOREFRONT_ID, number),
  });
  const statusFilterSpec = ORDER_HISTORY_CHALLENGE.specs[STATUS_FILTER_SPEC_INDEX];
  if (statusFilterSpec === undefined) throw new Error('the order history challenge has no status filter spec');
  const escalatedAt = runOf(runs, RUN.promoSavingsAsk).endedAt;
  if (escalatedAt === null) throw new Error('the run that asks the question has not ended');
  return [
    issueView({
      ...common(ISSUE.orderHistoryStatusFilter),
      type: 'ui',
      state: 'implementing',
      spec: specOfProposal(statusFilterSpec),
      requestId: REQUEST.orderHistory,
      branch: issueBranch(ISSUE.orderHistoryStatusFilter),
      checks: [
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.statusFilter,
          runner: 'playwright',
          onBase: 'fails',
          before: {
            result: 'failed',
            detail: 'The page has no status selector.',
            screenshotUrl: screenshot(ISSUE.orderHistoryStatusFilter, 'status-filter-before.png'),
          },
        }),
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.statusFilterEmpty,
          runner: 'playwright',
          onBase: 'fails',
          before: { result: 'failed', detail: 'The page cannot be filtered, so it never says that no order matches.' },
        }),
      ],
      checksFrozenAt: ago(1541),
      attempts: attemptsOf(runs, [RUN.statusFilterImplementer, 'session', 'running', '']),
      createdAt: ago(days(9)),
      updatedAt: ago(14),
    }),
    issueView({
      ...common(ISSUE.promoSavingsSummary),
      type: 'ui',
      state: 'needs-human',
      resumeTarget: 'implementing',
      spec: {
        need: 'Customers cannot see what a promo code saved them until the payment step.',
        acceptanceCriteria: [
          'The cart summary shows the amount saved by an applied promo code, in the currency of the shop.',
          'The line disappears when no code is applied.',
          'Removing the code removes the line and restores the total.',
        ],
        outOfScope: ['Showing the savings in the order history'],
        expectedProof: 'A browser journey on the French shop that applies WELCOME10 and reads the savings line.',
        films: [],
      },
      branch: issueBranch(ISSUE.promoSavingsSummary),
      checks: [
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.promoSavings,
          runner: 'playwright',
          onBase: 'fails',
          before: {
            result: 'failed',
            detail: 'The cart summary has no savings line.',
            screenshotUrl: screenshot(ISSUE.promoSavingsSummary, 'promo-savings-before.png'),
          },
        }),
      ],
      checksFrozenAt: ago(517),
      attempts: attemptsOf(
        runs,
        [RUN.promoSavingsFirst, 'session', 'error', 'The session used its 150 turns without making the frozen journey pass.'],
        [RUN.promoSavingsSecond, 'correction', 'error', 'The correction stopped at its budget of $5.00 after repeating the same edits.'],
        [RUN.promoSavingsThird, 'correction', 'error', 'The correction stopped at the limit of 60 minutes.'],
        [RUN.promoSavingsAsk, 'fresh-session', 'gate-failed', 'The session stopped deliberately to ask which of the frozen journey and the spec should change.'],
      ),
      escalation: {
        reason: 'The implementer stopped to ask for a human decision.',
        diagnosis: PROMO_SAVINGS_FINDING,
        since: escalatedAt,
      },
      createdAt: ago(days(3)),
      updatedAt: ago(21),
    }),
    issueView({
      ...common(ISSUE.naturalLanguageSearch),
      type: 'prompt',
      state: 'ready-to-merge',
      spec: {
        need: 'Customers type what they want in sentences, such as "blue sneakers under 60", and the search ignores the colour and the price.',
        acceptanceCriteria: [
          'A colour word of the catalogue filters the results to that colour.',
          '"under 60", "less than 60" and "up to 60" filter to a maximum of 60 euros; "over 60" and "more than 60" to a minimum.',
          'The active filters are shown as removable chips above the results.',
          'A word that is neither a catalogue colour nor a price phrase stays in the search terms.',
        ],
        outOfScope: ['Searching by brand', 'Voice input'],
        expectedProof:
          'An evaluation of six sentences scored before and after the change, a unit test of the chips, and a browser journey with a screenshot and a recording of the search.',
        films: [],
      },
      beforeProofKind: 'base-score',
      branch: issueBranch(ISSUE.naturalLanguageSearch),
      pullRequestNumber: PULL_REQUEST.naturalLanguageSearch,
      checks: [
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.searchEval,
          runner: 'eval',
          onBase: null,
          before: { result: 'scored', detail: 'Score 0.58 over 6 sentences, 3 runs each.', score: 0.58 },
        }),
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.searchChips,
          runner: 'vitest',
          onBase: 'fails',
          before: { result: 'failed', detail: 'parsePriceBound does not exist yet.' },
        }),
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.searchJourney,
          runner: 'playwright',
          onBase: 'fails',
          before: {
            result: 'failed',
            detail: 'The results page shows no active filters.',
            screenshotUrl: screenshot(ISSUE.naturalLanguageSearch, 'search-before.png'),
          },
        }),
      ],
      checksFrozenAt: ago(4536),
      attempts: attemptsOf(
        runs,
        [RUN.searchFirst, 'session', 'review-failed', 'The reviewer found a blocking issue: "under 60" was read as a minimum of 60.'],
        [RUN.searchSecond, 'correction', 'passed', 'The comparison is fixed and the analytics events are gone; the second review has no blocking finding.'],
      ),
      createdAt: ago(days(5)),
      updatedAt: ago(4100),
    }),
    issueView({
      ...common(ISSUE.checkoutScreenReader),
      type: 'ui',
      state: 'pr-open',
      spec: {
        need: 'A customer who uses the keyboard or a screen reader is not told which fields of the address form are wrong after submitting it.',
        acceptanceCriteria: [
          'After a failed submit the focus moves to a summary that lists every problem.',
          'Each entry of the summary links to its field.',
          'The summary is announced as an alert.',
          'A form without problems submits as before.',
        ],
        outOfScope: ['The payment form'],
        expectedProof: 'A keyboard-only browser journey and a recording of it.',
        films: [],
      },
      branch: issueBranch(ISSUE.checkoutScreenReader),
      pullRequestNumber: PULL_REQUEST.checkoutScreenReader,
      checks: [
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.checkoutJourney,
          runner: 'playwright',
          onBase: 'fails',
          before: {
            result: 'failed',
            detail: 'No summary of the errors exists, so nothing takes focus.',
            screenshotUrl: screenshot(ISSUE.checkoutScreenReader, 'keyboard-journey-before.png'),
          },
        }),
      ],
      checksFrozenAt: ago(1959),
      attempts: attemptsOf(
        runs,
        [RUN.checkoutFirst, 'session', 'gate-failed', 'The gate run by the factory failed on the keyboard journey: the summary took focus after a 200 ms fade-in.'],
        [RUN.checkoutSecond, 'correction', 'passed', 'The fade-in was removed; the journey and the gate pass.'],
      ),
      createdAt: ago(days(4)),
      updatedAt: ago(days(1)),
    }),
    issueView({
      ...common(ISSUE.expiredPromoMessage),
      type: 'fix',
      state: 'ci',
      spec: {
        need: 'An expired promo code is refused with the generic message "Invalid code", so customers think they mistyped it and contact support.',
        acceptanceCriteria: [
          'Applying a code whose end date has passed shows "This code expired on <date>" under the field, in the date format of the shop.',
          'A code that was never issued still shows "We do not recognise this code".',
          'Both messages are announced to screen readers as alerts.',
        ],
        outOfScope: ['Suggesting a replacement code', 'Changing how discounts are computed'],
        expectedProof: 'Unit tests of the message for each outcome that fail on the current code.',
        films: [],
      },
      requestId: REQUEST.promoExpiry,
      branch: issueBranch(ISSUE.expiredPromoMessage),
      pullRequestNumber: PULL_REQUEST.expiredPromoMessage,
      checks: [
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.expiredPromo,
          runner: 'vitest',
          onBase: 'fails',
          before: { result: 'failed', detail: 'The module promo-messages does not exist, so the checks cannot load.' },
        }),
      ],
      checksFrozenAt: ago(310),
      attempts: attemptsOf(runs, [RUN.expiredPromoImplementer, 'session', 'passed', 'The message module and the validator change were written; the review found nothing.']),
      createdAt: ago(days(2)),
      updatedAt: ago(18),
    }),
    issueView({
      ...common(ISSUE.savedDeliveryAddress),
      type: 'feature',
      state: 'reviewing',
      spec: {
        need: 'Customers retype their delivery address on every order.',
        acceptanceCriteria: [
          'The checkout form offers the default address of a signed-in customer.',
          'A customer without a saved address sees an empty form.',
          'Choosing another address does not change the default one.',
        ],
        outOfScope: ['Managing several addresses'],
        expectedProof: 'Integration tests of the route that returns the saved address.',
        films: [],
      },
      branch: issueBranch(ISSUE.savedDeliveryAddress),
      checks: [
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.savedAddress,
          runner: 'vitest',
          onBase: 'fails',
          before: { result: 'failed', detail: 'The module that reads the default address does not exist.' },
        }),
      ],
      checksFrozenAt: ago(164),
      attempts: attemptsOf(runs, [RUN.savedAddressImplementer, 'session', 'passed', '']),
      createdAt: ago(days(2)),
      updatedAt: ago(102),
    }),
    issueView({
      ...common(ISSUE.oneClickReorder),
      type: 'feature',
      state: 'rewriting-check',
      spec: {
        need: 'Customers who buy the same items regularly rebuild their cart line by line.',
        acceptanceCriteria: [
          'A delivered order offers an "Order again" button.',
          'The button refills the cart with the same lines and quantities.',
          'Items that are no longer sold are skipped, with a message.',
          'The saved card pays for the new order.',
        ],
        outOfScope: ['Reordering several orders at once'],
        expectedProof: 'Two browser journeys: refilling the cart, and paying with the saved card.',
        films: [],
      },
      branch: issueBranch(ISSUE.oneClickReorder),
      checks: [
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.reorderHistory,
          runner: 'playwright',
          onBase: 'fails',
          before: { result: 'failed', detail: 'The order page has no "Order again" button.' },
        }),
        openCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.reorderPayment,
          runner: 'playwright',
          onBase: null,
          before: { result: 'not-run', detail: 'Being rewritten: the card the journey pays with expires at the end of the month.' },
        }),
      ],
      attempts: attemptsOf(runs, [RUN.reorderStopped, 'session', 'error', 'The session was stopped by the operator to rewrite the payment journey.']),
      createdAt: ago(days(6)),
      updatedAt: ago(38),
    }),
    issueView({
      ...common(ISSUE.searchPriceSort),
      type: 'ui',
      state: 'authoring-checks',
      spec: {
        need: 'Customers cannot order the search results by price.',
        acceptanceCriteria: [
          'The results page offers a sort selector with Relevance, Price low to high and Price high to low.',
          'Choosing a sort keeps the active filters and the search text.',
          'The choice is kept in the address of the page.',
        ],
        outOfScope: ['Sorting by customer rating'],
        expectedProof: 'A browser journey that sorts, reloads and checks the order of the prices.',
        films: [],
      },
      createdAt: ago(40),
      updatedAt: ago(35),
    }),
    issueView({
      ...common(ISSUE.deliveryDateEstimate),
      type: 'feature',
      state: 'blocked',
      spec: {
        need: 'The delivery date shown on the product page is computed from the warehouse only, whatever the destination.',
        acceptanceCriteria: [
          'The estimate uses the postcode of the saved address of a signed-in customer.',
          'A customer without a saved address sees the estimate for the warehouse region.',
        ],
        outOfScope: ['Carrier-specific cut-off times'],
        expectedProof: 'Unit tests of the estimate for three postcodes.',
        films: [],
      },
      dependsOn: [ISSUE.savedDeliveryAddress],
      createdAt: ago(days(1)),
      updatedAt: ago(days(1) - 20),
    }),
    issueView({
      ...common(ISSUE.expressDelivery),
      type: 'feature',
      state: 'blocked',
      spec: {
        need: 'Customers who need an item quickly cannot pay for faster delivery.',
        acceptanceCriteria: [
          'Checkout offers "Express, next day" when the estimate for the saved address allows it.',
          'The express fee is added to the total before payment.',
        ],
        outOfScope: ['Same-day delivery'],
        expectedProof: 'Integration tests of the checkout totals with and without the express option.',
        films: [],
      },
      dependsOn: [ISSUE.deliveryDateEstimate],
      createdAt: ago(days(1)),
      updatedAt: ago(days(1) - 20),
    }),
    issueView({
      ...common(ISSUE.httpTimeoutRegression),
      type: 'fix',
      state: 'spec-draft',
      spec: HTTP_TIMEOUT_SPEC,
      createdAt: ago(days(8)),
      updatedAt: ago(days(8)),
    }),
    issueView({
      ...common(ISSUE.stockLevelOnProduct),
      type: 'ui',
      state: 'spec-validated',
      spec: {
        need: 'Customers do not know whether an item can ship at once.',
        acceptanceCriteria: [
          'The product page shows "In stock" and the number of units when fewer than 10 remain.',
          'It shows "Out of stock" and disables the add to cart button when none remain.',
        ],
        outOfScope: ['Back-in-stock notifications'],
        expectedProof: 'A browser journey on a product with low stock and one without stock, with screenshots of both.',
        films: [],
      },
      createdAt: ago(hours(5)),
      updatedAt: ago(hours(1)),
    }),
    issueView({
      ...common(ISSUE.legacyDateHelpers),
      type: 'refactor',
      state: 'abandoned',
      spec: {
        need: 'Two date helper modules disagree on week numbers and on time zones.',
        acceptanceCriteria: [
          'Every use of the legacy helpers goes through the new module.',
          'Behaviour is unchanged for every date, including the last days of December.',
        ],
        outOfScope: ['Changing the date formats shown to customers'],
        expectedProof: 'The existing tests of the helpers, unchanged: they pass before and after.',
        films: [],
      },
      beforeProofKind: 'none',
      branch: issueBranch(ISSUE.legacyDateHelpers),
      pullRequestNumber: PULL_REQUEST.legacyDateHelpers,
      checks: [
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.dateHelpers,
          runner: 'vitest',
          onBase: 'passes',
          before: { result: 'passed', detail: 'The existing tests of the helpers pass on the base branch.' },
        }),
      ],
      checksFrozenAt: ago(days(5) + hours(2)),
      attempts: attemptsOf(runs, [RUN.dateHelpersImplementer, 'session', 'review-failed', 'The reviewer found that week numbers differ for the last days of December.']),
      createdAt: ago(days(8)),
      updatedAt: ago(7140),
    }),
  ];
}
