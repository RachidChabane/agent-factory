import type { AuditView, PullRequestView, ReleaseView } from '../../../contract/index.ts';
import { JORDAN, OPERATOR, SAM } from '../people.ts';
import { releaseFrom, type ReleaseCommitSeed, type ReleaseSpec } from '../release-build.ts';
import { days, type FixtureClock } from '../time.ts';
import { PYTEST_BUMP_MESSAGE, SKIP_ZERO_LINES_MESSAGE } from './audits.ts';
import { DIRECT_PUSH_SHA, OUTSIDE_PULL_REQUEST, PULL_REQUEST, RELEASE, SKIP_ZERO_LINES_SHA, mergeSha } from './ids.ts';

function factoryMerge(pullRequest: number, message: string): ReleaseCommitSeed {
  return { sha: mergeSha(pullRequest), message, author: OPERATOR.login, pullRequestNumber: pullRequest, attribution: 'factory-merge', automation: null };
}

function releaseSpecs(clock: FixtureClock): ReleaseSpec[] {
  const ago = (minutes: number): string => clock.minutesAgo(minutes);
  const tagged = { source: 'tag', pullRequestNumber: null, supersededBy: null, promotedAt: null, verifiedAt: null, evaluatedAt: null, health: [], productionWorkflowUrl: null } as const;
  return [
    {
      ...tagged,
      id: RELEASE.fifth,
      state: 'cut',
      ref: RELEASE.fifth,
      title: RELEASE.fifth,
      createdAt: ago(45),
      detectedAt: ago(40),
      cutAt: ago(40),
      commits: [],
    },
    {
      ...tagged,
      id: RELEASE.fourth,
      state: 'auditing',
      ref: RELEASE.fourth,
      title: RELEASE.fourth,
      createdAt: ago(days(6) + 30),
      detectedAt: ago(days(6)),
      cutAt: ago(days(6)),
      commits: [
        factoryMerge(PULL_REQUEST.paymentIdempotencyKey, `feat(payments): accept an idempotency key on payment creation (#${PULL_REQUEST.paymentIdempotencyKey})`),
        { sha: SKIP_ZERO_LINES_SHA, message: SKIP_ZERO_LINES_MESSAGE, author: JORDAN.login, pullRequestNumber: OUTSIDE_PULL_REQUEST.skipZeroLines, attribution: 'audit', automation: null },
        { sha: DIRECT_PUSH_SHA, message: PYTEST_BUMP_MESSAGE, author: SAM.login, pullRequestNumber: null, attribution: 'audit', automation: null },
        factoryMerge(PULL_REQUEST.invoiceLifecycleDocs, `docs: document the invoice lifecycle (#${PULL_REQUEST.invoiceLifecycleDocs})`),
      ],
    },
  ];
}

export function ledgerReleases(clock: FixtureClock, audits: readonly AuditView[], pullRequests: readonly PullRequestView[]): ReleaseView[] {
  return releaseSpecs(clock).map((spec) => releaseFrom(spec, { audits, pullRequests, healthRequired: false }));
}
