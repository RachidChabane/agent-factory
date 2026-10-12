import { createServer } from 'node:http';
import { balanceCents, createInvoice, totalCents } from './invoices.js';
import { createInvoiceStore } from './store.js';
import { handleWebhook } from './webhooks.js';

const DEFAULT_PORT = 8090;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const JSON_TYPE = 'application/json';
const INVOICE_ROUTE = /^\/api\/invoices\/([A-Za-z0-9-]+)$/;
const WEBHOOK_ROUTE = '/webhooks/provider';
const METHOD_GET = 'GET';
const METHOD_POST = 'POST';

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
    if (invoice === undefined) return send(response, HTTP_NOT_FOUND, { error: `unknown invoice ${invoiceNumber}` });
    return send(response, HTTP_OK, describeInvoice(invoice));
  }
  if (request.method === METHOD_POST && request.url === WEBHOOK_ROUTE) {
    const rawBody = await readBody(request);
    const { status, body } = handleWebhook({ headers: request.headers, rawBody }, store);
    return send(response, status, body);
  }
  return send(response, HTTP_NOT_FOUND, { error: 'not found' });
});

server.listen(Number(process.env.PORT ?? DEFAULT_PORT));
