import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addItem, emptyCart, itemCount, removeItem, subtotalCents, UnknownProductError } from '../src/cart.js';

test('adds products and sums their prices', () => {
  const cart = addItem(addItem(emptyCart(), 'MUG-01', 2), 'BAG-04', 1);
  assert.equal(subtotalCents(cart), 2 * 1800 + 1500);
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
