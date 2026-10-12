import { evidencePath, type IssueView } from '../../../contract/index.ts';
import { storefrontLinks } from '../forge-links.ts';
import { attemptsOf, costOfIssue, frozenCheck, specOfProposal } from '../issue-parts.ts';
import { STOREFRONT_ID } from '../project-ids.ts';
import type { RunWorld } from '../runs.ts';
import { issueView } from '../seeds.ts';
import { days, hours, type FixtureClock } from '../time.ts';
import { ORDER_HISTORY_CHALLENGE } from './challenges.ts';
import { ISSUE, issueBranch, PULL_REQUEST, REQUEST, RUN, titleOf } from './ids.ts';
import { CHECK_PATH } from './paths.ts';

/** The issues whose pull request is merged, from the oldest to the newest. */
export function deliveredIssues(clock: FixtureClock, runs: RunWorld): IssueView[] {
  const ago = (minutes: number): string => clock.minutesAgo(minutes);
  const common = (number: number) => ({
    number,
    title: titleOf(number),
    url: storefrontLinks.issue(number),
    branch: issueBranch(number),
    costUsd: costOfIssue(runs, STOREFRONT_ID, number),
  });
  const paginationSpec = ORDER_HISTORY_CHALLENGE.specs[0];
  if (paginationSpec === undefined) throw new Error('the order history challenge has no pagination spec');
  return [
    issueView({
      ...common(ISSUE.localSetupDocs),
      type: 'docs',
      state: 'closed',
      spec: {
        need: 'New contributors cannot run Storefront locally without asking a colleague: the README only says to run pnpm install and pnpm dev.',
        acceptanceCriteria: [
          'A page docs/development/local-setup.md lists the tools and the versions the project needs.',
          'The page explains the environment file and the command that loads the seed data.',
          'The README links to the page.',
        ],
        outOfScope: ['Documenting the deployment pipeline'],
        expectedProof: 'The existing tests still pass and the diff touches documentation only.',
        films: [],
      },
      beforeProofKind: 'none',
      pullRequestNumber: PULL_REQUEST.localSetupDocs,
      attempts: attemptsOf(runs, [RUN.localSetupDocsImplementer, 'session', 'passed', 'The documentation page and the README link were written in one session.']),
      createdAt: ago(days(48)),
      updatedAt: ago(days(34)),
    }),
    issueView({
      ...common(ISSUE.httpClientBump),
      type: 'dependencies',
      state: 'in-prod',
      spec: {
        need: 'The HTTP client library has a new minor release with fixes for connection reuse; staying current avoids a backlog of upgrades.',
        acceptanceCriteria: [
          'The HTTP client is updated to 7.5.1 in package.json and in the lockfile.',
          'The connection pool of the API client is capped at 16 connections per origin.',
          'The API test suite passes unchanged.',
        ],
        outOfScope: ['Replacing the HTTP client', 'Changing request timeouts'],
        expectedProof: 'The existing tests, unchanged: they pass before and after.',
        films: [],
      },
      beforeProofKind: 'none',
      pullRequestNumber: PULL_REQUEST.httpClientBump,
      attempts: attemptsOf(runs, [RUN.httpClientBumpImplementer, 'session', 'passed', 'The library was updated and the pool size capped in one session.']),
      createdAt: ago(days(20)),
      updatedAt: ago(days(2)),
    }),
    issueView({
      ...common(ISSUE.ciPackageCache),
      type: 'infra',
      state: 'in-prep',
      spec: {
        need: 'Every CI run downloads the whole package store again, which adds four minutes to each pipeline.',
        acceptanceCriteria: [
          'The CI workflow restores the package store from a cache before installing.',
          'The cache key is built from the hash of the lockfile.',
          'A change to the lockfile produces a different key.',
        ],
        outOfScope: ['Caching build outputs'],
        expectedProof: 'A node:test check that parses the workflow and asserts the cache step and the key script.',
        films: [],
      },
      pullRequestNumber: PULL_REQUEST.ciPackageCache,
      checks: [
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.ciCache,
          runner: 'node-test',
          onBase: 'fails',
          before: { result: 'failed', detail: 'The workflow has no cache step and no key script.' },
        }),
      ],
      checksFrozenAt: ago(days(6) + hours(2)),
      attempts: attemptsOf(runs, [RUN.ciPackageCacheImplementer, 'session', 'passed', 'The cache step and the key script were added; the frozen check passes.']),
      createdAt: ago(days(14)),
      updatedAt: ago(hours(22)),
    }),
    issueView({
      ...common(ISSUE.deliveryBanner),
      type: 'ui',
      state: 'in-prep',
      spec: {
        need: 'Customers ask on the product page when an item will arrive; the date only appears in the cart.',
        acceptanceCriteria: [
          'The product page shows "Order today, delivered by <date>" under the price when an estimate exists.',
          'The banner is absent when no estimate is available.',
          'The date uses the date format of the shop.',
        ],
        outOfScope: ['Estimating dates for items that are not in stock'],
        expectedProof: 'A browser journey on a product with an estimate and on one without, with a screenshot of the banner.',
        films: [],
      },
      pullRequestNumber: PULL_REQUEST.deliveryBanner,
      checks: [
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.deliveryBanner,
          runner: 'playwright',
          onBase: 'fails',
          before: {
            result: 'failed',
            detail: 'The product page has no delivery banner.',
            screenshotUrl: evidencePath(STOREFRONT_ID, ISSUE.deliveryBanner, 'checks/delivery-banner-before.png'),
          },
        }),
      ],
      checksFrozenAt: ago(days(2) + hours(4)),
      attempts: attemptsOf(runs, [RUN.deliveryBannerImplementer, 'session', 'passed', 'The banner and its hook were added; both journeys pass.']),
      createdAt: ago(days(6)),
      updatedAt: ago(hours(22)),
    }),
    issueView({
      ...common(ISSUE.promoRounding),
      type: 'fix',
      state: 'in-release',
      spec: {
        need: 'A 10% code on a basket of 19.95 euros takes 1.99 euros off instead of 2.00, because the discount is computed on floating point euros.',
        acceptanceCriteria: [
          'A 10% code on 19.95 euros gives a discount of 2.00 euros.',
          'A discount never exceeds the subtotal of the basket.',
          'Discounts that are already a whole number of cents are unchanged.',
        ],
        outOfScope: ['Changing which codes can be combined'],
        expectedProof: 'Unit tests of the discount computation that fail on the current code.',
        films: [],
      },
      pullRequestNumber: PULL_REQUEST.promoRounding,
      checks: [
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.promoRounding,
          runner: 'vitest',
          onBase: 'fails',
          before: { result: 'failed', detail: 'discountOf(1995, 10%) returns 199 instead of 200.' },
        }),
      ],
      checksFrozenAt: ago(hours(8)),
      attempts: attemptsOf(runs, [RUN.promoRoundingImplementer, 'session', 'passed', 'The discount is computed on integer cents; the frozen checks pass.']),
      createdAt: ago(days(3)),
      updatedAt: ago(hours(3)),
    }),
    issueView({
      ...common(ISSUE.cartBadgeSync),
      type: 'fix',
      state: 'in-dev',
      spec: {
        need: 'The badge in the header counts the lines of the cart instead of the items, and keeps its old value after a line is removed.',
        acceptanceCriteria: ['The badge shows the total quantity of items in the cart.', 'Removing a line updates the badge without reloading the page.'],
        outOfScope: ['Animating the badge'],
        expectedProof: 'Component tests of the badge that fail on the current code.',
        films: [],
      },
      pullRequestNumber: PULL_REQUEST.cartBadgeSync,
      checks: [
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.cartBadge,
          runner: 'vitest',
          onBase: 'fails',
          before: { result: 'failed', detail: 'The badge shows 2 for a cart of 3 items.' },
        }),
      ],
      checksFrozenAt: ago(hours(5)),
      attempts: attemptsOf(runs, [RUN.cartBadgeImplementer, 'session', 'passed', 'The hook sums the quantities; the badge follows the cart.']),
      createdAt: ago(hours(30)),
      updatedAt: ago(140),
    }),
    issueView({
      ...common(ISSUE.orderHistoryPagination),
      type: 'api',
      state: 'merged',
      spec: specOfProposal(paginationSpec),
      requestId: REQUEST.orderHistory,
      pullRequestNumber: PULL_REQUEST.orderHistoryPagination,
      checks: [
        frozenCheck({
          project: STOREFRONT_ID,
          path: CHECK_PATH.pagination,
          runner: 'vitest',
          onBase: 'fails',
          before: { result: 'failed', detail: 'The endpoint returns all 250 orders and ignores the limit.' },
        }),
      ],
      checksFrozenAt: ago(days(1) - 18),
      attempts: attemptsOf(
        runs,
        [RUN.paginationImplementer, 'session', 'passed', 'Page size and cursor handling were added; the integration checks pass.'],
        [RUN.paginationCorrection, 'correction', 'passed', 'A limit of zero is refused like a limit above the ceiling, after a comment on the pull request.'],
      ),
      createdAt: ago(days(9)),
      updatedAt: ago(25),
    }),
  ];
}

