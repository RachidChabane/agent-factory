import { InvalidPaymentError, METHOD_CARD, recordPayment } from './payments.js';

const EVENT_PAYMENT_SUCCEEDED = 'payment.succeeded';
const EVENT_PAYMENT_FAILED = 'payment.failed';
const KNOWN_EVENTS = [EVENT_PAYMENT_SUCCEEDED, EVENT_PAYMENT_FAILED];
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

export class InvalidWebhookError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidWebhookError';
  }
}

function requireText(value, field) {
  if (typeof value !== 'string' || value === '') throw new InvalidWebhookError(`${field} must be a non-empty string`);
  return value;
}

export function parseWebhook(rawBody) {
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new InvalidWebhookError('the body is not valid JSON');
  }
  const { id, type, data } = payload ?? {};
  if (!KNOWN_EVENTS.includes(type)) throw new InvalidWebhookError(`unknown event type ${JSON.stringify(type)}`);
  return {
    id: requireText(id, 'id'),
    type,
    invoiceNumber: requireText(data?.invoiceNumber, 'data.invoiceNumber'),
    amountCents: data?.amountCents,
    reference: requireText(data?.reference, 'data.reference'),
  };
}

function reply(status, body) {
  return { status, body };
}

function applyPayment(store, invoice, event) {
  try {
    store.save(recordPayment(invoice, { amountCents: event.amountCents, method: METHOD_CARD, reference: event.reference }));
  } catch (error) {
    if (error instanceof InvalidPaymentError) return reply(HTTP_CONFLICT, { error: error.message });
    throw error;
  }
  return reply(HTTP_OK, { received: event.id });
}

export function handleWebhook(request, store) {
  let event;
  try {
    event = parseWebhook(request.rawBody);
  } catch (error) {
    if (error instanceof InvalidWebhookError) return reply(HTTP_BAD_REQUEST, { error: error.message });
    throw error;
  }
  const invoice = store.get(event.invoiceNumber);
  if (invoice === undefined) return reply(HTTP_NOT_FOUND, { error: `unknown invoice ${event.invoiceNumber}` });
  if (event.type === EVENT_PAYMENT_SUCCEEDED) return applyPayment(store, invoice, event);
  return reply(HTTP_OK, { received: event.id });
}
