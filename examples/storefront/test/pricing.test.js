import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCents } from '../src/pricing.js';

test('formats cents as dollars', () => {
  assert.equal(formatCents(0), '$0.00');
  assert.equal(formatCents(1805), '$18.05');
  assert.equal(formatCents(-250), '-$2.50');
});
