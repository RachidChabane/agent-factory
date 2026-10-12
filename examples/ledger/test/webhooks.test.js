import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInvoice, balanceCents } from '../src/invoices.js';
import { createInvoiceStore } from '../src/store.js';
import { handleWebhook, InvalidWebhookError, parseWebhook } from '../src/webhooks.js';

const INVOICE_NUMBER = 'INV-3001';

function storeWithInvoice() {
  return createInvoiceStore([
    createInvoice({
      number: INVOICE_NUMBER,
      customer: 'Harbor Lane Bakery',
      vatPercent: 0,
      lines: [{ description: 'Annual plan', quantity: 1, unitPriceCents: 50000 }],
    }),
  ]);
}

function delivery(type, amountCents, invoiceNumber = INVOICE_NUMBER) {
  return JSON.stringify({ id: 'evt-7001', type, data: { invoiceNumber, amountCents, reference: 'charge-9001' } });
}

function post(rawBody) {
  return { headers: {}, rawBody };
}

test('reads the fields of a payment event', () => {
  assert.deepEqual(parseWebhook(delivery('payment.succeeded', 50000)), {
    id: 'evt-7001',
    type: 'payment.succeeded',
    invoiceNumber: INVOICE_NUMBER,
    amountCents: 50000,
    reference: 'charge-9001',
  });
});

test('refuses a body that is not JSON or names an unknown event', () => {
  assert.throws(() => parseWebhook('not json'), InvalidWebhookError);
  assert.throws(() => parseWebhook(delivery('invoice.deleted', 50000)), InvalidWebhookError);
});

test('records the payment of a succeeded event', () => {
  const store = storeWithInvoice();
  const answer = handleWebhook(post(delivery('payment.succeeded', 50000)), store);
  assert.equal(answer.status, 200);
  assert.equal(balanceCents(store.get(INVOICE_NUMBER)), 0);
});

test('acknowledges a failed payment without recording anything', () => {
  const store = storeWithInvoice();
  const answer = handleWebhook(post(delivery('payment.failed', 50000)), store);
  assert.equal(answer.status, 200);
  assert.equal(balanceCents(store.get(INVOICE_NUMBER)), 50000);
});

test('answers 404 for an unknown invoice and 409 for a payment above the balance', () => {
  const store = storeWithInvoice();
  assert.equal(handleWebhook(post(delivery('payment.succeeded', 50000, 'INV-9999')), store).status, 404);
  assert.equal(handleWebhook(post(delivery('payment.succeeded', 50001)), store).status, 409);
});

test('answers 400 for a body it cannot read', () => {
  assert.equal(handleWebhook(post('{'), storeWithInvoice()).status, 400);
});
