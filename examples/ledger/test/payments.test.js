import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInvoice, balanceCents } from '../src/invoices.js';
import { chargeCard, InvalidPaymentError, recordPayment } from '../src/payments.js';

const CARD_TOKEN = 'card-token-8841';

function quillInvoice() {
  return createInvoice({
    number: 'INV-2101',
    customer: 'Quill & Co',
    vatPercent: 0,
    lines: [{ description: 'Setup', quantity: 1, unitPriceCents: 25000 }],
  });
}

const approvingGateway = {
  charge: async ({ reference }) => ({ status: 'approved', reference: `charge-${reference}`, reason: null }),
};

const decliningGateway = {
  charge: async () => ({ status: 'declined', reference: null, reason: 'insufficient_funds' }),
};

test('records a payment against the balance', () => {
  const paid = recordPayment(quillInvoice(), { amountCents: 10000, method: 'transfer', reference: 'wire-31' });
  assert.equal(balanceCents(paid), 15000);
  assert.deepEqual(paid.payments, [{ amountCents: 10000, method: 'transfer', reference: 'wire-31' }]);
});

test('refuses a payment above the balance or below one cent', () => {
  assert.throws(() => recordPayment(quillInvoice(), { amountCents: 25001, method: 'transfer', reference: 'wire-32' }), InvalidPaymentError);
  assert.throws(() => recordPayment(quillInvoice(), { amountCents: 0, method: 'transfer', reference: 'wire-33' }), InvalidPaymentError);
});

test('charges the whole balance to a card and records the approved payment', async () => {
  const { invoice, charge } = await chargeCard(approvingGateway, quillInvoice(), CARD_TOKEN);
  assert.equal(charge.status, 'approved');
  assert.equal(balanceCents(invoice), 0);
  assert.equal(invoice.payments[0].reference, 'charge-INV-2101');
});

test('leaves the invoice unpaid when the card is declined', async () => {
  const { invoice, charge } = await chargeCard(decliningGateway, quillInvoice(), CARD_TOKEN);
  assert.equal(charge.status, 'declined');
  assert.equal(charge.reason, 'insufficient_funds');
  assert.deepEqual(invoice.payments, []);
});
