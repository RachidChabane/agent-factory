import { percentOf } from './money.js';

export class InvalidInvoiceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidInvoiceError';
  }
}

export function createInvoice({ number, customer, vatPercent, lines }) {
  if (lines.length === 0) throw new InvalidInvoiceError(`invoice ${number} has no line`);
  return { number, customer, vatPercent, lines, payments: [] };
}

export function lineTotalCents(line) {
  return line.unitPriceCents * line.quantity;
}

export function subtotalCents(invoice) {
  return invoice.lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
}

export function vatCents(invoice) {
  return invoice.lines.reduce((sum, line) => sum + percentOf(lineTotalCents(line), invoice.vatPercent), 0);
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
