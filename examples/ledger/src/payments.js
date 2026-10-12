import { balanceCents, isSettled } from './invoices.js';

export const CHARGE_APPROVED = 'approved';
export const CHARGE_DECLINED = 'declined';
export const METHOD_CARD = 'card';

export class InvalidPaymentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidPaymentError';
  }
}

export function recordPayment(invoice, { amountCents, method, reference }) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new InvalidPaymentError(`a payment must be a positive whole number of cents, got ${amountCents}`);
  }
  if (amountCents > balanceCents(invoice)) {
    throw new InvalidPaymentError(`a payment of ${amountCents} cents exceeds the balance of invoice ${invoice.number}`);
  }
  return { ...invoice, payments: [...invoice.payments, { amountCents, method, reference }] };
}

export async function chargeCard(gateway, invoice, cardToken) {
  if (isSettled(invoice)) throw new InvalidPaymentError(`invoice ${invoice.number} has nothing left to pay`);
  const amountCents = balanceCents(invoice);
  const charge = await gateway.charge({ amountCents, token: cardToken, reference: invoice.number });
  if (charge.status !== CHARGE_APPROVED) return { invoice, charge };
  return { invoice: recordPayment(invoice, { amountCents, method: METHOD_CARD, reference: charge.reference }), charge };
}
