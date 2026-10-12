import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addItem, emptyCart } from '../src/cart.js';
import { renderPage } from '../src/render.js';

test('shows the cart summary in the header', () => {
  const page = renderPage(addItem(emptyCart(), 'MUG-01', 2));
  assert.match(page, /<p class="cart-summary">2 items, \$36\.00<\/p>/);
});

test('lists every product of the catalogue', () => {
  assert.equal(renderPage(emptyCart()).match(/<li data-sku=/g)?.length, 4);
});
