import type { StoryFile } from '../story-types.ts';

export const DISCOUNT_ROUNDING_CHECK: StoryFile = {
  path: 'test/acceptance/discount-rounding.test.js',
  content: String.raw`import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as pricing from '../../src/pricing.js';

const THREE_LINES = [1999, 1999, 1999];

function discountOf(lineTotalsCents, percentOff) {
  assert.equal(typeof pricing.percentageDiscount, 'function', 'src/pricing.js exports percentageDiscount');
  return pricing.percentageDiscount(lineTotalsCents, percentOff);
}

function roundedLineByLine(lineTotalsCents, percentOff) {
  return lineTotalsCents.reduce((sum, cents) => sum + Math.round((cents * percentOff) / 100), 0);
}

test('criterion 1: the percentage is taken once from the sum of the line totals', () => {
  assert.equal(roundedLineByLine(THREE_LINES, 20), 1200, 'rounding every line first gives 1200 cents');
  assert.equal(discountOf(THREE_LINES, 20).discountCents, 1199);
});

test('criterion 2: the discount is rounded half up to the cent', () => {
  assert.equal(roundedLineByLine([505, 505], 5), 50, 'rounding every line first gives 50 cents');
  assert.equal(discountOf([505, 505], 5).discountCents, 51);
});

test('criterion 3: the discounted total is the sum of the line totals minus the discount', () => {
  assert.equal(discountOf(THREE_LINES, 20).discountedCents, 4798);
});

test('criterion 4: no percentage takes nothing off and the whole percentage takes everything off', () => {
  assert.deepEqual(
    [discountOf(THREE_LINES, 0).discountCents, discountOf(THREE_LINES, 0).discountedCents],
    [0, 5997],
  );
  assert.deepEqual(
    [discountOf(THREE_LINES, 100).discountCents, discountOf(THREE_LINES, 100).discountedCents],
    [5997, 0],
  );
});

test('criterion 5: a percentage below 0 or above 100 is refused', () => {
  discountOf(THREE_LINES, 20);
  assert.throws(() => pricing.percentageDiscount(THREE_LINES, -1), RangeError);
  assert.throws(() => pricing.percentageDiscount(THREE_LINES, 101), RangeError);
});
`,
};

export const PRICING_WITH_DISCOUNTS: StoryFile = {
  path: 'src/pricing.js',
  content: `const CENTS_PER_UNIT = 100;
const PERCENT_DIVISOR = 100;
const MIN_PERCENT = 0;
const MAX_PERCENT = 100;
const NO_CENTS = 0;
const ONE_CENT = 1;

export function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const units = Math.floor(absolute / CENTS_PER_UNIT);
  const rest = String(absolute % CENTS_PER_UNIT).padStart(2, '0');
  return \`\${sign}$\${units}.\${rest}\`;
}

function sumOf(amounts) {
  return amounts.reduce((sum, amount) => sum + amount, NO_CENTS);
}

function byLargestRemainder(left, right) {
  return right.remainder - left.remainder || left.index - right.index;
}

function shareOut(discountCents, lineTotalsCents, subtotal) {
  if (subtotal === NO_CENTS) return lineTotalsCents.map(() => NO_CENTS);
  const shares = lineTotalsCents.map((lineTotal, index) => ({
    index,
    cents: Math.floor((discountCents * lineTotal) / subtotal),
    remainder: (discountCents * lineTotal) % subtotal,
  }));
  const leftover = discountCents - sumOf(shares.map((share) => share.cents));
  const topUps = new Set([...shares].sort(byLargestRemainder).slice(0, leftover).map((share) => share.index));
  return shares.map((share) => share.cents + (topUps.has(share.index) ? ONE_CENT : NO_CENTS));
}

export function percentageDiscount(lineTotalsCents, percentOff) {
  if (!(percentOff >= MIN_PERCENT && percentOff <= MAX_PERCENT)) {
    throw new RangeError(\`a percentage must be between \${MIN_PERCENT} and \${MAX_PERCENT}, got \${percentOff}\`);
  }
  const subtotal = sumOf(lineTotalsCents);
  const discountCents = Math.round((subtotal * percentOff) / PERCENT_DIVISOR);
  return {
    discountCents,
    discountedCents: subtotal - discountCents,
    lineDiscountsCents: shareOut(discountCents, lineTotalsCents, subtotal),
  };
}
`,
};

export const PRICING_NOTES: StoryFile = {
  path: 'docs/pricing.md',
  content: String.raw`# Prices

Prices are stored in cents and shown with two decimals. The checkout summary adds line totals before formatting them.

## Percentage discounts

A percentage discount is taken once, from the sum of the line totals, and rounded half up to the cent. Rounding the discount of every line first would let the result drift from the amount the payment provider charges by up to a cent per line.

Each line carries a share of the discount, and the shares add up to it exactly: the cents that do not divide evenly go to the lines with the largest remainders, the earlier line first.
`,
};
