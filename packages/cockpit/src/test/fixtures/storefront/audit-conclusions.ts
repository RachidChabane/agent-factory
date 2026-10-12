import type { AuditConclusionView, AuditIssueDraftView, IssueSpecView } from '../../../contract/index.ts';
import { ISSUE, RUN } from './ids.ts';

export const FOOTER_LINKS_CONCLUSION: AuditConclusionView = {
  runId: RUN.auditFooterLinks,
  summary: 'The change rewrites three links of the footer and one help page. Nothing in the shop depends on the previous targets, and the new ones resolve.',
  findings: [],
  proposedFix: null,
};

export const PROMO_BANNER_COPY_CONCLUSION: AuditConclusionView = {
  runId: RUN.auditPromoBannerCopy,
  summary: 'The banner now promises "20% off everything", but the promo rules exclude items on sale, and no test ties the copy to the rules.',
  findings: [
    {
      level: 'intent',
      statement: 'The banner promises a discount that the pricing rules do not grant on sale items, so customers will see a smaller saving than announced.',
      evidence: 'web/src/cart/PromoBanner.tsx:14 states 20% off everything; api/src/promo/rules.ts:40 excludes the sale category.',
    },
    {
      level: 'idea',
      statement: 'The copy is written by hand in the component instead of being derived from the active promo rules.',
      evidence: 'web/src/cart/PromoBanner.tsx:12 holds the sentence as a literal.',
    },
    {
      level: 'method',
      statement: 'No test renders the banner for a rule that excludes sale items.',
      evidence: 'web/src/cart/promo-banner.test.tsx covers only the default rule.',
    },
  ],
  proposedFix: 'Derive the banner copy from the active promo rules and add a test that renders it for a rule that excludes sale items.',
};

export const PROMO_BANNER_COPY_DRAFT: AuditIssueDraftView = {
  title: 'Derive the promo banner copy from the promo rules',
  body: [
    '## Need',
    'The cart banner announces "20% off everything" by hand while the promo rules exclude items on sale.',
    '',
    '## Acceptance criteria',
    '1. The banner sentence is built from the active promo rules.',
    '2. A rule that excludes the sale category produces a sentence that says so.',
    '3. A unit test renders the banner for the default rule and for a rule that excludes sale items.',
    '',
    '## Expected proof',
    'Unit tests of the banner for both rules.',
  ].join('\n'),
};

export const HTTP_CLIENT_BUMP_CONCLUSION: AuditConclusionView = {
  runId: RUN.auditHttpClientBump,
  summary: 'The HTTP client bump changed the default request timeout from 30 s to 10 s. The checkout service relies on the old value and nothing pins it.',
  findings: [
    {
      level: 'intent',
      statement: 'A dependency update must not change how long the checkout waits for the payment provider.',
      evidence: 'api/src/http/client.ts creates the client without a timeout; the 10 s default now applies to the payment call.',
    },
    {
      level: 'idea',
      statement: 'The timeout of a call to a payment provider is business configuration and should be explicit.',
      evidence: 'api/src/checkout/payment-provider.ts:31 relies on the library default.',
    },
    {
      level: 'method',
      statement: 'No test pins the timeout, so the next bump can change it again unnoticed.',
      evidence: 'api/src/http/client.test.ts has no assertion on the timeout.',
    },
  ],
  proposedFix: 'Set the timeout of the payment provider call explicitly in the checkout configuration and add a test that fails when the value changes.',
};

export const HTTP_TIMEOUT_SPEC: IssueSpecView = {
  need: 'The checkout waits for the payment provider with the default timeout of the HTTP client, which changed in the latest minor release.',
  acceptanceCriteria: ['The payment provider call sets its timeout to 30 seconds explicitly.', 'A unit test fails when the configured timeout is not 30 seconds.'],
  outOfScope: ['Retrying failed payment calls'],
  expectedProof: `A unit test of the payment provider client, as a follow-up of the audit of the bump merged for #${ISSUE.httpClientBump}.`,
};

function draftBodyOf(spec: IssueSpecView): string {
  return [
    '## Need',
    spec.need,
    '',
    '## Acceptance criteria',
    ...spec.acceptanceCriteria.map((criterion, index) => `${index + 1}. ${criterion}`),
    '',
    '## Expected proof',
    spec.expectedProof,
  ].join('\n');
}

export const HTTP_CLIENT_BUMP_DRAFT: AuditIssueDraftView = {
  title: 'Pin the HTTP client timeout of the checkout service',
  body: draftBodyOf(HTTP_TIMEOUT_SPEC),
};
