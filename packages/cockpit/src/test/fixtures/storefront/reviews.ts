import type { ReviewFindingView } from '../../../contract/index.ts';
import { DATE_HELPERS_PATH, SEARCH_FILTERS_COMMENT_LINE, SEARCH_FILTERS_PATH, WEEK_NUMBER_RETURN_LINE } from './diffs-open.ts';
import { RUN } from './ids.ts';

/** What each reviewer run reported, with the state its findings ended in on the pull request. */
export const REVIEW_FINDINGS: Readonly<Record<string, readonly ReviewFindingView[]>> = {
  [RUN.localSetupDocsReview]: [],
  [RUN.httpClientBumpReview]: [
    {
      severity: 'non-blocking',
      category: 'repository-rules',
      file: 'package.json',
      line: 31,
      summary: 'The bump leaves the engines field at the previous Node version; the repository rules ask for it to follow the CI image.',
      resolved: true,
    },
  ],
  [RUN.ciPackageCacheReview]: [
    {
      severity: 'non-blocking',
      category: 'criteria-coverage',
      file: '.github/workflows/ci.yml',
      line: 24,
      summary: 'Criterion 3 asks for the cache key to include the lockfile hash; the key only names the operating system.',
      resolved: true,
    },
  ],
  [RUN.deliveryBannerReview]: [
    {
      severity: 'blocking',
      category: 'criteria-coverage',
      file: 'web/src/product/DeliveryBanner.tsx',
      line: 17,
      summary: 'Criterion 3 asks for the banner to disappear when no estimate is available; it renders an empty box instead.',
      resolved: true,
    },
  ],
  [RUN.promoRoundingReview]: [
    {
      severity: 'blocking',
      category: 'correctness',
      file: 'api/src/promo/discount.ts',
      line: 22,
      summary: 'The discount is computed on floating point euros and rounded afterwards; 10% of 19.95 gives 1.9950000000000001 and rounds the wrong way. Compute on integer cents.',
      resolved: true,
    },
  ],
  [RUN.cartBadgeReview]: [],
  [RUN.paginationReview]: [
    {
      severity: 'non-blocking',
      category: 'security',
      file: 'api/src/routes/orders/index.get.ts',
      line: 18,
      summary: 'The error for a malformed cursor repeats the cursor in its message; return a fixed message instead.',
      resolved: true,
    },
  ],
  [RUN.searchReviewOne]: [
    {
      severity: 'blocking',
      category: 'correctness',
      file: 'web/src/search/price-bound.ts',
      line: 9,
      summary: 'The comparison word is ignored: "under 60" is read as a minimum of 60 instead of a maximum.',
      resolved: true,
    },
    {
      severity: 'non-blocking',
      category: 'scope-creep',
      file: 'web/src/search/analytics.ts',
      line: null,
      summary: 'The change adds query analytics events that no criterion asks for.',
      resolved: true,
    },
  ],
  [RUN.searchReviewTwo]: [
    {
      severity: 'non-blocking',
      category: 'repository-rules',
      file: SEARCH_FILTERS_PATH,
      line: SEARCH_FILTERS_COMMENT_LINE,
      summary: 'A code comment explains the unit conversion; the repository rules ask for a named constant instead of a comment.',
      resolved: false,
    },
  ],
  [RUN.checkoutReview]: [
    {
      severity: 'blocking',
      category: 'criteria-coverage',
      file: 'web/src/checkout/AddressForm.tsx',
      line: 58,
      summary: 'Criterion 3 asks for the errors to be announced when the form is submitted; only the errors of single fields are announced.',
      resolved: true,
    },
    {
      severity: 'blocking',
      category: 'check-integrity',
      file: 'e2e/checkout/keyboard-journey.spec.ts',
      line: null,
      summary: 'The frozen journey was reformatted by the formatter hook and no longer matches its frozen hash.',
      resolved: true,
    },
  ],
  [RUN.expiredPromoReview]: [],
  [RUN.dateHelpersReview]: [
    {
      severity: 'blocking',
      category: 'correctness',
      file: DATE_HELPERS_PATH,
      line: WEEK_NUMBER_RETURN_LINE,
      summary: 'Week numbers differ from the previous helper for the last days of December, which breaks criterion 2 (no change of behaviour).',
      resolved: false,
    },
  ],
};
