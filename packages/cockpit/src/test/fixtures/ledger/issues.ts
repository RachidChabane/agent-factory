import type { IssueView } from '../../../contract/index.ts';
import { ledgerLinks } from '../forge-links.ts';
import { attemptsOf, costOfIssue, frozenCheck, specOfProposal } from '../issue-parts.ts';
import { LEDGER_ID } from '../project-ids.ts';
import type { RunWorld } from '../runs.ts';
import { issueView } from '../seeds.ts';
import { days, type FixtureClock } from '../time.ts';
import { ACCOUNTANT_EXPORTS_CHALLENGE } from './challenges.ts';
import { ISSUE, issueBranch, PULL_REQUEST, REQUEST, RUN, titleOf } from './ids.ts';
import { CHECK_PATH, DOCS_PATH } from './paths.ts';

const NONEXISTENT_DEPENDENCY = 31;

export function ledgerIssues(clock: FixtureClock, runs: RunWorld): IssueView[] {
  const ago = (minutes: number): string => clock.minutesAgo(minutes);
  const common = (number: number) => ({ number, title: titleOf(number), url: ledgerLinks.issue(number), costUsd: costOfIssue(runs, LEDGER_ID, number) });
  const [retriesSpec, csvSpec] = ACCOUNTANT_EXPORTS_CHALLENGE.specs;
  if (retriesSpec === undefined || csvSpec === undefined) throw new Error('the accountant challenge lacks its specs');
  return [
    issueView({
      ...common(ISSUE.invoiceLifecycleDocs),
      type: 'docs',
      state: 'in-release',
      spec: {
        need: 'The states of an invoice and the events that move it are only known to the people who wrote the billing code.',
        acceptanceCriteria: [
          `${DOCS_PATH} lists every state of an invoice and the events that move it.`,
          'The page names the module that implements the transitions.',
        ],
        outOfScope: ['Documenting the states of a payment'],
        expectedProof: 'The existing tests still pass and the diff touches documentation only.',
      },
      beforeProofKind: 'none',
      branch: issueBranch(ISSUE.invoiceLifecycleDocs),
      pullRequestNumber: PULL_REQUEST.invoiceLifecycleDocs,
      attempts: attemptsOf(runs, [RUN.invoiceLifecycleDocsImplementer, 'session', 'passed', 'The lifecycle page was written from the transition table of the code.']),
      createdAt: ago(days(30)),
      updatedAt: ago(days(6)),
    }),
    issueView({
      ...common(ISSUE.paymentIdempotencyKey),
      type: 'api',
      state: 'in-release',
      spec: {
        need: 'A client that retries a payment request after a timeout can create the same payment twice.',
        acceptanceCriteria: [
          'POST /payments accepts an Idempotency-Key header.',
          'A second request with the same key and the same body returns the first payment.',
          'A second request with the same key and a different body is refused with HTTP 409.',
        ],
        outOfScope: ['Expiring idempotency keys'],
        expectedProof: 'Integration tests of the endpoint, including a replay with a different body.',
      },
      branch: issueBranch(ISSUE.paymentIdempotencyKey),
      pullRequestNumber: PULL_REQUEST.paymentIdempotencyKey,
      checks: [
        frozenCheck({
          project: LEDGER_ID,
          path: CHECK_PATH.idempotency,
          runner: 'pytest',
          onBase: 'fails',
          before: { result: 'failed', detail: 'The endpoint ignores the header and creates a second payment.' },
        }),
      ],
      checksFrozenAt: ago(days(10)),
      attempts: attemptsOf(runs, [RUN.idempotencyImplementer, 'session', 'passed', 'The key is looked up before the payment is created; a different body raises a conflict.']),
      createdAt: ago(days(20)),
      updatedAt: ago(days(6)),
    }),
    issueView({
      ...common(ISSUE.taxRoundingPerLine),
      type: 'fix',
      state: 'merged',
      spec: {
        need: 'Tax is rounded once on the invoice total, so an invoice of three lines can differ by a cent from the sum of its line taxes.',
        acceptanceCriteria: [
          'The tax of each line is rounded to the cent before the lines are summed.',
          'The tax of the invoice is the sum of the rounded tax of its lines.',
          'An invoice with a single line is unchanged.',
        ],
        outOfScope: ['Changing the tax rates'],
        expectedProof: 'A unit test of an invoice of three lines that fails on the current code.',
      },
      branch: issueBranch(ISSUE.taxRoundingPerLine),
      pullRequestNumber: PULL_REQUEST.taxRoundingPerLine,
      checks: [
        frozenCheck({
          project: LEDGER_ID,
          path: CHECK_PATH.taxRounding,
          runner: 'pytest',
          onBase: 'fails',
          before: { result: 'failed', detail: 'invoice_tax returns 200 for three lines whose rounded taxes add up to 201.' },
        }),
      ],
      checksFrozenAt: ago(days(7)),
      attempts: attemptsOf(runs, [RUN.taxRoundingImplementer, 'session', 'passed', 'Tax is computed per line in integer arithmetic and then summed.']),
      createdAt: ago(days(8)),
      updatedAt: ago(330),
    }),
    issueView({
      ...common(ISSUE.webhookSignatures),
      type: 'security',
      state: 'ci',
      spec: {
        need: 'Incoming webhooks are verified against a single shared secret; rotating it breaks deliveries until every sender is updated.',
        acceptanceCriteria: [
          'A webhook signed with the current or the previous secret is accepted.',
          'A webhook signed with any other secret is refused with HTTP 401.',
          'The comparison of signatures does not leak their length or content through timing.',
        ],
        outOfScope: ['Automating the rotation of the secret'],
        expectedProof: 'A test that replays a forged signature: accepted on the base branch, refused on the branch.',
      },
      branch: issueBranch(ISSUE.webhookSignatures),
      pullRequestNumber: PULL_REQUEST.webhookSignatures,
      checks: [
        frozenCheck({
          project: LEDGER_ID,
          path: CHECK_PATH.webhookSignatures,
          runner: 'pytest',
          onBase: 'fails',
          before: { result: 'failed', detail: 'A forged signature is accepted on the base branch.' },
        }),
      ],
      checksFrozenAt: ago(2_985),
      attempts: attemptsOf(
        runs,
        [RUN.webhookFirst, 'session', 'gate-failed', 'The gate failed on mypy: the secrets container was typed as optional.'],
        [RUN.webhookSecond, 'correction', 'passed', 'The container is typed as required and the gate passes.'],
      ),
      createdAt: ago(days(4)),
      updatedAt: ago(2_780),
    }),
    issueView({
      ...common(ISSUE.invoiceServiceSplit),
      type: 'refactor',
      state: 'gating',
      spec: {
        need: 'invoice_service.py has grown to 900 lines and mixes numbering, tax computation and persistence.',
        acceptanceCriteria: [
          'Numbering, tax computation and persistence live in separate modules.',
          'The public functions of invoice_service keep their signatures.',
          'The existing tests pass without any change.',
        ],
        outOfScope: ['Changing the behaviour of an invoice'],
        expectedProof: 'The existing tests, unchanged: they pass before and after.',
      },
      beforeProofKind: 'none',
      branch: issueBranch(ISSUE.invoiceServiceSplit),
      checks: [
        frozenCheck({
          project: LEDGER_ID,
          path: CHECK_PATH.invoiceService,
          runner: 'pytest',
          onBase: 'passes',
          before: { result: 'passed', detail: 'The 64 existing tests pass on the base branch.' },
        }),
      ],
      checksFrozenAt: ago(days(3) - 30),
      attempts: attemptsOf(runs, [RUN.invoiceServiceSplitImplementer, 'session', 'passed', '']),
      createdAt: ago(days(3)),
      updatedAt: ago(308),
    }),
    issueView({
      ...common(ISSUE.paymentRetries),
      type: 'feature',
      state: 'producing-evidence',
      spec: specOfProposal(retriesSpec),
      requestId: REQUEST.accountantExports,
      branch: issueBranch(ISSUE.paymentRetries),
      checks: [
        frozenCheck({
          project: LEDGER_ID,
          path: CHECK_PATH.paymentRetries,
          runner: 'pytest',
          onBase: 'fails',
          before: { result: 'failed', detail: 'A temporary failure leaves the payment failed; nothing is scheduled.' },
        }),
      ],
      checksFrozenAt: ago(3_960),
      attempts: attemptsOf(runs, [RUN.paymentRetriesImplementer, 'session', 'passed', '']),
      createdAt: ago(days(12)),
      updatedAt: ago(215),
    }),
    issueView({
      ...common(ISSUE.invoiceCsvExport),
      type: 'feature',
      state: 'checks-frozen',
      paused: true,
      spec: specOfProposal(csvSpec),
      requestId: REQUEST.accountantExports,
      branch: issueBranch(ISSUE.invoiceCsvExport),
      checks: [
        frozenCheck({
          project: LEDGER_ID,
          path: CHECK_PATH.csvExport,
          runner: 'pytest',
          onBase: 'fails',
          before: { result: 'failed', detail: 'GET /invoices.csv answers 404.' },
        }),
      ],
      checksFrozenAt: ago(190),
      createdAt: ago(days(12)),
      updatedAt: ago(180),
    }),
    issueView({
      ...common(ISSUE.overdueGracePeriod),
      type: 'feature',
      state: 'spec-validated',
      spec: {
        need: 'An invoice is marked overdue the day after its due date, although several customers have agreed a grace period.',
        acceptanceCriteria: [
          'An invoice is marked overdue only after its due date plus the grace period of its customer.',
          'A customer without a grace period keeps the current behaviour.',
        ],
        outOfScope: ['Reminder emails'],
        expectedProof: 'Unit tests of the overdue rule with and without a grace period.',
      },
      createdAt: ago(days(1)),
      updatedAt: ago(360),
    }),
    issueView({
      ...common(ISSUE.creditNotes),
      type: 'feature',
      state: 'spec-draft',
      spec: {
        need: 'A correction to an issued invoice is made by voiding it and issuing a new one, which loses the link between the two.',
        acceptanceCriteria: ['A credit note references the invoice it corrects.', 'The balance of the customer takes the credit note into account.'],
        outOfScope: ['Refunding the payment'],
        expectedProof: 'Integration tests that issue an invoice, a credit note and read the balance.',
      },
      dependsOn: [NONEXISTENT_DEPENDENCY],
      createdAt: ago(days(2)),
      updatedAt: ago(days(2)),
    }),
  ];
}
