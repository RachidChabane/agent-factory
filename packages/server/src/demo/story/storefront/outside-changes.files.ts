import type { StoryFile } from '../story-types.ts';

export const CATALOG_WITH_NEW_TOTE_PRICE: StoryFile = {
  path: 'src/catalog.js',
  content: String.raw`export const CATALOG = Object.freeze([
  Object.freeze({ sku: 'MUG-01', name: 'Enamel mug', priceCents: 1800 }),
  Object.freeze({ sku: 'TEE-02', name: 'Organic cotton tee', priceCents: 2600 }),
  Object.freeze({ sku: 'CAP-03', name: 'Canvas cap', priceCents: 2200 }),
  Object.freeze({ sku: 'BAG-04', name: 'Tote bag', priceCents: 1600 }),
]);

export function findProduct(sku) {
  return CATALOG.find((product) => product.sku === sku) ?? null;
}
`,
};

export const CART_TEST_WITH_NEW_TOTE_PRICE: StoryFile = {
  path: 'test/cart.test.js',
  content: String.raw`import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addItem, emptyCart, itemCount, removeItem, subtotalCents, UnknownProductError } from '../src/cart.js';

test('adds products and sums their prices', () => {
  const cart = addItem(addItem(emptyCart(), 'MUG-01', 2), 'BAG-04', 1);
  assert.equal(subtotalCents(cart), 2 * 1800 + 1600);
  assert.equal(itemCount(cart), 3);
});

test('merges a product added twice into one line', () => {
  const cart = addItem(addItem(emptyCart(), 'CAP-03', 1), 'CAP-03', 2);
  assert.deepEqual(cart.lines, [{ sku: 'CAP-03', quantity: 3 }]);
});

test('removes a product', () => {
  const cart = removeItem(addItem(emptyCart(), 'TEE-02', 1), 'TEE-02');
  assert.equal(subtotalCents(cart), 0);
});

test('refuses an unknown product', () => {
  assert.throws(() => addItem(emptyCart(), 'NOPE-99', 1), UnknownProductError);
});
`,
};

export const PACKAGE_FOR_NODE_24: StoryFile = {
  path: 'package.json',
  content: String.raw`{
  "name": "storefront",
  "version": "1.4.0",
  "private": true,
  "description": "A small online shop: product catalogue, cart and checkout summary.",
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test",
    "lint": "node scripts/lint.js"
  }
}
`,
};
