import type { CheckConclusion, CheckRunView, PullRequestDiff, PullRequestView, ReviewRound } from '../../../contract/index.ts';
import { storefrontLinks } from '../forge-links.ts';
import { DANA, JORDAN } from '../people.ts';
import { failedAfter, NEVER_READ, readOn } from '../readings.ts';
import { runOf, type RunWorld } from '../runs.ts';
import { changedFiles, diffOf } from '../patch.ts';
import type { PatchedFile } from '../patch.ts';
import { pullRequestView } from '../seeds.ts';
import { days, hours, type FixtureClock } from '../time.ts';
import { CART_BADGE_FILES, EXPIRED_PROMO_FILES, PAGINATION_FILES, PROMO_ROUNDING_FILES } from './diffs-merged.ts';
import { DELIVERY_BANNER_FILES, CI_PACKAGE_CACHE_FILES, HTTP_CLIENT_BUMP_FILES, LOCAL_SETUP_FILES } from './diffs-early.ts';
import { CHECKOUT_SCREEN_READER_FILES, LEGACY_DATE_HELPERS_FILES, NATURAL_LANGUAGE_SEARCH_FILES } from './diffs-open.ts';
import { acceptanceOnly, checkoutEvidence, expiredPromoEvidence, reportOnly, searchEvidence } from './evidence.ts';
import { headSha, ISSUE, issueBranch, mergeSha, PULL_REQUEST, RUN } from './ids.ts';
import { CHECK_PATH } from './paths.ts';
import { REVIEW_FINDINGS } from './reviews.ts';


const PATCHED_FILES: Readonly<Record<number, readonly PatchedFile[]>> = {
  [PULL_REQUEST.localSetupDocs]: LOCAL_SETUP_FILES,
  [PULL_REQUEST.httpClientBump]: HTTP_CLIENT_BUMP_FILES,
  [PULL_REQUEST.ciPackageCache]: CI_PACKAGE_CACHE_FILES,
  [PULL_REQUEST.deliveryBanner]: DELIVERY_BANNER_FILES,
  [PULL_REQUEST.promoRounding]: PROMO_ROUNDING_FILES,
  [PULL_REQUEST.cartBadgeSync]: CART_BADGE_FILES,
  [PULL_REQUEST.orderHistoryPagination]: PAGINATION_FILES,
  [PULL_REQUEST.naturalLanguageSearch]: NATURAL_LANGUAGE_SEARCH_FILES,
  [PULL_REQUEST.checkoutScreenReader]: CHECKOUT_SCREEN_READER_FILES,
  [PULL_REQUEST.expiredPromoMessage]: EXPIRED_PROMO_FILES,
  [PULL_REQUEST.legacyDateHelpers]: LEGACY_DATE_HELPERS_FILES,
};

function check(pullRequest: number, name: string, conclusion: CheckConclusion, durationMs: number | null, failsOnBase = false): CheckRunView {
  return { name, conclusion, url: `${storefrontLinks.pullRequest(pullRequest)}/checks?check=${encodeURIComponent(name)}`, durationMs, failsOnBase };
}

function passingChecks(pullRequest: number): CheckRunView[] {
  return [check(pullRequest, 'build', 'success', 71_000), check(pullRequest, 'lint', 'success', 38_000), check(pullRequest, 'unit-tests', 'success', 112_000)];
}

function roundsOf(runs: RunWorld, ...runIds: readonly string[]): ReviewRound[] {
  return runIds.map((runId, index) => {
    const completedAt = runOf(runs, runId).endedAt;
    if (completedAt === null) throw new Error(`the review run ${runId} has not ended`);
    return { round: index + 1, runId, completedAt, findings: [...(REVIEW_FINDINGS[runId] ?? [])] };
  });
}

interface MergedPullRequest {
  readonly number: number;
  readonly issue: number;
  readonly type: string;
  readonly title: string;
  readonly openedMinutesAgo: number;
  readonly mergedMinutesAgo: number;
}

function merged(clock: FixtureClock, source: MergedPullRequest): Pick<PullRequestView, 'number' | 'title' | 'issueNumber' | 'type' | 'branch' | 'url' | 'headSha' | 'state' | 'openedAt' | 'mergedAt' | 'checks'> {
  return {
    number: source.number,
    title: source.title,
    issueNumber: source.issue,
    type: source.type,
    branch: issueBranch(source.issue),
    url: storefrontLinks.pullRequest(source.number),
    headSha: headSha(source.number),
    state: 'merged',
    openedAt: clock.minutesAgo(source.openedMinutesAgo),
    mergedAt: clock.minutesAgo(source.mergedMinutesAgo),
    checks: NEVER_READ,
  };
}

export function storefrontPullRequests(clock: FixtureClock, runs: RunWorld): PullRequestView[] {
  const ago = (minutes: number): string => clock.minutesAgo(minutes);
  return [
    pullRequestView({
      ...merged(clock, {
        number: PULL_REQUEST.localSetupDocs,
        issue: ISSUE.localSetupDocs,
        type: 'docs',
        title: 'docs: document the local development setup',
        openedMinutesAgo: days(46),
        mergedMinutesAgo: days(45),
      }),
      evidence: reportOnly('Summary of the change', 'Adds docs/development/local-setup.md and links it from the README. Documentation only; the test suite is unchanged.'),
      reviewRounds: roundsOf(runs, RUN.localSetupDocsReview),
      files: changedFiles(LOCAL_SETUP_FILES),
    }),
    pullRequestView({
      ...merged(clock, {
        number: PULL_REQUEST.httpClientBump,
        issue: ISSUE.httpClientBump,
        type: 'dependencies',
        title: 'build(deps): update the HTTP client to its latest minor release',
        openedMinutesAgo: days(10) - 45,
        mergedMinutesAgo: days(8),
      }),
      evidence: reportOnly('Summary of the change', 'Updates the HTTP client to 7.5.1 and caps the pool at 16 connections per origin. The API test suite passes unchanged.'),
      reviewRounds: roundsOf(runs, RUN.httpClientBumpReview),
      files: changedFiles(HTTP_CLIENT_BUMP_FILES),
    }),
    pullRequestView({
      ...merged(clock, {
        number: PULL_REQUEST.ciPackageCache,
        issue: ISSUE.ciPackageCache,
        type: 'infra',
        title: 'ci: cache the package store between CI runs',
        openedMinutesAgo: days(6),
        mergedMinutesAgo: days(5),
      }),
      evidence: acceptanceOnly('node-test', CHECK_PATH.ciCache, 'the CI workflow restores the package store with a key built from the lockfile', [
        'The CI workflow restores the package store from a cache before installing.',
        'The cache key is built from the hash of the lockfile.',
        'A change to the lockfile produces a different key.',
      ]),
      reviewRounds: roundsOf(runs, RUN.ciPackageCacheReview),
      files: changedFiles(CI_PACKAGE_CACHE_FILES),
    }),
    pullRequestView({
      ...merged(clock, {
        number: PULL_REQUEST.deliveryBanner,
        issue: ISSUE.deliveryBanner,
        type: 'ui',
        title: 'feat(product): show the delivery date on the product page',
        openedMinutesAgo: days(2) + hours(2),
        mergedMinutesAgo: hours(30),
      }),
      evidenceComplete: false,
      missingEvidence: ['screenshot of the product page without a delivery estimate'],
      evidence: acceptanceOnly('playwright', CHECK_PATH.deliveryBanner, 'shows the delivery date on the product page when an estimate exists', [
        'The product page shows "Order today, delivered by <date>" under the price when an estimate exists.',
        'The banner is absent when no estimate is available.',
      ]),
      reviewRounds: roundsOf(runs, RUN.deliveryBannerReview),
      files: changedFiles(DELIVERY_BANNER_FILES),
    }),
    pullRequestView({
      ...merged(clock, {
        number: PULL_REQUEST.promoRounding,
        issue: ISSUE.promoRounding,
        type: 'fix',
        title: 'fix(promo): round promo code discounts to the cent',
        openedMinutesAgo: 375,
        mergedMinutesAgo: 300,
      }),
      evidence: acceptanceOnly('vitest', CHECK_PATH.promoRounding, 'rounds half a cent up instead of drifting with floating point', [
        'A 10% code on 19.95 euros gives a discount of 2.00 euros.',
        'A discount never exceeds the subtotal of the basket.',
      ]),
      reviewRounds: roundsOf(runs, RUN.promoRoundingReview),
      files: changedFiles(PROMO_ROUNDING_FILES),
    }),
    pullRequestView({
      ...merged(clock, {
        number: PULL_REQUEST.cartBadgeSync,
        issue: ISSUE.cartBadgeSync,
        type: 'fix',
        title: 'fix(cart): keep the cart badge in sync after removing a line',
        openedMinutesAgo: 185,
        mergedMinutesAgo: 150,
      }),
      evidence: acceptanceOnly('vitest', CHECK_PATH.cartBadge, 'counts the items of the cart, not its lines', [
        'The badge shows the total quantity of items in the cart.',
        'Removing a line updates the badge without reloading the page.',
      ]),
      reviewRounds: roundsOf(runs, RUN.cartBadgeReview),
      files: changedFiles(CART_BADGE_FILES),
    }),
    pullRequestView({
      ...merged(clock, {
        number: PULL_REQUEST.orderHistoryPagination,
        issue: ISSUE.orderHistoryPagination,
        type: 'api',
        title: 'feat(orders): paginate the order history endpoint',
        openedMinutesAgo: 74,
        mergedMinutesAgo: 25,
      }),
      evidence: acceptanceOnly('vitest', CHECK_PATH.pagination, 'returns 20 orders by default and a cursor for the next page', [
        'GET /api/orders returns at most 20 orders by default and a cursor for the next page.',
        'A limit above 100 is refused with HTTP 400.',
      ]),
      reviewRounds: roundsOf(runs, RUN.paginationReview),
      externalFeedback: [
        {
          id: 'feedback-1',
          author: JORDAN.login,
          source: 'github-review-comment',
          receivedAt: ago(68),
          body: 'A limit of 0 returns an empty page without a cursor, which looks like the end of the history. It should be refused like a limit above 100.',
          cycleStarted: true,
        },
        { id: 'feedback-2', author: DANA.login, source: 'github-comment', receivedAt: ago(60), body: 'Thanks, this makes the page much faster for the accounts with hundreds of orders.', cycleStarted: false },
      ],
      files: changedFiles(PAGINATION_FILES),
    }),
    pullRequestView({
      number: PULL_REQUEST.naturalLanguageSearch,
      title: 'feat(search): understand colour and price words in the product search',
      issueNumber: ISSUE.naturalLanguageSearch,
      type: 'prompt',
      branch: issueBranch(ISSUE.naturalLanguageSearch),
      url: storefrontLinks.pullRequest(PULL_REQUEST.naturalLanguageSearch),
      headSha: headSha(PULL_REQUEST.naturalLanguageSearch),
      state: 'open',
      openedAt: ago(4170),
      checks: readOn(
        [...passingChecks(PULL_REQUEST.naturalLanguageSearch), check(PULL_REQUEST.naturalLanguageSearch, 'e2e-search', 'success', 203_000), check(PULL_REQUEST.naturalLanguageSearch, 'deploy-preview', 'neutral', null)],
        ago(3),
      ),
      evidence: searchEvidence(),
      reviewRounds: roundsOf(runs, RUN.searchReviewOne, RUN.searchReviewTwo),
      externalFeedback: [
        { id: 'feedback-1', author: DANA.login, source: 'github-comment', receivedAt: ago(4000), body: 'Tried it on the preview: "blue sneakers under 60" does what I expected. Thanks!', cycleStarted: false },
      ],
      files: changedFiles(NATURAL_LANGUAGE_SEARCH_FILES),
      mergeable: true,
    }),
    pullRequestView({
      number: PULL_REQUEST.checkoutScreenReader,
      title: 'feat(checkout): announce the errors of the address form to assistive technology',
      issueNumber: ISSUE.checkoutScreenReader,
      type: 'ui',
      branch: issueBranch(ISSUE.checkoutScreenReader),
      url: storefrontLinks.pullRequest(PULL_REQUEST.checkoutScreenReader),
      headSha: headSha(PULL_REQUEST.checkoutScreenReader),
      state: 'open',
      openedAt: ago(days(1)),
      checks: failedAfter(
        readOn(
          [...passingChecks(PULL_REQUEST.checkoutScreenReader), check(PULL_REQUEST.checkoutScreenReader, 'e2e-checkout', 'pending', null)],
          ago(40),
        ),
        'GitHub API rate limit exceeded; the next attempt is allowed in 12 minutes.',
      ),
      evidenceComplete: false,
      missingEvidence: ['recording of the keyboard-only checkout journey'],
      evidence: checkoutEvidence(),
      reviewRounds: roundsOf(runs, RUN.checkoutReview),
      files: changedFiles(CHECKOUT_SCREEN_READER_FILES),
      mergeBlockers: [
        'The evidence is incomplete: recording of the keyboard-only checkout journey.',
        'The checks of the head commit have not been read for 40 minutes: GitHub API rate limit exceeded.',
      ],
    }),
    pullRequestView({
      number: PULL_REQUEST.expiredPromoMessage,
      title: 'fix(cart): tell customers when a promo code has expired',
      issueNumber: ISSUE.expiredPromoMessage,
      type: 'fix',
      branch: issueBranch(ISSUE.expiredPromoMessage),
      url: storefrontLinks.pullRequest(PULL_REQUEST.expiredPromoMessage),
      headSha: headSha(PULL_REQUEST.expiredPromoMessage),
      state: 'open',
      openedAt: ago(210),
      checks: readOn(
        [
          ...passingChecks(PULL_REQUEST.expiredPromoMessage),
          check(PULL_REQUEST.expiredPromoMessage, 'e2e-checkout', 'failure', 187_000),
          check(PULL_REQUEST.expiredPromoMessage, 'docs-links', 'failure', 24_000, true),
          check(PULL_REQUEST.expiredPromoMessage, 'deploy-preview', 'pending', null),
        ],
        ago(2),
      ),
      evidence: expiredPromoEvidence(),
      reviewRounds: roundsOf(runs, RUN.expiredPromoReview),
      files: changedFiles(EXPIRED_PROMO_FILES),
      mergeBlockers: ['The check e2e-checkout failed.', 'The check deploy-preview is still running.'],
    }),
    pullRequestView({
      number: PULL_REQUEST.legacyDateHelpers,
      title: 'refactor(lib): replace the legacy date helpers',
      issueNumber: ISSUE.legacyDateHelpers,
      type: 'refactor',
      branch: issueBranch(ISSUE.legacyDateHelpers),
      url: storefrontLinks.pullRequest(PULL_REQUEST.legacyDateHelpers),
      headSha: headSha(PULL_REQUEST.legacyDateHelpers),
      state: 'closed',
      openedAt: ago(7205),
      checks: NEVER_READ,
      evidence: acceptanceOnly('vitest', CHECK_PATH.dateHelpers, 'numbers the first days of January', [
        'Every use of the legacy helpers goes through the new module.',
        'Behaviour is unchanged for every date, including the last days of December.',
      ]),
      reviewRounds: roundsOf(runs, RUN.dateHelpersReview),
      externalFeedback: [
        {
          id: 'feedback-1',
          author: JORDAN.login,
          source: 'github-comment',
          receivedAt: ago(7160),
          body: 'We plan to drop these helpers for Intl once the locale work lands, so I would not merge this one.',
          cycleStarted: false,
        },
      ],
      files: changedFiles(LEGACY_DATE_HELPERS_FILES),
    }),
  ];
}

const DIFF_READ_MINUTES_AGO = 1;

/** The diffs the factory serves for the pull requests of the storefront, each made of the patches behind the totals of its files. */
export function storefrontDiffs(clock: FixtureClock, pullRequests: readonly PullRequestView[]): PullRequestDiff[] {
  return pullRequests.map((pullRequest) => {
    const files = PATCHED_FILES[pullRequest.number];
    if (files === undefined) throw new Error(`no patched files for the pull request ${pullRequest.number}`);
    return diffOf(pullRequest.number, files, { baseSha: mergeSha(pullRequest.number - 1), headSha: pullRequest.headSha, readAt: clock.minutesAgo(DIFF_READ_MINUTES_AGO) });
  });
}
