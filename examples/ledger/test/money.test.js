import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCents, percentOf } from '../src/money.js';

test('formats cents as dollars', () => {
  assert.equal(formatCents(0), '$0.00');
  assert.equal(formatCents(1805), '$18.05');
  assert.equal(formatCents(-250), '-$2.50');
});

test('takes a percentage of an amount and rounds half up to the cent', () => {
  assert.equal(percentOf(1000, 20), 200);
  assert.equal(percentOf(1999, 20), 400);
  assert.equal(percentOf(505, 5), 25);
  assert.equal(percentOf(1010, 5), 51);
});
