import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  balanceCents,
  createInvoice,
  InvalidInvoiceError,
  isSettled,
  subtotalCents,
  totalCents,
  vatCents,
} from '../src/invoices.js';

function studioInvoice(payments = []) {
  return {
    ...createInvoice({
      number: 'INV-2001',
      customer: 'Fernhill Studio',
      vatPercent: 20,
      lines: [
        { description: 'Design hours', quantity: 4, unitPriceCents: 7500 },
        { description: 'Hosting', quantity: 1, unitPriceCents: 2000 },
      ],
    }),
    payments,
  };
}

test('sums the lines of an invoice', () => {
  assert.equal(subtotalCents(studioInvoice()), 4 * 7500 + 2000);
});

test('adds VAT to the subtotal', () => {
  assert.equal(vatCents(studioInvoice()), 6400);
  assert.equal(totalCents(studioInvoice()), 38400);
});

test('refuses an invoice without lines', () => {
  assert.throws(
    () => createInvoice({ number: 'INV-2002', customer: 'Fernhill Studio', vatPercent: 20, lines: [] }),
    InvalidInvoiceError,
  );
});

test('subtracts payments from the balance and settles at zero', () => {
  const partlyPaid = studioInvoice([{ amountCents: 10000, method: 'transfer', reference: 'wire-17' }]);
  assert.equal(balanceCents(partlyPaid), 28400);
  assert.equal(isSettled(partlyPaid), false);
  const settled = studioInvoice([{ amountCents: 38400, method: 'transfer', reference: 'wire-18' }]);
  assert.equal(balanceCents(settled), 0);
  assert.equal(isSettled(settled), true);
});
