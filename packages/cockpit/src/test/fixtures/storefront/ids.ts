import { sha } from '../time.ts';

const PROJECT = 'storefront';

/** Issue numbers; the numbering is shared with pull requests and release pull requests, as on the forge. */
export const ISSUE = {
  localSetupDocs: 12,
  httpClientBump: 19,
  ciPackageCache: 24,
  deliveryBanner: 28,
  promoRounding: 31,
  cartBadgeSync: 36,
  orderHistoryPagination: 41,
  orderHistoryStatusFilter: 45,
  promoSavingsSummary: 49,
  naturalLanguageSearch: 52,
  checkoutScreenReader: 55,
  expiredPromoMessage: 58,
  savedDeliveryAddress: 61,
  oneClickReorder: 64,
  searchPriceSort: 66,
  deliveryDateEstimate: 70,
  expressDelivery: 73,
  httpTimeoutRegression: 75,
  stockLevelOnProduct: 77,
  legacyDateHelpers: 79,
} as const;

export const ISSUE_TITLE: Readonly<Record<number, string>> = {
  [ISSUE.localSetupDocs]: 'Document the local development setup',
  [ISSUE.httpClientBump]: 'Update the HTTP client to its latest minor release',
  [ISSUE.ciPackageCache]: 'Cache the package store between CI runs',
  [ISSUE.deliveryBanner]: 'Show the delivery date on the product page',
  [ISSUE.promoRounding]: 'Round promo code discounts to the cent',
  [ISSUE.cartBadgeSync]: 'Keep the cart badge in sync after removing a line',
  [ISSUE.orderHistoryPagination]: 'Paginate the order history endpoint',
  [ISSUE.orderHistoryStatusFilter]: 'Filter the order history by status',
  [ISSUE.promoSavingsSummary]: 'Show the savings of a promo code in the cart summary',
  [ISSUE.naturalLanguageSearch]: 'Understand colour and price words in the product search',
  [ISSUE.checkoutScreenReader]: 'Make the checkout address form usable with a screen reader',
  [ISSUE.expiredPromoMessage]: 'Tell customers when a promo code has expired',
  [ISSUE.savedDeliveryAddress]: 'Remember the delivery address between orders',
  [ISSUE.oneClickReorder]: 'Reorder a past order in one click',
  [ISSUE.searchPriceSort]: 'Sort the search results by price',
  [ISSUE.deliveryDateEstimate]: 'Estimate the delivery date from the saved address',
  [ISSUE.expressDelivery]: 'Offer an express delivery option at checkout',
  [ISSUE.httpTimeoutRegression]: 'Pin the HTTP client timeout of the checkout service',
  [ISSUE.stockLevelOnProduct]: 'Show the stock level on the product page',
  [ISSUE.legacyDateHelpers]: 'Replace the legacy date helpers',
};

export function titleOf(issueNumber: number): string {
  const title = ISSUE_TITLE[issueNumber];
  if (title === undefined) throw new Error(`no title for the storefront issue ${issueNumber}`);
  return title;
}

/** Pull requests opened by the factory for the issues above. */
export const PULL_REQUEST = {
  localSetupDocs: 14,
  httpClientBump: 22,
  ciPackageCache: 27,
  deliveryBanner: 29,
  promoRounding: 34,
  cartBadgeSync: 39,
  orderHistoryPagination: 44,
  naturalLanguageSearch: 57,
  checkoutScreenReader: 60,
  expiredPromoMessage: 62,
  legacyDateHelpers: 80,
} as const;

/** Pull requests of other people and other automations. */
export const OUTSIDE_PULL_REQUEST = {
  routerBump: 13,
  footerLinks: 42,
  zodBump: 43,
  viteBump: 46,
  promoBannerCopy: 48,
  apiReferenceSync: 53,
  lockfileRefresh: 54,
  apiReferenceResync: 56,
} as const;

export const RELEASE_PULL_REQUEST = { supersededOneEight: 47, nextMinor: 72 } as const;

export const REQUEST = {
  promoExpiry: 'R-11',
  orderHistory: 'R-12',
  guestCheckout: 'R-13',
  giftWrapping: 'R-14',
  deliveryTracking: 'R-15',
  wishlistSharing: 'R-16',
  loyaltyPoints: 'R-17',
  returnsLabels: 'R-18',
} as const;

export const REQUEST_TITLE: Readonly<Record<string, string>> = {
  [REQUEST.promoExpiry]: 'Customers do not understand why a promo code is refused',
  [REQUEST.orderHistory]: 'Order history is hard to use',
  [REQUEST.guestCheckout]: 'Guest checkout loses the cart after the payment page',
  [REQUEST.giftWrapping]: 'Offer gift wrapping at checkout',
  [REQUEST.deliveryTracking]: 'Show where my parcel is',
  [REQUEST.wishlistSharing]: 'Share a wishlist with friends',
  [REQUEST.loyaltyPoints]: 'Add a loyalty points scheme',
  [REQUEST.returnsLabels]: 'Print a returns label from the order page',
};

export const RELEASE = {
  oneSeven: '1.7.0',
  supersededOneEight: 'pr-47',
  oneEight: '1.8.0',
  oneEightOne: '1.8.1',
  oneEightTwo: '1.8.2',
  oneEightThree: '1.8.3',
  nextMinor: 'pr-72',
} as const;

export function mergeSha(pullRequest: number): string {
  return sha(`${PROJECT}:merge:${pullRequest}`);
}

export function headSha(pullRequest: number): string {
  return sha(`${PROJECT}:head:${pullRequest}`);
}

export const DIRECT_PUSH_SHA = sha(`${PROJECT}:direct-push:checkout-double-submit`);

export const TAG_SHA = {
  oneSix: sha(`${PROJECT}:tag:1.6.0`),
  oneSixOne: sha(`${PROJECT}:tag:1.6.1`),
  oneSeven: sha(`${PROJECT}:tag:1.7.0`),
  oneEight: sha(`${PROJECT}:tag:1.8.0`),
  oneEightOne: sha(`${PROJECT}:tag:1.8.1`),
  oneEightTwo: sha(`${PROJECT}:tag:1.8.2`),
  oneEightThree: sha(`${PROJECT}:tag:1.8.3`),
} as const;

function branchOf(issueNumber: number, slug: string): string {
  return `factory/${issueNumber}-${slug}`;
}

export const BRANCH_SLUG = {
  [ISSUE.localSetupDocs]: 'local-setup-docs',
  [ISSUE.httpClientBump]: 'http-client-bump',
  [ISSUE.ciPackageCache]: 'ci-package-cache',
  [ISSUE.deliveryBanner]: 'delivery-banner',
  [ISSUE.promoRounding]: 'promo-rounding',
  [ISSUE.cartBadgeSync]: 'cart-badge-sync',
  [ISSUE.orderHistoryPagination]: 'order-history-pagination',
  [ISSUE.orderHistoryStatusFilter]: 'order-history-status-filter',
  [ISSUE.promoSavingsSummary]: 'promo-savings-summary',
  [ISSUE.naturalLanguageSearch]: 'natural-language-search',
  [ISSUE.checkoutScreenReader]: 'checkout-screen-reader',
  [ISSUE.expiredPromoMessage]: 'expired-promo-message',
  [ISSUE.savedDeliveryAddress]: 'saved-delivery-address',
  [ISSUE.oneClickReorder]: 'one-click-reorder',
  [ISSUE.legacyDateHelpers]: 'legacy-date-helpers',
} as const satisfies Readonly<Record<number, string>>;

export const RUN = {
  statusFilterImplementer: 'run_7f3a2c',
  promoSavingsAsk: 'run_5d0911',
  promoSavingsFirst: 'run_2e6b40',
  promoSavingsSecond: 'run_91c7d8',
  promoSavingsThird: 'run_c04f13',
  promoSavingsAuthor: 'run_0d8e5b',
  statusFilterAuthor: 'run_c3f470',
  searchAuthor: 'run_6f18b2',
  searchFirst: 'run_b83e55',
  searchReviewOne: 'run_14ad92',
  searchSecond: 'run_e5207a',
  searchReviewTwo: 'run_a9d3c6',
  checkoutAuthor: 'run_2b5f87',
  checkoutFirst: 'run_38f0ed',
  checkoutSecond: 'run_d2a591',
  checkoutReview: 'run_70be4c',
  expiredPromoAuthor: 'run_85d4e9',
  expiredPromoImplementer: 'run_4c9e07',
  expiredPromoReview: 'run_f1b63a',
  savedAddressAuthor: 'run_c7e419',
  savedAddressImplementer: 'run_0a7f3d',
  reorderAuthor: 'run_91ab36',
  reorderStopped: 'run_62d8f4',
  dateHelpersImplementer: 'run_3b5a90',
  dateHelpersReview: 'run_d84c17',
  challengeOrderHistory: 'run_91b2e0',
  challengeDeliveryTracking: 'run_e0a8d3',
  challengeWishlistSharing: 'run_43c6f8',
  challengeLoyaltyPoints: 'run_b5f209',
  challengeReturnsLabels: 'run_1c7d84',
  auditDoubleSubmit: 'run_f90b42',
  auditFooterLinks: 'run_e7d4a1',
  auditPromoBannerCopy: 'run_7a35c9',
  auditHttpClientBump: 'run_d6188e',
  releaseOneSeven: 'run_2a9e60',
  releaseOneEight: 'run_c58d13',
  releaseOneEightOne: 'run_08be7f',
  releaseOneEightTwo: 'run_a73c25',
  localSetupDocsImplementer: 'run_a1c4e2',
  localSetupDocsReview: 'run_5be830',
  httpClientBumpImplementer: 'run_97d03b',
  httpClientBumpReview: 'run_dc4a17',
  ciPackageCacheImplementer: 'run_2f68a5',
  ciPackageCacheReview: 'run_81c0e9',
  deliveryBannerImplementer: 'run_e47b19',
  deliveryBannerReview: 'run_3d90fa',
  promoRoundingImplementer: 'run_5a0c8d',
  promoRoundingReview: 'run_b2e764',
  cartBadgeImplementer: 'run_bd3e76',
  cartBadgeReview: 'run_69f1a0',
  paginationAuthor: 'run_d09c53',
  paginationImplementer: 'run_08f2c4',
  paginationCorrection: 'run_6e2b95',
  paginationReview: 'run_f3c8b5',
  weeklyDigest: 'run_96e1d0',
} as const;

export function issueBranch(issueNumber: number): string {
  const slug = (BRANCH_SLUG as Readonly<Record<number, string>>)[issueNumber];
  if (slug === undefined) throw new Error(`the storefront issue ${issueNumber} has no branch`);
  return branchOf(issueNumber, slug);
}
