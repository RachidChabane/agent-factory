import type { AgentRole } from '@agent-factory/domain';
import type { AgentRunOutcome, RunStatus } from '../../contract/index.ts';
import { ACCOUNT_PERSONAL, ACCOUNT_SHARED } from './people.ts';
import { LEDGER_ID } from './project-ids.ts';
import type { RunSpec } from './run-spec.ts';
import { days, hours } from './time.ts';
import { DIRECT_PUSH_SHA, ISSUE, issueBranch, REQUEST, RUN, SKIP_ZERO_LINES_SHA } from './ledger/ids.ts';

interface Timing {
  readonly startedMinutesAgo: number;
  readonly durationMinutes: number | null;
}

interface Result {
  readonly status: RunStatus;
  readonly outcome: AgentRunOutcome | null;
}

const SUCCEEDED: Result = { status: 'succeeded', outcome: 'success' };

type Extras = Partial<Pick<RunSpec, 'account' | 'resumed'>>;

function timing(startedMinutesAgo: number, durationMinutes: number): Timing {
  return { startedMinutesAgo, durationMinutes };
}

function onIssue(id: string, role: AgentRole, issueNumber: number, attempt: number, runTiming: Timing, extras: Extras = {}): RunSpec {
  return {
    id,
    project: LEDGER_ID,
    role,
    subject: { kind: 'issue', id: String(issueNumber) },
    attempt,
    branch: issueBranch(issueNumber),
    account: ACCOUNT_PERSONAL,
    ...runTiming,
    ...SUCCEEDED,
    ...extras,
  };
}

function elsewhere(id: string, role: AgentRole, subject: RunSpec['subject'], runTiming: Timing, extras: Extras = {}): RunSpec {
  return { id, project: LEDGER_ID, role, subject, attempt: 0, branch: null, account: ACCOUNT_PERSONAL, ...runTiming, ...SUCCEEDED, ...extras };
}

export const LEDGER_RUN_SPECS: readonly RunSpec[] = [
  onIssue(RUN.invoiceLifecycleDocsImplementer, 'implementer', ISSUE.invoiceLifecycleDocs, 0, timing(days(19), 22), { account: ACCOUNT_SHARED }),
  onIssue(RUN.invoiceLifecycleDocsReview, 'reviewer', ISSUE.invoiceLifecycleDocs, 0, timing(days(19) - 30, 5), { account: ACCOUNT_SHARED }),
  onIssue(RUN.idempotencyImplementer, 'implementer', ISSUE.paymentIdempotencyKey, 0, timing(days(9) + hours(12), 41), { account: ACCOUNT_SHARED }),
  onIssue(RUN.idempotencyReview, 'reviewer', ISSUE.paymentIdempotencyKey, 0, timing(days(9) + hours(12) - 50, 7), { account: ACCOUNT_SHARED }),
  onIssue(RUN.taxRoundingImplementer, 'implementer', ISSUE.taxRoundingPerLine, 0, timing(460, 36)),
  onIssue(RUN.taxRoundingReview, 'reviewer', ISSUE.taxRoundingPerLine, 0, timing(410, 6)),
  onIssue(RUN.webhookAuthor, 'acceptance-author', ISSUE.webhookSignatures, 0, timing(3000, 15)),
  onIssue(RUN.webhookFirst, 'implementer', ISSUE.webhookSignatures, 0, timing(2900, 44)),
  onIssue(RUN.webhookSecond, 'implementer', ISSUE.webhookSignatures, 1, timing(2840, 19), { resumed: true }),
  onIssue(RUN.webhookReview, 'reviewer', ISSUE.webhookSignatures, 0, timing(2800, 8)),
  onIssue(RUN.invoiceServiceSplitImplementer, 'implementer', ISSUE.invoiceServiceSplit, 0, timing(360, 52)),
  onIssue(RUN.paymentRetriesAuthor, 'acceptance-author', ISSUE.paymentRetries, 0, timing(4000, 17)),
  onIssue(RUN.paymentRetriesImplementer, 'implementer', ISSUE.paymentRetries, 0, timing(280, 42)),
  onIssue(RUN.paymentRetriesReview, 'reviewer', ISSUE.paymentRetries, 0, timing(225, 7)),
  onIssue(RUN.invoiceCsvExportAuthor, 'acceptance-author', ISSUE.invoiceCsvExport, 0, timing(205, 14)),
  elsewhere(RUN.challengeAccountantExports, 'challenger', { kind: 'request', id: REQUEST.accountantExports }, timing(days(14), 11), { account: ACCOUNT_SHARED }),
  elsewhere(RUN.challengeUsageBasedBilling, 'challenger', { kind: 'request', id: REQUEST.usageBasedBilling }, timing(1500, 9)),
  elsewhere(RUN.auditSkipZeroLines, 'auditor', { kind: 'audit', id: SKIP_ZERO_LINES_SHA }, timing(days(7) - 25, 9)),
  elsewhere(RUN.auditPytestBump, 'auditor', { kind: 'audit', id: DIRECT_PUSH_SHA }, timing(days(12), 7), { account: ACCOUNT_SHARED }),
];
