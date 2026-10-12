import type { StoryFile } from '../story-types.ts';

export const ORDER_HISTORY_PAGINATION_CHECK: StoryFile = {
  path: 'test/acceptance/order-history-pagination.test.js',
  content: `import assert from 'node:assert/strict';
import { test } from 'node:test';

const orderHistory = await import('../../src/order-history.js').catch(() => ({}));

const HISTORY_ROUTE = '/api/orders';
const FIRST_ORDER_ID = 1001;
const PAGE_SIZE = 20;
const MAX_PAGES_FOLLOWED = 10;
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

function ordersNumbered(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: FIRST_ORDER_ID + index,
    placedAt: new Date(Date.UTC(2026, 2, 1, 9, index)).toISOString(),
    lines: [{ sku: 'MUG-01', quantity: 1 }],
  }));
}

function newestFirst(count) {
  return Array.from({ length: count }, (_, index) => FIRST_ORDER_ID + count - 1 - index);
}

function respond(url, orders) {
  assert.equal(typeof orderHistory.orderHistoryResponse, 'function', 'src/order-history.js exports orderHistoryResponse');
  return orderHistory.orderHistoryResponse(url, orders);
}

function pageUrl(cursor) {
  return cursor === null ? HISTORY_ROUTE : \`\${HISTORY_ROUTE}?cursor=\${encodeURIComponent(cursor)}\`;
}

test('criterion 1: the first page holds the 20 most recent orders, newest first, and a cursor', () => {
  const answer = respond(HISTORY_ROUTE, ordersNumbered(45));
  assert.equal(answer.status, HTTP_OK);
  assert.deepEqual(answer.body.orders.map((order) => order.id), newestFirst(45).slice(0, PAGE_SIZE));
  assert.equal(typeof answer.body.nextCursor, 'string');
});

test('criterion 2: following the cursors yields every order exactly once, newest first', () => {
  const orders = ordersNumbered(45);
  const seen = [];
  const pageSizes = [];
  let cursor = null;
  do {
    const answer = respond(pageUrl(cursor), orders);
    assert.equal(answer.status, HTTP_OK);
    pageSizes.push(answer.body.orders.length);
    seen.push(...answer.body.orders.map((order) => order.id));
    cursor = answer.body.nextCursor;
  } while (cursor !== null && pageSizes.length < MAX_PAGES_FOLLOWED);
  assert.deepEqual(pageSizes, [20, 20, 5]);
  assert.deepEqual(seen, newestFirst(45));
});

test('criterion 3: a history of 20 orders fits one page and has no cursor', () => {
  const answer = respond(HISTORY_ROUTE, ordersNumbered(PAGE_SIZE));
  assert.equal(answer.body.orders.length, PAGE_SIZE);
  assert.equal(answer.body.nextCursor, null);
});

test('criterion 4: a cursor the API did not issue is refused with status 400', () => {
  const orders = ordersNumbered(45);
  for (const cursor of ['not-a-cursor', '']) {
    const answer = respond(pageUrl(cursor), orders);
    assert.equal(answer.status, HTTP_BAD_REQUEST, \`the cursor \${JSON.stringify(cursor)} is refused\`);
    assert.equal(typeof answer.body.error, 'string');
  }
});

test('criterion 5: each order is summarised with its item count worded for display', () => {
  const orders = [
    { id: 1001, placedAt: '2026-03-01T09:00:00.000Z', lines: [{ sku: 'MUG-01', quantity: 1 }] },
    {
      id: 1002,
      placedAt: '2026-03-01T10:00:00.000Z',
      lines: [
        { sku: 'MUG-01', quantity: 1 },
        { sku: 'TEE-02', quantity: 2 },
      ],
    },
  ];
  const answer = respond(HISTORY_ROUTE, orders);
  assert.deepEqual(
    answer.body.orders.map((order) => [order.id, order.itemsLabel, order.totalCents]),
    [
      [1002, '3 items', 7000],
      [1001, '1 item', 1800],
    ],
  );
});
`,
};

export const ORDER_HISTORY_MODULE: StoryFile = {
  path: 'src/order-history.js',
  content: `import { itemCount, subtotalCents } from './cart.js';
import { countLabel } from './labels.js';

export const ORDER_PAGE_SIZE = 20;

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const CURSOR_PARAMETER = 'cursor';
const CURSOR_ENCODING = 'base64url';
const REQUEST_BASE = 'http://shop.invalid';
const ITEM_NOUN = 'item';
const NEWEST_ORDER_BOUND = Number.POSITIVE_INFINITY;

export class InvalidCursorError extends Error {
  constructor(cursor) {
    super(\`the cursor \${JSON.stringify(cursor)} is not one this API issued\`);
    this.name = 'InvalidCursorError';
  }
}

function encodeCursor(orderId) {
  return Buffer.from(String(orderId)).toString(CURSOR_ENCODING);
}

function orderIdOf(cursor) {
  const orderId = Number(Buffer.from(cursor, CURSOR_ENCODING).toString());
  if (!Number.isSafeInteger(orderId) || encodeCursor(orderId) !== cursor) throw new InvalidCursorError(cursor);
  return orderId;
}

function summarise(order) {
  return {
    id: order.id,
    placedAt: order.placedAt,
    itemsLabel: countLabel(itemCount(order), ITEM_NOUN),
    totalCents: subtotalCents(order),
  };
}

export function orderHistoryPage(orders, cursor) {
  const olderThan = cursor === null ? NEWEST_ORDER_BOUND : orderIdOf(cursor);
  const remaining = orders.filter((order) => order.id < olderThan).sort((left, right) => right.id - left.id);
  const page = remaining.slice(0, ORDER_PAGE_SIZE);
  const hasMore = remaining.length > page.length;
  return { orders: page.map(summarise), nextCursor: hasMore ? encodeCursor(page.at(-1).id) : null };
}

export function orderHistoryResponse(requestUrl, orders) {
  const cursor = new URL(requestUrl, REQUEST_BASE).searchParams.get(CURSOR_PARAMETER);
  try {
    return { status: HTTP_OK, body: orderHistoryPage(orders, cursor) };
  } catch (error) {
    if (error instanceof InvalidCursorError) return { status: HTTP_BAD_REQUEST, body: { error: error.message } };
    throw error;
  }
}
`,
};

export const SERVER_WITH_ORDER_HISTORY: StoryFile = {
  path: 'src/server.js',
  content: String.raw`import { createServer } from 'node:http';
import { addItem, emptyCart, subtotalCents } from './cart.js';
import { orderHistoryResponse } from './order-history.js';
import { renderPage } from './render.js';

const DEFAULT_PORT = 8080;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const ORDER_HISTORY_PATH = '/api/orders';
const REQUEST_BASE = 'http://shop.invalid';

let cart = addItem(addItem(emptyCart(), 'MUG-01', 1), 'TEE-02', 2);
const orders = [];

const server = createServer((request, response) => {
  const { pathname } = new URL(request.url, REQUEST_BASE);
  if (pathname === '/') {
    response.writeHead(HTTP_OK, { 'content-type': 'text/html; charset=utf-8' });
    response.end(renderPage(cart));
    return;
  }
  if (pathname === '/api/cart') {
    response.writeHead(HTTP_OK, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ...cart, subtotalCents: subtotalCents(cart) }));
    return;
  }
  if (pathname === ORDER_HISTORY_PATH) {
    const { status, body } = orderHistoryResponse(request.url, orders);
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
    return;
  }
  response.writeHead(HTTP_NOT_FOUND).end();
});

server.listen(Number(process.env.PORT ?? DEFAULT_PORT));
`,
};
