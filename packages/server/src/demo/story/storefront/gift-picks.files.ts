import type { StoryFile } from '../story-types.ts';

export const GIFT_PICKS_CHECK: StoryFile = {
  path: 'test/acceptance/gift-picks.test.js',
  content: `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG, findProduct } from '../../src/catalog.js';

const giftPicksModule = await import('../../src/gift-picks.js').catch(() => ({}));

function skusOf(products) {
  return products.map((product) => product.sku);
}

function giftPicks() {
  assert.equal(typeof giftPicksModule.giftPicks, 'function', 'src/gift-picks.js exports giftPicks');
  return giftPicksModule.giftPicks();
}

test('criterion 1: the gift picks come in catalogue order', () => {
  const picks = skusOf(giftPicks());
  assert.ok(picks.length > 0, 'the shop has gift picks');
  assert.deepEqual(picks, skusOf(CATALOG).filter((sku) => picks.includes(sku)));
});

test('criterion 2: the mug, the cap and the tote bag are gift picks and the tee is not', () => {
  assert.deepEqual(skusOf(giftPicks()), ['MUG-01', 'CAP-03', 'BAG-04']);
});

test('criterion 3: every gift pick is a product of the catalogue', () => {
  for (const pick of giftPicks()) {
    assert.deepEqual(pick, findProduct(pick.sku), \`\${pick.sku} is sold by the shop\`);
  }
});

test('criterion 4: every call answers with a new list', () => {
  const first = giftPicks();
  const second = giftPicks();
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
});
`,
};

export const GIFT_PICKS_MODULE: StoryFile = {
  path: 'src/gift-picks.js',
  content: String.raw`import { CATALOG } from './catalog.js';

const GIFT_PICK_SKUS = Object.freeze(['MUG-01', 'CAP-03', 'BAG-04']);

export function giftPicks() {
  return CATALOG.filter((product) => GIFT_PICK_SKUS.includes(product.sku));
}
`,
};
