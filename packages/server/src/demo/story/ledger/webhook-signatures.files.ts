import type { StoryFile } from '../story-types.ts';

export const WEBHOOK_SIGNATURES_CHECK: StoryFile = {
  path: 'test/acceptance/webhook-signatures.test.js',
  content: `import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { balanceCents, createInvoice } from '../../src/invoices.js';
import { createInvoiceStore } from '../../src/store.js';
import * as webhooks from '../../src/webhooks.js';

const SIGNING_SECRET = 'provider-and-ledger-shared-secret';
const SIGNATURE_HEADER = 'x-provider-signature';
const INVOICE_NUMBER = 'INV-4001';
const AMOUNT_CENTS = 50000;
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;

function storeWithInvoice() {
  return createInvoiceStore([
    createInvoice({
      number: INVOICE_NUMBER,
      customer: 'Orchard & Pine',
      vatPercent: 0,
      lines: [{ description: 'Annual plan', quantity: 1, unitPriceCents: AMOUNT_CENTS }],
    }),
  ]);
}

function eventBody(amountCents = AMOUNT_CENTS) {
  return JSON.stringify({
    id: 'evt-8001',
    type: 'payment.succeeded',
    data: { invoiceNumber: INVOICE_NUMBER, amountCents, reference: 'charge-8001' },
  });
}

function signatureOf(rawBody) {
  return \`sha256=\${createHmac('sha256', SIGNING_SECRET).update(rawBody).digest('hex')}\`;
}

function deliver(store, rawBody, headers) {
  assert.equal(typeof webhooks.handleWebhook, 'function', 'src/webhooks.js exports handleWebhook');
  return webhooks.handleWebhook({ headers, rawBody }, store, { signingSecret: SIGNING_SECRET });
}

function balanceOf(store) {
  return balanceCents(store.get(INVOICE_NUMBER));
}

test('criterion 1: a delivery without a signature is refused and changes nothing', () => {
  const store = storeWithInvoice();
  const answer = deliver(store, eventBody(), {});
  assert.equal(answer.status, HTTP_UNAUTHORIZED);
  assert.equal(balanceOf(store), AMOUNT_CENTS);
});

test('criterion 2: only a delivery signed with the shared secret goes through', () => {
  const store = storeWithInvoice();
  const body = eventBody();
  const forged = deliver(store, body, { [SIGNATURE_HEADER]: \`sha256=\${'0'.repeat(64)}\` });
  assert.equal(forged.status, HTTP_UNAUTHORIZED);
  assert.equal(balanceOf(store), AMOUNT_CENTS);
  const signed = deliver(store, body, { [SIGNATURE_HEADER]: signatureOf(body) });
  assert.equal(signed.status, HTTP_OK);
  assert.equal(balanceOf(store), 0);
});

test('criterion 3: a delivery altered after it was signed is refused', () => {
  const store = storeWithInvoice();
  const answer = deliver(store, eventBody(AMOUNT_CENTS - 1), { [SIGNATURE_HEADER]: signatureOf(eventBody()) });
  assert.equal(answer.status, HTTP_UNAUTHORIZED);
  assert.equal(balanceOf(store), AMOUNT_CENTS);
});

test('criterion 4: a signature of the wrong shape is refused instead of raising an error', () => {
  const store = storeWithInvoice();
  const body = eventBody();
  for (const signature of ['sha256=abcd', \`sha256=\${'z'.repeat(64)}\`, 'abcd']) {
    let answer;
    assert.doesNotThrow(() => {
      answer = deliver(store, body, { [SIGNATURE_HEADER]: signature });
    }, \`the signature \${signature} is answered\`);
    assert.equal(answer.status, HTTP_UNAUTHORIZED, \`the signature \${signature} is refused\`);
  }
  assert.equal(balanceOf(store), AMOUNT_CENTS);
});
`,
};

export const WEBHOOKS_CHECKING_THE_HEADER: StoryFile = {
  path: 'src/webhooks.js',
  content: `import { InvalidPaymentError, METHOD_CARD, recordPayment } from './payments.js';

const EVENT_PAYMENT_SUCCEEDED = 'payment.succeeded';
const EVENT_PAYMENT_FAILED = 'payment.failed';
const KNOWN_EVENTS = [EVENT_PAYMENT_SUCCEEDED, EVENT_PAYMENT_FAILED];
const SIGNATURE_HEADER = 'x-provider-signature';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

export class InvalidWebhookError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidWebhookError';
  }
}

function requireText(value, field) {
  if (typeof value !== 'string' || value === '') throw new InvalidWebhookError(\`\${field} must be a non-empty string\`);
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
  if (!KNOWN_EVENTS.includes(type)) throw new InvalidWebhookError(\`unknown event type \${JSON.stringify(type)}\`);
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
  if (request.headers[SIGNATURE_HEADER] === undefined) return reply(HTTP_UNAUTHORIZED, { error: 'missing signature' });
  let event;
  try {
    event = parseWebhook(request.rawBody);
  } catch (error) {
    if (error instanceof InvalidWebhookError) return reply(HTTP_BAD_REQUEST, { error: error.message });
    throw error;
  }
  const invoice = store.get(event.invoiceNumber);
  if (invoice === undefined) return reply(HTTP_NOT_FOUND, { error: \`unknown invoice \${event.invoiceNumber}\` });
  if (event.type === EVENT_PAYMENT_SUCCEEDED) return applyPayment(store, invoice, event);
  return reply(HTTP_OK, { received: event.id });
}
`,
};

export const WEBHOOK_TESTS_SENDING_A_HEADER: StoryFile = {
  path: 'test/webhooks.test.js',
  content: String.raw`import assert from 'node:assert/strict';
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
  return { headers: { 'x-provider-signature': 'sha256=present' }, rawBody };
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
`,
};

export const WEBHOOKS_VERIFYING_SIGNATURES: StoryFile = {
  path: 'src/webhooks.js',
  content: `import { createHmac, timingSafeEqual } from 'node:crypto';
import { InvalidPaymentError, METHOD_CARD, recordPayment } from './payments.js';

const EVENT_PAYMENT_SUCCEEDED = 'payment.succeeded';
const EVENT_PAYMENT_FAILED = 'payment.failed';
const KNOWN_EVENTS = [EVENT_PAYMENT_SUCCEEDED, EVENT_PAYMENT_FAILED];
const SIGNATURE_HEADER = 'x-provider-signature';
const SIGNATURE_PREFIX = 'sha256=';
const SIGNATURE_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

export class InvalidWebhookError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidWebhookError';
  }
}

function requireText(value, field) {
  if (typeof value !== 'string' || value === '') throw new InvalidWebhookError(\`\${field} must be a non-empty string\`);
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
  if (!KNOWN_EVENTS.includes(type)) throw new InvalidWebhookError(\`unknown event type \${JSON.stringify(type)}\`);
  return {
    id: requireText(id, 'id'),
    type,
    invoiceNumber: requireText(data?.invoiceNumber, 'data.invoiceNumber'),
    amountCents: data?.amountCents,
    reference: requireText(data?.reference, 'data.reference'),
  };
}

function receivedDigest(headers) {
  const value = headers[SIGNATURE_HEADER];
  if (typeof value !== 'string' || !value.startsWith(SIGNATURE_PREFIX)) return null;
  return Buffer.from(value.slice(SIGNATURE_PREFIX.length), DIGEST_ENCODING);
}

function isSignedBy(signingSecret, request) {
  const received = receivedDigest(request.headers);
  if (received === null || signingSecret === '') return false;
  const expected = createHmac(SIGNATURE_ALGORITHM, signingSecret).update(request.rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
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

export function handleWebhook(request, store, { signingSecret }) {
  if (request.headers[SIGNATURE_HEADER] === undefined) return reply(HTTP_UNAUTHORIZED, { error: 'missing signature' });
  if (!isSignedBy(signingSecret, request)) return reply(HTTP_UNAUTHORIZED, { error: 'invalid signature' });
  let event;
  try {
    event = parseWebhook(request.rawBody);
  } catch (error) {
    if (error instanceof InvalidWebhookError) return reply(HTTP_BAD_REQUEST, { error: error.message });
    throw error;
  }
  const invoice = store.get(event.invoiceNumber);
  if (invoice === undefined) return reply(HTTP_NOT_FOUND, { error: \`unknown invoice \${event.invoiceNumber}\` });
  if (event.type === EVENT_PAYMENT_SUCCEEDED) return applyPayment(store, invoice, event);
  return reply(HTTP_OK, { received: event.id });
}
`,
};

export const SERVER_WITH_SIGNING_SECRET: StoryFile = {
  path: 'src/server.js',
  content: `import { createServer } from 'node:http';
import { balanceCents, createInvoice, totalCents } from './invoices.js';
import { createInvoiceStore } from './store.js';
import { handleWebhook } from './webhooks.js';

const DEFAULT_PORT = 8090;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const JSON_TYPE = 'application/json';
const INVOICE_ROUTE = /^\\/api\\/invoices\\/([A-Za-z0-9-]+)$/;
const WEBHOOK_ROUTE = '/webhooks/provider';
const METHOD_GET = 'GET';
const METHOD_POST = 'POST';
const SIGNING_SECRET_VARIABLE = 'PROVIDER_WEBHOOK_SECRET';

const signingSecret = process.env[SIGNING_SECRET_VARIABLE] ?? '';
if (signingSecret === '') throw new Error(\`\${SIGNING_SECRET_VARIABLE} is not set\`);

const store = createInvoiceStore([
  createInvoice({
    number: 'INV-1001',
    customer: 'Harbor Lane Bakery',
    vatPercent: 20,
    lines: [{ description: 'Annual plan', quantity: 1, unitPriceCents: 120000 }],
  }),
]);

function send(response, status, body) {
  response.writeHead(status, { 'content-type': JSON_TYPE });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function describeInvoice(invoice) {
  return { number: invoice.number, customer: invoice.customer, totalCents: totalCents(invoice), balanceCents: balanceCents(invoice) };
}

const server = createServer(async (request, response) => {
  const invoiceNumber = INVOICE_ROUTE.exec(request.url ?? '')?.[1];
  if (request.method === METHOD_GET && invoiceNumber !== undefined) {
    const invoice = store.get(invoiceNumber);
    if (invoice === undefined) return send(response, HTTP_NOT_FOUND, { error: \`unknown invoice \${invoiceNumber}\` });
    return send(response, HTTP_OK, describeInvoice(invoice));
  }
  if (request.method === METHOD_POST && request.url === WEBHOOK_ROUTE) {
    const rawBody = await readBody(request);
    const { status, body } = handleWebhook({ headers: request.headers, rawBody }, store, { signingSecret });
    return send(response, status, body);
  }
  return send(response, HTTP_NOT_FOUND, { error: 'not found' });
});

server.listen(Number(process.env.PORT ?? DEFAULT_PORT));
`,
};

export const WEBHOOK_TESTS_SIGNING_PAYLOADS: StoryFile = {
  path: 'test/webhooks.test.js',
  content: `import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { createInvoice, balanceCents } from '../src/invoices.js';
import { createInvoiceStore } from '../src/store.js';
import { handleWebhook, InvalidWebhookError, parseWebhook } from '../src/webhooks.js';

const INVOICE_NUMBER = 'INV-3001';
const SIGNING_SECRET = 'provider-and-ledger-shared-secret';
const OPTIONS = { signingSecret: SIGNING_SECRET };

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
  const digest = createHmac('sha256', SIGNING_SECRET).update(rawBody).digest('hex');
  return { headers: { 'x-provider-signature': \`sha256=\${digest}\` }, rawBody };
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
  const answer = handleWebhook(post(delivery('payment.succeeded', 50000)), store, OPTIONS);
  assert.equal(answer.status, 200);
  assert.equal(balanceCents(store.get(INVOICE_NUMBER)), 0);
});

test('acknowledges a failed payment without recording anything', () => {
  const store = storeWithInvoice();
  const answer = handleWebhook(post(delivery('payment.failed', 50000)), store, OPTIONS);
  assert.equal(answer.status, 200);
  assert.equal(balanceCents(store.get(INVOICE_NUMBER)), 50000);
});

test('answers 404 for an unknown invoice and 409 for a payment above the balance', () => {
  const store = storeWithInvoice();
  assert.equal(handleWebhook(post(delivery('payment.succeeded', 50000, 'INV-9999')), store, OPTIONS).status, 404);
  assert.equal(handleWebhook(post(delivery('payment.succeeded', 50001)), store, OPTIONS).status, 409);
});

test('answers 400 for a body it cannot read', () => {
  assert.equal(handleWebhook(post('{'), storeWithInvoice(), OPTIONS).status, 400);
});
`,
};

export const README_WITH_SIGNATURES: StoryFile = {
  path: 'README.md',
  content: `# Ledger

A small billing API. Invoices are kept in cents, card payments go through a gateway that the caller provides, and the payment provider reports its events by webhook.

## Run

    PROVIDER_WEBHOOK_SECRET=<shared secret> npm start    # listens on PORT, 8090 by default
    npm test                                              # node --test
    npm run lint

## Endpoints

- \`GET /api/invoices/:number\` answers with the invoice number, its customer, its total and its balance, in cents.
- \`POST /webhooks/provider\` receives the provider's events. \`payment.succeeded\` records a payment on the invoice; \`payment.failed\` is acknowledged and changes nothing.

## Webhook signatures

The provider signs every delivery with an HMAC-SHA256 of the raw request body under the secret it shares with the ledger, and sends the hex digest in the \`x-provider-signature\` header as \`sha256=<digest>\`. A delivery without that header, or with a signature that does not match its body, is answered with status 401 and is not read any further. The server refuses to start when \`PROVIDER_WEBHOOK_SECRET\` is not set.

## Modules

- \`src/money.js\` formats cents and takes percentages, rounded half up to the cent.
- \`src/invoices.js\` holds invoices, their lines, VAT, totals and balances.
- \`src/payments.js\` records payments and charges a card through a gateway with a \`charge({ amountCents, token, reference })\` method.
- \`src/webhooks.js\` verifies, parses and handles the provider's events.
- \`src/store.js\` is the in-memory invoice store.
`,
};
