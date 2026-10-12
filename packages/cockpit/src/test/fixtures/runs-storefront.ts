import type { AgentRole } from '@agent-factory/domain';
import type { AgentRunOutcome, RunStatus } from '../../contract/index.ts';
import { ACCOUNT_PERSONAL, ACCOUNT_SHARED, MODEL_OPUS } from './people.ts';
import type { RunSpec } from './run-spec.ts';
import { days, hours } from './time.ts';
import { PROMO_SAVINGS_OPTIONS, PROMO_SAVINGS_FINDING, PROMO_SAVINGS_QUESTION } from './storefront/decisions.ts';
import { DIRECT_PUSH_SHA, ISSUE, issueBranch, mergeSha, OUTSIDE_PULL_REQUEST, PULL_REQUEST, RELEASE, REQUEST, RUN } from './storefront/ids.ts';
import { STOREFRONT_ID } from './project-ids.ts';

interface Timing {
  readonly startedMinutesAgo: number;
  readonly durationMinutes: number | null;
}

interface Result {
  readonly status: RunStatus;
  readonly outcome: AgentRunOutcome | null;
}

const SUCCEEDED: Result = { status: 'succeeded', outcome: 'success' };

type Extras = Partial<Pick<RunSpec, 'account' | 'model' | 'effort' | 'resumed' | 'turns' | 'script' | 'question'>>;

function onIssue(id: string, role: AgentRole, issueNumber: number, attempt: number, timing: Timing, result: Result = SUCCEEDED, extras: Extras = {}): RunSpec {
  return {
    id,
    project: STOREFRONT_ID,
    role,
    subject: { kind: 'issue', id: String(issueNumber) },
    attempt,
    branch: issueBranch(issueNumber),
    account: ACCOUNT_PERSONAL,
    ...timing,
    ...result,
    ...extras,
  };
}

function onRequest(id: string, requestId: string, timing: Timing, result: Result = SUCCEEDED, extras: Extras = {}): RunSpec {
  return { id, project: STOREFRONT_ID, role: 'challenger', subject: { kind: 'request', id: requestId }, attempt: 0, branch: null, account: ACCOUNT_PERSONAL, ...timing, ...result, ...extras };
}

function onAudit(id: string, auditId: string, timing: Timing, result: Result = SUCCEEDED, extras: Extras = {}): RunSpec {
  return { id, project: STOREFRONT_ID, role: 'auditor', subject: { kind: 'audit', id: auditId }, attempt: 0, branch: null, account: ACCOUNT_PERSONAL, ...timing, ...result, ...extras };
}

function onRelease(id: string, releaseId: string, timing: Timing, extras: Extras = {}): RunSpec {
  return { id, project: STOREFRONT_ID, role: 'release-auditor', subject: { kind: 'release', id: releaseId }, attempt: 0, branch: null, account: ACCOUNT_PERSONAL, ...timing, ...SUCCEEDED, ...extras };
}

function timing(startedMinutesAgo: number, durationMinutes: number | null): Timing {
  return { startedMinutesAgo, durationMinutes };
}

const FAILED_MAX_TURNS: Result = { status: 'failed', outcome: 'max-turns' };
const FAILED_BUDGET: Result = { status: 'failed', outcome: 'budget-exceeded' };
const FAILED_TIMEOUT: Result = { status: 'failed', outcome: 'timeout' };
const FAILED_ERROR: Result = { status: 'failed', outcome: 'error' };
const STOPPED: Result = { status: 'stopped', outcome: 'aborted' };

export const STOREFRONT_RUN_SPECS: readonly RunSpec[] = [
  onIssue(RUN.statusFilterImplementer, 'implementer', ISSUE.orderHistoryStatusFilter, 0, timing(14, null), { status: 'running', outcome: null }, { script: 'status-filter-implementer' }),
  onIssue(RUN.promoSavingsAsk, 'implementer', ISSUE.promoSavingsSummary, 3, timing(59, 38), { status: 'waiting', outcome: 'decision-requested' }, {
    model: MODEL_OPUS,
    effort: 'xhigh',
    script: 'promo-savings-decision',
    question: { id: `decision-${RUN.promoSavingsAsk}`, text: `${PROMO_SAVINGS_FINDING} ${PROMO_SAVINGS_QUESTION}`, options: PROMO_SAVINGS_OPTIONS },
  }),
  onIssue(RUN.promoSavingsFirst, 'implementer', ISSUE.promoSavingsSummary, 0, timing(300, 58), FAILED_MAX_TURNS, { turns: 'turn-limit' }),
  onIssue(RUN.promoSavingsSecond, 'implementer', ISSUE.promoSavingsSummary, 1, timing(235, 45), FAILED_BUDGET, { turns: 'budget-limit', resumed: true }),
  onIssue(RUN.promoSavingsThird, 'implementer', ISSUE.promoSavingsSummary, 2, timing(185, 60), FAILED_TIMEOUT, { resumed: true }),
  onIssue(RUN.promoSavingsAuthor, 'acceptance-author', ISSUE.promoSavingsSummary, 0, timing(hours(9), 21)),
  onIssue(RUN.statusFilterAuthor, 'acceptance-author', ISSUE.orderHistoryStatusFilter, 0, timing(hours(26), 17)),

  onIssue(RUN.searchAuthor, 'acceptance-author', ISSUE.naturalLanguageSearch, 0, timing(days(3) + hours(4), 22)),
  onIssue(RUN.searchFirst, 'implementer', ISSUE.naturalLanguageSearch, 0, timing(days(3) + hours(2), 74)),
  onIssue(RUN.searchReviewOne, 'reviewer', ISSUE.naturalLanguageSearch, 0, timing(4355, 9)),
  onIssue(RUN.searchSecond, 'implementer', ISSUE.naturalLanguageSearch, 1, timing(4260, 31), SUCCEEDED, { resumed: true }),
  onIssue(RUN.searchReviewTwo, 'reviewer', ISSUE.naturalLanguageSearch, 1, timing(4215, 8), SUCCEEDED, { script: 'search-second-review' }),

  onIssue(RUN.checkoutAuthor, 'acceptance-author', ISSUE.checkoutScreenReader, 0, timing(1980, 19), SUCCEEDED, { account: ACCOUNT_SHARED }),
  onIssue(RUN.checkoutFirst, 'implementer', ISSUE.checkoutScreenReader, 0, timing(hours(27), 52)),
  onIssue(RUN.checkoutSecond, 'implementer', ISSUE.checkoutScreenReader, 1, timing(hours(26), 24), SUCCEEDED, { resumed: true }),
  onIssue(RUN.checkoutReview, 'reviewer', ISSUE.checkoutScreenReader, 0, timing(1500, 7)),

  onIssue(RUN.expiredPromoAuthor, 'acceptance-author', ISSUE.expiredPromoMessage, 0, timing(330, 18)),
  onIssue(RUN.expiredPromoImplementer, 'implementer', ISSUE.expiredPromoMessage, 0, timing(290, 47), SUCCEEDED, { script: 'expired-promo-implementer' }),
  onIssue(RUN.expiredPromoReview, 'reviewer', ISSUE.expiredPromoMessage, 0, timing(230, 6)),

  onIssue(RUN.savedAddressAuthor, 'acceptance-author', ISSUE.savedDeliveryAddress, 0, timing(180, 14)),
  onIssue(RUN.savedAddressImplementer, 'implementer', ISSUE.savedDeliveryAddress, 0, timing(140, 38)),

  onIssue(RUN.reorderAuthor, 'acceptance-author', ISSUE.oneClickReorder, 0, timing(1700, 16), SUCCEEDED, { account: ACCOUNT_SHARED }),
  onIssue(RUN.reorderStopped, 'implementer', ISSUE.oneClickReorder, 0, timing(50, 12), STOPPED),

  onIssue(RUN.dateHelpersImplementer, 'implementer', ISSUE.legacyDateHelpers, 0, timing(7260, 35)),
  onIssue(RUN.dateHelpersReview, 'reviewer', ISSUE.legacyDateHelpers, 0, timing(7215, 6)),

  onRequest(RUN.challengeOrderHistory, REQUEST.orderHistory, timing(days(12), 9), SUCCEEDED, { account: ACCOUNT_SHARED }),
  onRequest(RUN.challengeDeliveryTracking, REQUEST.deliveryTracking, timing(340, 10)),
  onRequest(RUN.challengeWishlistSharing, REQUEST.wishlistSharing, timing(2900, 8)),
  onRequest(RUN.challengeLoyaltyPoints, REQUEST.loyaltyPoints, timing(days(6) + hours(1), 5), SUCCEEDED, { account: ACCOUNT_SHARED }),
  onRequest(RUN.challengeReturnsLabels, REQUEST.returnsLabels, timing(47, 6), FAILED_ERROR),

  onAudit(RUN.auditDoubleSubmit, DIRECT_PUSH_SHA, timing(1740, 25), FAILED_TIMEOUT),
  onAudit(RUN.auditFooterLinks, mergeSha(OUTSIDE_PULL_REQUEST.footerLinks), timing(4080, 7)),
  onAudit(RUN.auditPromoBannerCopy, mergeSha(OUTSIDE_PULL_REQUEST.promoBannerCopy), timing(1130, 9)),
  onAudit(RUN.auditHttpClientBump, mergeSha(PULL_REQUEST.httpClientBump), timing(days(9), 8), SUCCEEDED, { account: ACCOUNT_SHARED }),

  onRelease(RUN.releaseOneSeven, RELEASE.oneSeven, timing(days(22), 12), { account: null }),
  onRelease(RUN.releaseOneEight, RELEASE.oneEight, timing(days(6) - 30, 11)),
  onRelease(RUN.releaseOneEightOne, RELEASE.oneEightOne, timing(days(4) - 20, 10)),
  onRelease(RUN.releaseOneEightTwo, RELEASE.oneEightTwo, timing(1550, 11)),

  onIssue(RUN.localSetupDocsImplementer, 'implementer', ISSUE.localSetupDocs, 0, timing(days(47), 20)),
  onIssue(RUN.localSetupDocsReview, 'reviewer', ISSUE.localSetupDocs, 0, timing(days(47) - 30, 5)),
  onIssue(RUN.httpClientBumpImplementer, 'implementer', ISSUE.httpClientBump, 0, timing(days(10), 28)),
  onIssue(RUN.httpClientBumpReview, 'reviewer', ISSUE.httpClientBump, 0, timing(days(10) - 35, 6)),
  onIssue(RUN.ciPackageCacheImplementer, 'implementer', ISSUE.ciPackageCache, 0, timing(days(6) + hours(1), 33)),
  onIssue(RUN.ciPackageCacheReview, 'reviewer', ISSUE.ciPackageCache, 0, timing(days(6) + hours(1) - 50, 6)),
  onIssue(RUN.deliveryBannerImplementer, 'implementer', ISSUE.deliveryBanner, 0, timing(days(2) + hours(3), 39)),
  onIssue(RUN.deliveryBannerReview, 'reviewer', ISSUE.deliveryBanner, 0, timing(days(2) + hours(3) - 50, 7)),
  onIssue(RUN.promoRoundingImplementer, 'implementer', ISSUE.promoRounding, 0, timing(420, 29)),
  onIssue(RUN.promoRoundingReview, 'reviewer', ISSUE.promoRounding, 0, timing(385, 6)),
  onIssue(RUN.cartBadgeImplementer, 'implementer', ISSUE.cartBadgeSync, 0, timing(240, 31)),
  onIssue(RUN.cartBadgeReview, 'reviewer', ISSUE.cartBadgeSync, 0, timing(195, 5)),
  onIssue(RUN.paginationAuthor, 'acceptance-author', ISSUE.orderHistoryPagination, 0, timing(hours(24), 18), SUCCEEDED, { account: ACCOUNT_SHARED }),
  onIssue(RUN.paginationImplementer, 'implementer', ISSUE.orderHistoryPagination, 0, timing(130, 40)),
  onIssue(RUN.paginationReview, 'reviewer', ISSUE.orderHistoryPagination, 0, timing(85, 8)),
  onIssue(RUN.paginationCorrection, 'implementer', ISSUE.orderHistoryPagination, 1, timing(66, 14), SUCCEEDED, { resumed: true }),

  {
    id: RUN.weeklyDigest,
    project: null,
    role: 'summarizer',
    subject: { kind: 'release', id: 'weekly-digest' },
    attempt: 0,
    branch: null,
    account: null,
    ...timing(370, 4),
    ...SUCCEEDED,
  },
];
