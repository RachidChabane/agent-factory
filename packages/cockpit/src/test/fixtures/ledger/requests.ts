import type { RequestView } from '../../../contract/index.ts';
import { DANA, RILEY, SAM } from '../people.ts';
import { runOf, type RunWorld } from '../runs.ts';
import { requestView } from '../seeds.ts';
import { days, type FixtureClock } from '../time.ts';
import { ACCOUNTANT_EXPORTS_CHALLENGE, USAGE_BASED_BILLING_CHALLENGE } from './challenges.ts';
import { ISSUE, REQUEST, RUN } from './ids.ts';

function endOf(runs: RunWorld, runId: string): string {
  const endedAt = runOf(runs, runId).endedAt;
  if (endedAt === null) throw new Error(`the run ${runId} has not ended`);
  return endedAt;
}

export function ledgerRequests(clock: FixtureClock, runs: RunWorld): RequestView[] {
  return [
    requestView({
      id: REQUEST.refundsByEmail,
      title: 'Send a confirmation email when a refund is issued',
      requester: RILEY.name,
      channel: 'slack',
      receivedAt: clock.minutesAgo(120),
      updatedAt: clock.minutesAgo(120),
      state: 'received',
      body: 'Customers write to ask whether their refund went through. An email with the amount and the expected delay would answer most of those messages.',
    }),
    requestView({
      id: REQUEST.usageBasedBilling,
      title: 'Bill customers by usage',
      requester: SAM.name,
      channel: 'cockpit',
      receivedAt: clock.minutesAgo(1_520),
      updatedAt: clock.minutesAgo(1_491),
      state: 'challenged',
      body: 'Two enterprise customers want to pay for what they consume instead of a flat subscription: API calls and stored documents, with tiers.',
      challenge: { runId: RUN.challengeUsageBasedBilling, completedAt: endOf(runs, RUN.challengeUsageBasedBilling), ...USAGE_BASED_BILLING_CHALLENGE },
    }),
    requestView({
      id: REQUEST.accountantExports,
      title: 'Accountants need exports and automatic payment retries',
      requester: DANA.name,
      channel: 'email',
      receivedAt: clock.minutesAgo(days(14) + 15),
      updatedAt: clock.minutesAgo(days(12)),
      state: 'accepted',
      body: 'Our accountants copy invoices into a spreadsheet every month, and failed payments have to be retried by hand. We would like a CSV export of the invoices, automatic retries of failed payments and a weekly PDF statement for customers.',
      challenge: { runId: RUN.challengeAccountantExports, completedAt: endOf(runs, RUN.challengeAccountantExports), ...ACCOUNTANT_EXPORTS_CHALLENGE },
      issueNumbers: [ISSUE.paymentRetries, ISSUE.invoiceCsvExport],
    }),
  ];
}
