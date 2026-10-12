import type { AuditView } from '../../../contract/index.ts';
import { JORDAN, SAM } from '../people.ts';
import { ledgerLinks } from '../forge-links.ts';
import type { AuditSeed } from '../seeds.ts';
import { auditView } from '../seeds.ts';
import { days, type FixtureClock } from '../time.ts';
import { DIRECT_PUSH_SHA, OUTSIDE_PULL_REQUEST, RELEASE, RUN, SKIP_ZERO_LINES_SHA } from './ids.ts';

export const PYTEST_BUMP_MESSAGE = 'build(deps): bump pytest to 8.4.2';
export const SKIP_ZERO_LINES_MESSAGE = `fix(billing): skip zero-amount lines when summing an invoice (#${OUTSIDE_PULL_REQUEST.skipZeroLines})`;

const audit = (seed: AuditSeed): AuditView => auditView(seed, ledgerLinks);

export function ledgerAudits(clock: FixtureClock): AuditView[] {
  return [
    audit({
      id: SKIP_ZERO_LINES_SHA,
      commitSha: SKIP_ZERO_LINES_SHA,
      reason: 'branch-not-factory',
      commitMessage: SKIP_ZERO_LINES_MESSAGE,
      authorLogin: JORDAN.login,
      pullRequestNumber: OUTSIDE_PULL_REQUEST.skipZeroLines,
      branch: 'jlee/skip-zero-lines',
      state: 'rewrite',
      detectedAt: clock.minutesAgo(days(7) - 15),
      changedFiles: ['src/ledger/billing/invoice_service.py', 'tests/test_invoice_service.py'],
      suggestedType: null,
      releaseId: RELEASE.fourth,
      conclusion: {
        runId: RUN.auditSkipZeroLines,
        summary: 'Dropping zero-amount lines changes the line numbering of issued invoices, which the numbering rules forbid, and no test pins the numbering.',
        findings: [
          { level: 'intent', statement: 'An issued invoice must keep the numbering of its lines; the change renumbers them when a line is zero.', evidence: 'src/ledger/billing/invoice_service.py:212 filters the lines before they are numbered.' },
          { level: 'method', statement: 'No test covers an invoice with a zero-amount line.', evidence: 'tests/test_invoice_service.py has no case with a zero amount.' },
        ],
        proposedFix: 'Keep zero-amount lines out of the total but not out of the numbering, and add a test with a zero-amount line.',
      },
      draft: {
        title: 'Keep the numbering of invoice lines when a line has no amount',
        body: '## Need\nZero-amount lines are filtered before numbering, so the lines of an issued invoice are renumbered.\n\n## Acceptance criteria\n1. A zero-amount line keeps its number and adds nothing to the total.\n2. A test covers an invoice with a zero-amount line.\n\n## Expected proof\nA unit test of an invoice with a zero-amount line.',
      },
    }),
    audit({
      id: DIRECT_PUSH_SHA,
      commitSha: DIRECT_PUSH_SHA,
      reason: 'direct-push',
      commitMessage: PYTEST_BUMP_MESSAGE,
      authorLogin: SAM.login,
      state: 'keep',
      detectedAt: clock.minutesAgo(days(12)),
      changedFiles: ['pyproject.toml', 'uv.lock'],
      suggestedType: null,
      releaseId: RELEASE.fourth,
      conclusion: {
        runId: RUN.auditPytestBump,
        summary: 'The change updates a development dependency only; the test suite passes unchanged.',
        findings: [],
        proposedFix: null,
      },
    }),
  ];
}
