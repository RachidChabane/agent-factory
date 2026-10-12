import { nodeTestChecks, paragraphs } from '../story-helpers.ts';
import type { StoryIssue } from '../story-types.ts';
import { DISCOUNT_ROUNDING_CHECK, PRICING_NOTES, PRICING_WITH_DISCOUNTS } from './discount-rounding.files.ts';

export const DISCOUNT_ROUNDING: StoryIssue = {
  key: 'discount-rounding',
  spec: {
    title: 'Round percentage discounts once on the subtotal',
    type: 'fix',
    need: paragraphs(
      "Percentage discount codes are about to reach the checkout summary, and how their amount is rounded decides whether the summary matches the payment provider's charge to the cent. The provider takes the percentage once, from the sum of the line totals, and rounds it half up. Rounding the discount of every line first and adding the results can end up to a cent per line away from that amount, so a customer sees a total that does not match their receipt.",
      'The pricing module has no rule for percentage discounts yet. It needs one function that takes the line totals in cents and a percentage, and returns the discount the provider would charge together with the discounted total.',
    ),
    acceptanceCriteria: [
      '`percentageDiscount(lineTotalsCents, percentOff)` in `src/pricing.js` returns the `discountCents` of the whole cart, taking the percentage once from the sum of the line totals: three lines of $19.99 with 20% off give 1199 cents, not the 1200 cents that rounding every line first gives.',
      'The discount is rounded half up to the cent: two lines of $5.05 with 5% off give 51 cents, because 5% of $10.10 is 50.5 cents.',
      'The result also carries `discountedCents`, the sum of the line totals minus the discount: 4798 cents for the first example.',
      '0% takes nothing off and 100% takes everything off.',
      'A percentage below 0 or above 100 is refused with a `RangeError`.',
    ],
    outOfScope: [
      'Fixed-amount discount codes.',
      'Showing the discount on the checkout summary.',
      'Limits on how many times a code can be used.',
    ],
    expectedProof:
      'Unit tests that call `percentageDiscount` with line totals chosen so that rounding each line first gives a different answer from rounding the sum. They fail on the current code, which has no rounding rule for discounts.',
  },
  dependsOn: [],
  validate: true,
  checks: nodeTestChecks({
    says: [
      'Reading the specification: five criteria on one function that does not exist yet.',
      'Each test computes the line-by-line figure first, so the difference the specification describes is visible, then asserts on the function itself.',
      'Writing test/acceptance/discount-rounding.test.js and the manifest, then running the command once.',
    ],
    files: [DISCOUNT_ROUNDING_CHECK],
    descriptions: [
      'The percentage is taken once from the sum of the line totals',
      'The discount is rounded half up to the cent',
      'The discounted total is the sum minus the discount',
      '0% and 100% are the two ends of the range',
      'A percentage outside 0 to 100 is refused',
    ],
    final:
      'Wrote test/acceptance/discount-rounding.test.js with one test per criterion. On the current code all five tests fail on an assertion: src/pricing.js exports no percentageDiscount.',
  }),
  decision: paragraphs(
    'Before I write the rule I need one decision. The specification asks for the discount to be rounded once, but it does not say what the percentage is taken from: the line totals or the subtotal. I checked src/cart.js:27, which totals a cart from its lines, and docs/pricing.md, which says the checkout summary adds line totals before formatting them, so the code fits both readings.',
    'The options I see: (a) the percentage applies to the subtotal and the discount is one amount, rounded once; (b) the percentage applies to each line total, which keeps an amount per line for refunds, and the line amounts are adjusted so that they add up to the same rounded total. The total discount is identical either way; what differs is whether the checkout keeps an amount per line.',
    'Which one should the checkout use?',
  ),
  attempts: [
    {
      says: [
        'Reading the answer from the operator, the specification and the five frozen checks.',
        'The answer settles what the percentage is taken from. The discount is computed once, from the sum of the line totals, and rounded half up; each line gets a share of it, so the amounts per line add up to the discount exactly.',
        'Adding percentageDiscount to src/pricing.js, leaving formatCents as it is, and recording the rule in docs/pricing.md.',
      ],
      writes: [PRICING_WITH_DISCOUNTS, PRICING_NOTES],
      deletes: [],
      final:
        'src/pricing.js gains percentageDiscount(lineTotalsCents, percentOff), which returns discountCents, discountedCents and lineDiscountsCents; formatCents is unchanged. docs/pricing.md records the rule: one rounding on the sum of the line totals, the leftover cents shared by largest remainder. For the reviewer: lineDiscountsCents is not asked for by a criterion; it keeps an amount per line available whichever way the summary shows the discount.',
    },
  ],
  review: {
    says: 'The five criteria are met, the frozen checks are untouched and formatCents is unchanged. One note on scope.',
    findings: [
      {
        severity: 'non-blocking',
        category: 'scope-creep',
        file: 'src/pricing.js',
        line: 45,
        summary:
          'percentageDiscount also returns lineDiscountsCents, which no criterion asks for. It is small and documented in docs/pricing.md, so it can stay, but nothing uses it yet.',
      },
    ],
  },
};
