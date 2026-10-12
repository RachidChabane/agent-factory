import { nodeTestChecks, paragraphs } from '../story-helpers.ts';
import type { StoryIssue } from '../story-types.ts';
import { ORDER_HISTORY_MODULE, ORDER_HISTORY_PAGINATION_CHECK, SERVER_WITH_ORDER_HISTORY } from './order-history-pagination.files.ts';

export const ORDER_HISTORY_PAGINATION: StoryIssue = {
  key: 'order-history-pagination',
  spec: {
    title: 'Page the order history by 20 with a cursor',
    type: 'feature',
    need: paragraphs(
      'The shop is about to expose the order history to customers, and answering with the whole history gets slower with every order a customer places. The history endpoint pages from the start: 20 orders per page, newest first, with an opaque cursor that asks for the next page. The server answers `GET /api/orders` with it.',
      'Each order of a page is summarised with its item count worded the way the header badge words a cart ("1 item", "3 items"), using the shared `countLabel` helper, so that the history reads like the rest of the shop. An order has an `id` that grows with time, a `placedAt` timestamp and `lines` like the lines of a cart.',
    ),
    acceptanceCriteria: [
      "`orderHistoryResponse('/api/orders', orders)` in `src/order-history.js` answers with status 200 and a first page of the 20 most recent orders, newest first, with a `nextCursor`.",
      'Sending the `nextCursor` back as the `cursor` parameter returns the next 20 orders: for a history of 45 orders the pages hold 20, 20 and 5 orders, the last with a `nextCursor` of `null`, and every order appears exactly once.',
      'A history of 20 orders or fewer fits on one page, with a `nextCursor` of `null`.',
      'A cursor the API did not issue is refused with status 400 and an `error` message, whether it is garbage or empty.',
      'Each order of a page is summarised as `id`, `placedAt`, `itemsLabel` and `totalCents`: an order of one enamel mug reads `1 item` and 1800 cents, and an order of a mug and two tees reads `3 items` and 7000 cents.',
    ],
    outOfScope: [
      'Who may read an order history: the authentication of the customer.',
      'Filtering by status or date, and a page size chosen by the caller.',
      'Recording orders, which belongs to the checkout.',
    ],
    expectedProof:
      'Unit tests of `orderHistoryResponse` with histories of 45 and 20 orders, a followed chain of cursors, invalid cursors, and orders of one and of several items.',
  },
  dependsOn: ['cart-badge-total'],
  validate: true,
  checks: nodeTestChecks({
    says: [
      'Reading the specification: five criteria on one response function that does not exist yet.',
      'The checks build histories of 45 and 20 orders themselves, follow the cursors page by page, and load the module with a guarded import.',
      'Writing test/acceptance/order-history-pagination.test.js and the manifest, then running the command once.',
    ],
    files: [ORDER_HISTORY_PAGINATION_CHECK],
    descriptions: [
      'The first page holds the 20 most recent orders and a cursor',
      'Following the cursors yields every order once, newest first',
      'A history of 20 orders fits one page without a cursor',
      'A cursor the API did not issue is refused with status 400',
      'Each order is summarised with a worded item count and its total',
    ],
    final:
      'Wrote test/acceptance/order-history-pagination.test.js with one test per criterion. On the current code all five tests fail on an assertion: src/order-history.js does not exist yet.',
  }),
  decision: null,
  attempts: [
    {
      says: [
        'Reading the specification and the five frozen checks.',
        'The header badge change has merged, so countLabel is available; the history reuses it for the item counts instead of building its own wording.',
        'Writing src/order-history.js: opaque cursors that name the last order shown, a page of 20, and a response that maps a bad cursor to status 400. Wiring the /api/orders route in src/server.js.',
      ],
      writes: [ORDER_HISTORY_MODULE, SERVER_WITH_ORDER_HISTORY],
      deletes: [],
      final:
        'Added src/order-history.js (orderHistoryPage, orderHistoryResponse, ORDER_PAGE_SIZE) and routed GET /api/orders to it in src/server.js. Orders are kept in an in-memory list, as the cart is.',
    },
  ],
  review: {
    says: 'The five criteria are met and the frozen checks are untouched. The cursor stays valid when newer orders arrive, because it names the last order shown. One note on totals.',
    findings: [
      {
        severity: 'non-blocking',
        category: 'correctness',
        file: 'src/order-history.js',
        line: 36,
        summary:
          'totalCents is recomputed from the current catalogue prices, so an order placed before a price change reports a different total afterwards; orders should carry the prices they were placed at. Recording orders is out of scope here, so this does not block the change.',
      },
    ],
  },
};
