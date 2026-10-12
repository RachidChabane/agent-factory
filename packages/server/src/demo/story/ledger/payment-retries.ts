import { nodeTestChecks, paragraphs } from '../story-helpers.ts';
import type { StoryIssue } from '../story-types.ts';
import { PAYMENT_RETRIES_CHECK, PAYMENTS_WITH_RETRIES } from './payment-retries.files.ts';

export const PAYMENT_RETRIES: StoryIssue = {
  key: 'payment-retries',
  spec: {
    title: 'Retry declined card payments with a growing delay',
    type: 'feature',
    need: paragraphs(
      'When the card gateway declines a charge, the invoice stays unpaid and the customer has to start over. Many declines are temporary, a bank timeout or a limit that resets overnight, so one attempt is not enough. A declined charge should be retried a few times, waiting longer before each retry, and the invoice should keep a record of every attempt so that support can see what happened.',
      'The retrying lives in a new function, `chargeCardWithRetries(gateway, invoice, cardToken, { wait })` in `src/payments.js`. It takes the arguments of `chargeCard` plus a `wait(milliseconds)` function that returns a promise, so that nothing sleeps in tests, and it resolves to `{ invoice, charge }` like `chargeCard`.',
    ),
    acceptanceCriteria: [
      'A declined charge is retried: with a gateway that declines twice and then approves, `chargeCardWithRetries` ends approved after three gateway calls, and the returned invoice carries the payment.',
      'The retries stop after the third: with a gateway that always declines, the gateway is called four times in total, the result is declined and the invoice carries no payment.',
      'The delay before each retry is longer than the one before: the three delays passed to `wait` increase, and the first is above zero.',
      'Every attempt is recorded on the invoice, in order, as `chargeAttempts` entries with an `attempt` number starting at 1 and an `outcome` of `declined` or `approved`, the approved one included.',
      'An approved first attempt is charged once and `wait` is never called.',
    ],
    outOfScope: [
      'Retrying failures other than a decline, such as a gateway outage or a network error.',
      'Letting the customer choose another card between attempts.',
      'Telling the customer about a failed attempt.',
    ],
    expectedProof:
      'Unit tests that run `chargeCardWithRetries` against gateways that decline a set number of times, with a recording `wait`, and check the gateway calls, the delays and the attempts recorded on the invoice.',
  },
  dependsOn: [],
  validate: true,
  checks: nodeTestChecks({
    says: [
      'Reading the specification: five criteria on one new function.',
      'The gateway is injected, so the checks use gateways that decline a set number of times and a recording wait function; nothing sleeps.',
      'Writing test/acceptance/payment-retries.test.js and the manifest, then running the command once.',
    ],
    files: [PAYMENT_RETRIES_CHECK],
    descriptions: [
      'A declined charge is retried until it is approved',
      'At most three retries follow the first attempt',
      'The delay grows before each retry',
      'Every attempt is recorded on the invoice with its outcome',
      'An approved first attempt is not retried and does not wait',
    ],
    final:
      'Wrote test/acceptance/payment-retries.test.js with one test per criterion. On the current code all five tests fail on an assertion: src/payments.js exports no chargeCardWithRetries.',
  }),
  decision: null,
  attempts: [
    {
      says: [
        'Reading the specification and the five frozen checks.',
        'chargeCard already returns the invoice and the answer of the gateway, so the retry loop wraps it: one attempt, then up to three retries with a delay that doubles from one second.',
        'Writing chargeCardWithRetries in src/payments.js.',
      ],
      writes: [PAYMENTS_WITH_RETRIES],
      deletes: [],
      final:
        'src/payments.js gains chargeCardWithRetries (three retries, delays of 1, 2 and 4 seconds, an attempt recorded on the invoice after every charge) and exports MAX_RETRIES. Nothing else changed.',
    },
  ],
  review: {
    says: 'The five criteria are met and the frozen checks are untouched. No gaps to report.',
    findings: [],
  },
};
