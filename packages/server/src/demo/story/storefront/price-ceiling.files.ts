import type { StoryFile } from '../story-types.ts';

export const PRICE_CEILING_CHECK: StoryFile = {
  path: 'test/acceptance/price-ceiling.test.js',
  content: `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG } from '../../src/catalog.js';

const priceCeiling = await import('../../src/price-ceiling.js').catch(() => ({}));

function skusOf(products) {
  return products.map((product) => product.sku);
}

function requireFilter() {
  assert.equal(typeof priceCeiling.productsUpTo, 'function', 'src/price-ceiling.js exports productsUpTo');
  return priceCeiling.productsUpTo;
}

test('criterion 1: a ceiling of $25 lists the mug, the cap and the tote bag in catalogue order', () => {
  assert.deepEqual(skusOf(requireFilter()(2500)), ['MUG-01', 'CAP-03', 'BAG-04']);
});

test('criterion 2: a product priced exactly at the ceiling is included', () => {
  const productsUpTo = requireFilter();
  for (const product of CATALOG) {
    assert.ok(skusOf(productsUpTo(product.priceCents)).includes(product.sku), \`\${product.sku} at \${product.priceCents} cents\`);
  }
});

test('criterion 3: a ceiling below the cheapest price lists nothing', () => {
  const cheapest = Math.min(...CATALOG.map((product) => product.priceCents));
  assert.deepEqual(requireFilter()(cheapest - 1), []);
});

test('criterion 4: a ceiling that is negative or not a whole number of cents is refused', () => {
  const productsUpTo = requireFilter();
  for (const ceiling of [-1, 2499.5, Number.NaN]) {
    assert.throws(() => productsUpTo(ceiling), RangeError, \`\${ceiling} is refused\`);
  }
});
`,
};

export const PRICE_CEILING_MODULE: StoryFile = {
  path: 'src/price-ceiling.js',
  content: `import { CATALOG } from './catalog.js';

const LOWEST_CEILING_CENTS = 0;

export function productsUpTo(maxCents) {
  if (!Number.isInteger(maxCents) || maxCents < LOWEST_CEILING_CENTS) {
    throw new RangeError(\`a price ceiling is a whole number of cents, \${LOWEST_CEILING_CENTS} or more, got \${maxCents}\`);
  }
  return CATALOG.filter((product) => product.priceCents <= maxCents);
}
`,
};
