import { sha } from '../time.ts';

const PROJECT = 'ledger';

export const ISSUE = {
  invoiceLifecycleDocs: 8,
  paymentIdempotencyKey: 12,
  taxRoundingPerLine: 16,
  webhookSignatures: 19,
  invoiceServiceSplit: 23,
  paymentRetries: 26,
  invoiceCsvExport: 27,
  overdueGracePeriod: 29,
  creditNotes: 30,
} as const;

export const ISSUE_TITLE: Readonly<Record<number, string>> = {
  [ISSUE.invoiceLifecycleDocs]: 'Document the invoice lifecycle',
  [ISSUE.paymentIdempotencyKey]: 'Accept an idempotency key on payment creation',
  [ISSUE.taxRoundingPerLine]: 'Round the tax of each invoice line instead of the invoice total',
  [ISSUE.webhookSignatures]: 'Verify webhook signatures with a rotating secret',
  [ISSUE.invoiceServiceSplit]: 'Split the invoice service into smaller modules',
  [ISSUE.paymentRetries]: 'Retry failed payments with exponential backoff',
  [ISSUE.invoiceCsvExport]: 'Export invoices as CSV',
  [ISSUE.overdueGracePeriod]: 'Apply a grace period before an invoice is marked overdue',
  [ISSUE.creditNotes]: 'Support credit notes',
};

export function titleOf(issueNumber: number): string {
  const title = ISSUE_TITLE[issueNumber];
  if (title === undefined) throw new Error(`no title for the ledger issue ${issueNumber}`);
  return title;
}

export const PULL_REQUEST = {
  invoiceLifecycleDocs: 10,
  paymentIdempotencyKey: 14,
  taxRoundingPerLine: 18,
  webhookSignatures: 22,
} as const;

export const OUTSIDE_PULL_REQUEST = { skipZeroLines: 20 } as const;

export const REQUEST = {
  accountantExports: 'R-9',
  usageBasedBilling: 'R-12',
  refundsByEmail: 'R-13',
} as const;

export const RELEASE = { fourth: 'v0.4.0', fifth: 'v0.5.0' } as const;

export function mergeSha(pullRequest: number): string {
  return sha(`${PROJECT}:merge:${pullRequest}`);
}

export function headSha(pullRequest: number): string {
  return sha(`${PROJECT}:head:${pullRequest}`);
}

export const DIRECT_PUSH_SHA = sha(`${PROJECT}:direct-push:pytest-bump`);

export const SKIP_ZERO_LINES_SHA = mergeSha(OUTSIDE_PULL_REQUEST.skipZeroLines);

export const TAG_SHA = { fourth: sha(`${PROJECT}:tag:v0.4.0`), fifth: sha(`${PROJECT}:tag:v0.5.0`) } as const;

const BRANCH_SLUG: Readonly<Record<number, string>> = {
  [ISSUE.invoiceLifecycleDocs]: 'invoice-lifecycle-docs',
  [ISSUE.paymentIdempotencyKey]: 'payment-idempotency-key',
  [ISSUE.taxRoundingPerLine]: 'tax-rounding-per-line',
  [ISSUE.webhookSignatures]: 'webhook-signatures',
  [ISSUE.invoiceServiceSplit]: 'invoice-service-split',
  [ISSUE.paymentRetries]: 'payment-retries',
  [ISSUE.invoiceCsvExport]: 'invoice-csv-export',
};

export function issueBranch(issueNumber: number): string {
  const slug = BRANCH_SLUG[issueNumber];
  if (slug === undefined) throw new Error(`the ledger issue ${issueNumber} has no branch`);
  return `factory/${issueNumber}-${slug}`;
}

export const RUN = {
  invoiceLifecycleDocsImplementer: 'run_1b7e49',
  invoiceLifecycleDocsReview: 'run_a45f20',
  idempotencyImplementer: 'run_6c2d93',
  idempotencyReview: 'run_0e81b7',
  taxRoundingImplementer: 'run_d73a05',
  taxRoundingReview: 'run_47c9e1',
  webhookAuthor: 'run_5f06a3',
  webhookFirst: 'run_88f1d6',
  webhookSecond: 'run_3ae572',
  webhookReview: 'run_c1b948',
  invoiceServiceSplitImplementer: 'run_e92b34',
  paymentRetriesAuthor: 'run_c80f27',
  paymentRetriesImplementer: 'run_72d8c0',
  paymentRetriesReview: 'run_b60f1d',
  invoiceCsvExportAuthor: 'run_19c5ea',
  challengeAccountantExports: 'run_f48a76',
  challengeUsageBasedBilling: 'run_24b3d9',
  auditPytestBump: 'run_a06e58',
  auditSkipZeroLines: 'run_8b4f17',
} as const;
