import type { StoryFile } from '../story-types.ts';

export const TAX_ROUNDING_CHECK: StoryFile = {
  path: 'test/acceptance/tax-rounding.test.js',
  content: `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { balanceCents, createInvoice, isSettled, totalCents, vatCents } from '../../src/invoices.js';

function invoiceOf(vatPercent, unitPricesCents) {
  return createInvoice({
    number: 'INV-5001',
    customer: 'Quill & Co',
    vatPercent,
    lines: unitPricesCents.map((unitPriceCents, index) => ({
      description: \`Item \${index + 1}\`,
      quantity: 1,
      unitPriceCents,
    })),
  });
}

test('criterion 1: VAT is computed once on the subtotal', () => {
  const invoice = invoiceOf(20, [1999, 1999, 1999]);
  assert.equal(vatCents(invoice), 1199);
  assert.equal(totalCents(invoice), 7196);
});

test('criterion 2: the VAT is rounded half up to the cent', () => {
  assert.equal(vatCents(invoiceOf(5, [505, 505])), 51);
});

test('criterion 3: a payment of the total settles the invoice', () => {
  const invoice = invoiceOf(20, [1999, 1999, 1999]);
  const paid = { ...invoice, payments: [{ amountCents: 7196, method: 'transfer', reference: 'wire-41' }] };
  assert.equal(balanceCents(paid), 0);
  assert.equal(isSettled(paid), true);
});
`,
};

export const INVOICES_WITH_ONE_VAT_ROUNDING: StoryFile = {
  path: 'src/invoices.js',
  content: `import { percentOf } from './money.js';

export class InvalidInvoiceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidInvoiceError';
  }
}

export function createInvoice({ number, customer, vatPercent, lines }) {
  if (lines.length === 0) throw new InvalidInvoiceError(\`invoice \${number} has no line\`);
  return { number, customer, vatPercent, lines, payments: [] };
}

export function lineTotalCents(line) {
  return line.unitPriceCents * line.quantity;
}

export function subtotalCents(invoice) {
  return invoice.lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
}

export function vatCents(invoice) {
  return percentOf(subtotalCents(invoice), invoice.vatPercent);
}

export function totalCents(invoice) {
  return subtotalCents(invoice) + vatCents(invoice);
}

export function paidCents(invoice) {
  return invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
}

export function balanceCents(invoice) {
  return totalCents(invoice) - paidCents(invoice);
}

export function isSettled(invoice) {
  return balanceCents(invoice) <= 0;
}
`,
};
