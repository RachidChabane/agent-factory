import { nodeTestChecks, paragraphs } from '../story-helpers.ts';
import type { StoryIssue } from '../story-types.ts';
import {
  README_WITH_SIGNATURES,
  SERVER_WITH_SIGNING_SECRET,
  WEBHOOK_SIGNATURES_CHECK,
  WEBHOOK_TESTS_SENDING_A_HEADER,
  WEBHOOK_TESTS_SIGNING_PAYLOADS,
  WEBHOOKS_CHECKING_THE_HEADER,
  WEBHOOKS_VERIFYING_SIGNATURES,
} from './webhook-signatures.files.ts';

export const WEBHOOK_SIGNATURES: StoryIssue = {
  key: 'webhook-signatures',
  spec: {
    title: 'Reject webhooks that are not signed by the payment provider',
    type: 'security',
    need: paragraphs(
      "The endpoint that receives the provider's events reads any request whose body is well formed. Anyone who knows an invoice number can post a `payment.succeeded` event and mark the invoice as paid.",
      'The provider signs every delivery with an HMAC-SHA256 of the raw request body under a secret it shares with the ledger, and sends the hex digest in the `x-provider-signature` header as `sha256=<digest>`. `handleWebhook(request, store, { signingSecret })` has to verify that signature before it reads the event, and compare the digests in constant time.',
    ),
    acceptanceCriteria: [
      'A delivery without a signature header is refused with status 401 and the invoice is not changed.',
      'Only a delivery signed with the shared secret is processed: a correctly signed delivery is answered with status 200 and its payment is recorded, while one carrying a forged signature is refused with status 401 and leaves the invoice unchanged.',
      'A delivery whose body was altered after it was signed is refused with status 401 and leaves the invoice unchanged.',
      'A signature of the wrong length, or with characters that are not hexadecimal, is refused with status 401 instead of raising an error.',
    ],
    outOfScope: [
      'Rotating the shared secret or accepting two secrets at once.',
      'Rejecting a delivery that was already processed.',
      'Signing the requests the ledger sends to the provider.',
    ],
    expectedProof:
      'Tests that deliver unsigned, forged, altered and malformed requests, and one correctly signed request, and check the response status and the invoice: the attack succeeds on the current code and is refused on the branch. The constant-time comparison is read in review, not measured.',
  },
  dependsOn: [],
  validate: true,
  checks: nodeTestChecks({
    says: [
      'Reading the specification: four criteria on the webhook handler.',
      'The handler exists today, so the checks call it with unsigned, forged, altered and malformed deliveries and compare the response status and the invoice.',
      'Writing test/acceptance/webhook-signatures.test.js and the manifest, then running the command once.',
    ],
    files: [WEBHOOK_SIGNATURES_CHECK],
    descriptions: [
      'An unsigned delivery is refused and changes nothing',
      'Only a delivery signed with the shared secret goes through',
      'A delivery altered after it was signed is refused',
      'Malformed signatures are refused without raising an error',
    ],
    final:
      'Wrote test/acceptance/webhook-signatures.test.js with one test per criterion. On the current code all four tests fail on an assertion: every delivery is answered with status 200 and its payment is recorded, whatever its signature.',
  }),
  decision: null,
  attempts: [
    {
      says: [
        'Reading the specification and the four frozen checks.',
        'The provider adds the signature header to every delivery, so refusing the deliveries that lack it blocks the unsigned requests.',
        'Updating handleWebhook in src/webhooks.js, and the existing webhook tests so that they send the header.',
      ],
      writes: [WEBHOOKS_CHECKING_THE_HEADER, WEBHOOK_TESTS_SENDING_A_HEADER],
      deletes: [],
      final: 'src/webhooks.js answers 401 when the x-provider-signature header is missing. test/webhooks.test.js sends the header.',
    },
    {
      says: [
        'The gate refused the first version: a delivery with a header that is not a valid signature still goes through, so the header has to be verified, not just present.',
        'The signature is the HMAC-SHA256 of the raw body under the shared secret. It is compared with timingSafeEqual after the lengths are checked, because timingSafeEqual throws when the two buffers differ in length.',
        'Passing the secret from PROVIDER_WEBHOOK_SECRET in src/server.js, signing the payloads of the existing webhook tests, and documenting the header in the README.',
      ],
      writes: [WEBHOOKS_VERIFYING_SIGNATURES, SERVER_WITH_SIGNING_SECRET, WEBHOOK_TESTS_SIGNING_PAYLOADS, README_WITH_SIGNATURES],
      deletes: [],
      final:
        'src/webhooks.js verifies the HMAC-SHA256 signature with timingSafeEqual and answers 401 for a missing or an invalid signature. src/server.js reads PROVIDER_WEBHOOK_SECRET and refuses to start without it. test/webhooks.test.js signs its payloads. README.md describes the header and the variable.',
    },
  ],
  review: {
    says: 'The four criteria are met, the frozen checks are untouched, and the comparison is constant time with the lengths checked first. One small security note.',
    findings: [
      {
        severity: 'non-blocking',
        category: 'security',
        file: 'src/webhooks.js',
        line: 75,
        summary:
          "The two 401 answers name different causes ('missing signature' and 'invalid signature'), which tells a caller whether the header was recognised. One message for both gives an attacker less to work with.",
      },
    ],
  },
};
