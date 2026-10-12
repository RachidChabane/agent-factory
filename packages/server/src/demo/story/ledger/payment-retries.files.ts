import type { StoryFile } from '../story-types.ts';

export const PAYMENT_RETRIES_CHECK: StoryFile = {
  path: 'test/acceptance/payment-retries.test.js',
  content: `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInvoice } from '../../src/invoices.js';
import * as payments from '../../src/payments.js';

const CARD_TOKEN = 'card-token-5512';
const ALWAYS = Number.POSITIVE_INFINITY;

function fernhillInvoice() {
  return createInvoice({
    number: 'INV-6001',
    customer: 'Fernhill Studio',
    vatPercent: 0,
    lines: [{ description: 'Setup', quantity: 1, unitPriceCents: 25000 }],
  });
}

function gatewayDecliningFirst(declines) {
  const calls = [];
  return {
    calls,
    async charge(request) {
      calls.push(request);
      if (calls.length <= declines) return { status: 'declined', reference: null, reason: 'insufficient_funds' };
      return { status: 'approved', reference: \`charge-\${calls.length}\`, reason: null };
    },
  };
}

function recordedWaits() {
  const delays = [];
  return {
    delays,
    async wait(milliseconds) {
      delays.push(milliseconds);
    },
  };
}

function retry(gateway, waits) {
  assert.equal(typeof payments.chargeCardWithRetries, 'function', 'src/payments.js exports chargeCardWithRetries');
  return payments.chargeCardWithRetries(gateway, fernhillInvoice(), CARD_TOKEN, { wait: waits.wait });
}

test('criterion 1: a declined charge is retried until the gateway approves it', async () => {
  const gateway = gatewayDecliningFirst(2);
  const { invoice, charge } = await retry(gateway, recordedWaits());
  assert.equal(charge.status, 'approved');
  assert.equal(gateway.calls.length, 3);
  assert.equal(invoice.payments.length, 1);
});

test('criterion 2: the retries stop after the third', async () => {
  const gateway = gatewayDecliningFirst(ALWAYS);
  const { invoice, charge } = await retry(gateway, recordedWaits());
  assert.equal(gateway.calls.length, 4);
  assert.equal(charge.status, 'declined');
  assert.deepEqual(invoice.payments, []);
});

test('criterion 3: the delay before each retry is longer than the one before', async () => {
  const waits = recordedWaits();
  await retry(gatewayDecliningFirst(ALWAYS), waits);
  assert.equal(waits.delays.length, 3);
  assert.ok(waits.delays[0] > 0, 'the first retry waits');
  assert.ok(waits.delays[1] > waits.delays[0], 'the second delay is longer than the first');
  assert.ok(waits.delays[2] > waits.delays[1], 'the third delay is longer than the second');
});

test('criterion 4: every attempt is recorded on the invoice, in order, with its outcome', async () => {
  const { invoice } = await retry(gatewayDecliningFirst(2), recordedWaits());
  assert.deepEqual(
    invoice.chargeAttempts.map((attempt) => [attempt.attempt, attempt.outcome]),
    [
      [1, 'declined'],
      [2, 'declined'],
      [3, 'approved'],
    ],
  );
});

test('criterion 5: an approved first attempt is charged once and nothing waits', async () => {
  const gateway = gatewayDecliningFirst(0);
  const waits = recordedWaits();
  const { invoice } = await retry(gateway, waits);
  assert.equal(gateway.calls.length, 1);
  assert.deepEqual(waits.delays, []);
  assert.deepEqual(
    invoice.chargeAttempts.map((attempt) => [attempt.attempt, attempt.outcome]),
    [[1, 'approved']],
  );
});
`,
};

export const PAYMENTS_WITH_RETRIES: StoryFile = {
  path: 'src/payments.js',
  content: `import { balanceCents, isSettled } from './invoices.js';

export const CHARGE_APPROVED = 'approved';
export const CHARGE_DECLINED = 'declined';
export const METHOD_CARD = 'card';
export const MAX_RETRIES = 3;

const FIRST_RETRY_DELAY_MS = 1000;
const RETRY_DELAY_GROWTH = 2;

export class InvalidPaymentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidPaymentError';
  }
}

export function recordPayment(invoice, { amountCents, method, reference }) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new InvalidPaymentError(\`a payment must be a positive whole number of cents, got \${amountCents}\`);
  }
  if (amountCents > balanceCents(invoice)) {
    throw new InvalidPaymentError(\`a payment of \${amountCents} cents exceeds the balance of invoice \${invoice.number}\`);
  }
  return { ...invoice, payments: [...invoice.payments, { amountCents, method, reference }] };
}

export async function chargeCard(gateway, invoice, cardToken) {
  if (isSettled(invoice)) throw new InvalidPaymentError(\`invoice \${invoice.number} has nothing left to pay\`);
  const amountCents = balanceCents(invoice);
  const charge = await gateway.charge({ amountCents, token: cardToken, reference: invoice.number });
  if (charge.status !== CHARGE_APPROVED) return { invoice, charge };
  return { invoice: recordPayment(invoice, { amountCents, method: METHOD_CARD, reference: charge.reference }), charge };
}

function withAttempt(invoice, attempt, charge) {
  const attempts = invoice.chargeAttempts ?? [];
  return { ...invoice, chargeAttempts: [...attempts, { attempt, outcome: charge.status, reason: charge.reason }] };
}

export async function chargeCardWithRetries(gateway, invoice, cardToken, { wait }) {
  let current = invoice;
  let delayMs = FIRST_RETRY_DELAY_MS;
  for (let attempt = 1; ; attempt += 1) {
    const { invoice: charged, charge } = await chargeCard(gateway, current, cardToken);
    current = withAttempt(charged, attempt, charge);
    const canRetry = attempt <= MAX_RETRIES;
    if (charge.status !== CHARGE_DECLINED || !canRetry) return { invoice: current, charge };
    await wait(delayMs);
    delayMs *= RETRY_DELAY_GROWTH;
  }
}
`,
};
