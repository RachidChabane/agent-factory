import { PROMO_SAVINGS_ASSERTION_LINE } from './diffs-wip.ts';
import { ISSUE } from './ids.ts';
import { CHECK_PATH } from './paths.ts';

export const PROMO_SAVINGS_FINDING = `The frozen journey ${CHECK_PATH.promoSavings} expects the saving as "-$4.20" on the French shop (line ${PROMO_SAVINGS_ASSERTION_LINE}), while the spec of #${ISSUE.promoSavingsSummary} asks for the shop currency, which is euros there. No implementation satisfies both.`;

export const PROMO_SAVINGS_QUESTION = 'Should the check be rewritten to expect "-4,20 €" on the French shop, or should the spec keep dollars?';

export const PROMO_SAVINGS_OPTIONS: readonly string[] = [
  'Rewrite the check to expect "-4,20 €"',
  'Keep the dollars and change the spec',
  'Abandon this issue',
];
