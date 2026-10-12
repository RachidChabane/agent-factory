import type { Evidence, PullRequestDiff, PullRequestView, ReviewRound } from '../../../contract/index.ts';
import { ledgerLinks } from '../forge-links.ts';
import { NEVER_READ, readOn } from '../readings.ts';
import { runOf, type RunWorld } from '../runs.ts';
import { changedFiles, diffOf } from '../patch.ts';
import type { PatchedFile } from '../patch.ts';
import { pullRequestView } from '../seeds.ts';
import { days, hours, sha, type FixtureClock } from '../time.ts';
import { IDEMPOTENCY_FILES, INVOICE_LIFECYCLE_FILES, TAX_ROUNDING_FILES, WEBHOOK_SIGNATURE_FILES } from './diffs.ts';
import { headSha, ISSUE, issueBranch, mergeSha, PULL_REQUEST, RUN } from './ids.ts';
import { CHECK_PATH } from './paths.ts';
import { REVIEW_FINDINGS } from './reviews.ts';

const LOCAL_CHECK = 'local-rehearsal';

const PATCHED_FILES: Readonly<Record<number, readonly PatchedFile[]>> = {
  [PULL_REQUEST.invoiceLifecycleDocs]: INVOICE_LIFECYCLE_FILES,
  [PULL_REQUEST.paymentIdempotencyKey]: IDEMPOTENCY_FILES,
  [PULL_REQUEST.taxRoundingPerLine]: TAX_ROUNDING_FILES,
  [PULL_REQUEST.webhookSignatures]: WEBHOOK_SIGNATURE_FILES,
};

function roundsOf(runs: RunWorld, ...runIds: readonly string[]): ReviewRound[] {
  return runIds.map((runId, index) => {
    const completedAt = runOf(runs, runId).endedAt;
    if (completedAt === null) throw new Error(`the review run ${runId} has not ended`);
    return { round: index + 1, runId, completedAt, findings: [...(REVIEW_FINDINGS[runId] ?? [])] };
  });
}

function report(body: string): Evidence {
  return { kind: 'report', id: 'summary', title: 'Summary of the change', body };
}

function acceptance(test: string, name: string, criteria: readonly string[]): Evidence {
  return {
    kind: 'acceptance-tests',
    id: 'acceptance',
    title: 'Acceptance tests by criterion',
    runner: 'pytest',
    criteria: criteria.map((text, index) => ({ criterion: index + 1, text })),
    rows: criteria.map((_, index) => ({ criterion: index + 1, test, name, base: 'red-assertion', branch: 'green' })),
  };
}

export function ledgerPullRequests(clock: FixtureClock, runs: RunWorld): PullRequestView[] {
  const ago = (minutes: number): string => clock.minutesAgo(minutes);
  const merged = (number: number, issue: number, type: string, title: string, openedMinutesAgo: number, mergedMinutesAgo: number) => ({
    number,
    title,
    issueNumber: issue,
    type,
    branch: issueBranch(issue),
    url: ledgerLinks.pullRequest(number),
    headSha: headSha(number),
    state: 'merged' as const,
    openedAt: ago(openedMinutesAgo),
    mergedAt: ago(mergedMinutesAgo),
    checks: NEVER_READ,
  });
  return [
    pullRequestView({
      ...merged(PULL_REQUEST.invoiceLifecycleDocs, ISSUE.invoiceLifecycleDocs, 'docs', 'docs: document the invoice lifecycle', days(19) - 40, days(17)),
      evidence: [report('Adds docs/invoice-lifecycle.md with the states of an invoice and the events that move it. Documentation only.')],
      reviewRounds: roundsOf(runs, RUN.invoiceLifecycleDocsReview),
      files: changedFiles(INVOICE_LIFECYCLE_FILES),
    }),
    pullRequestView({
      ...merged(PULL_REQUEST.paymentIdempotencyKey, ISSUE.paymentIdempotencyKey, 'api', 'feat(payments): accept an idempotency key on payment creation', days(9) + hours(12) - 55, days(8)),
      evidence: [
        acceptance(CHECK_PATH.idempotency, 'replaying a request returns the first payment', [
          'POST /payments accepts an Idempotency-Key header.',
          'A second request with the same key and the same body returns the first payment.',
          'A second request with the same key and a different body is refused with HTTP 409.',
        ]),
      ],
      reviewRounds: roundsOf(runs, RUN.idempotencyReview),
      files: changedFiles(IDEMPOTENCY_FILES),
    }),
    pullRequestView({
      ...merged(PULL_REQUEST.taxRoundingPerLine, ISSUE.taxRoundingPerLine, 'fix', 'fix(billing): round the tax of each invoice line', 400, 330),
      evidence: [
        acceptance(CHECK_PATH.taxRounding, 'tax is rounded per line before summing', [
          'The tax of each line is rounded to the cent before the lines are summed.',
          'An invoice with a single line is unchanged.',
        ]),
      ],
      reviewRounds: roundsOf(runs, RUN.taxRoundingReview),
      files: changedFiles(TAX_ROUNDING_FILES),
    }),
    pullRequestView({
      number: PULL_REQUEST.webhookSignatures,
      title: 'fix(webhooks): verify webhook signatures with a rotating secret',
      issueNumber: ISSUE.webhookSignatures,
      type: 'security',
      branch: issueBranch(ISSUE.webhookSignatures),
      url: ledgerLinks.pullRequest(PULL_REQUEST.webhookSignatures),
      headSha: headSha(PULL_REQUEST.webhookSignatures),
      state: 'open',
      openedAt: ago(2_780),
      checks: readOn([{ name: LOCAL_CHECK, conclusion: 'success', url: '', durationMs: null, failsOnBase: false }], ago(3)),
      evidence: [
        {
          kind: 'red-green',
          id: 'forged-signature',
          title: 'A forged signature is accepted on the base branch and refused on the branch',
          command: `uv run pytest ${CHECK_PATH.webhookSignatures}`,
          before: {
            outcome: 'failed',
            sha: sha('ledger:base:22'),
            log: `FAILED ${CHECK_PATH.webhookSignatures}::test_a_forged_signature_is_refused - assert 202 == 401\n2 failed in 0.41s`,
            summary: {
              passed: 0,
              failed: 2,
              skipped: 0,
              failures: [
                { test: 'test_a_forged_signature_is_refused', message: 'assert 202 == 401' },
                { test: 'test_the_previous_secret_is_still_accepted', message: 'assert 401 == 202' },
              ],
              missing: [],
            },
          },
          after: { outcome: 'passed', sha: headSha(PULL_REQUEST.webhookSignatures), log: '2 passed in 0.39s', summary: { passed: 2, failed: 0, skipped: 0, failures: [], missing: [] } },
        },
        acceptance(CHECK_PATH.webhookSignatures, 'a forged signature is refused', [
          'A webhook signed with the current or the previous secret is accepted.',
          'A webhook signed with any other secret is refused with HTTP 401.',
          'The comparison of signatures does not leak their length or content through timing.',
        ]),
        report('Webhook signatures are checked against the current and the previous secret with a constant-time comparison. A forged signature is now refused.'),
      ],
      reviewRounds: roundsOf(runs, RUN.webhookReview),
      files: changedFiles(WEBHOOK_SIGNATURE_FILES),
      mergeable: true,
    }),
  ];
}

const DIFF_READ_MINUTES_AGO = 1;

/** The diffs the factory serves for the pull requests of the ledger. */
export function ledgerDiffs(clock: FixtureClock, pullRequests: readonly PullRequestView[]): PullRequestDiff[] {
  return pullRequests.map((pullRequest) => {
    const files = PATCHED_FILES[pullRequest.number];
    if (files === undefined) throw new Error(`no patched files for the pull request ${pullRequest.number}`);
    return diffOf(pullRequest.number, files, { baseSha: mergeSha(pullRequest.number - 1), headSha: pullRequest.headSha, readAt: clock.minutesAgo(DIFF_READ_MINUTES_AGO) });
  });
}
