import type { AutonomyView, DelegatedDecisionView, IssueView, PullRequestView, ReadyNoticeView } from '../../../contract/index.ts';
import { hours, days, type FixtureClock } from '../time.ts';
import { ISSUE, PULL_REQUEST } from './ids.ts';

const ORCHESTRATOR = 'orchestrator';

/** What the storefront delegates to its orchestrator: specs, resuming, and the documentation and fixes that its films prove. */
export const STOREFRONT_AUTONOMY: AutonomyView = {
  actor: ORCHESTRATOR,
  validateSpecs: true,
  answerDecisions: false,
  resume: true,
  merge: [
    { types: ['docs'], requires: [] },
    { types: ['fix'], requires: ['films-recorded'] },
  ],
};

/** The gestures the orchestrator made in the storefront, newest first. */
export function storefrontDelegatedDecisions(clock: FixtureClock): DelegatedDecisionView[] {
  return [
    {
      at: clock.hoursAgo(1),
      actor: ORCHESTRATOR,
      gesture: 'validate-spec',
      target: { kind: 'issue', number: ISSUE.expiredPromoMessage },
      issueNumber: ISSUE.expiredPromoMessage,
      reason: 'The spec follows the template and each criterion is checkable by the repository’s tests.',
      rule: 'autonomy.validateSpecs',
    },
    {
      at: clock.minutesAgo(hours(30)),
      actor: ORCHESTRATOR,
      gesture: 'merge',
      target: { kind: 'pull-request', number: PULL_REQUEST.localSetupDocs },
      issueNumber: ISSUE.localSetupDocs,
      reason: 'A documentation change: every criterion is proven, the review is clean and only docs/ changed.',
      rule: 'autonomy.merge for docs',
    },
    {
      at: clock.minutesAgo(days(3)),
      actor: ORCHESTRATOR,
      gesture: 'resume',
      target: { kind: 'issue', number: ISSUE.httpTimeoutRegression },
      issueNumber: ISSUE.httpTimeoutRegression,
      reason: 'The package registry timed out during the install; nothing else failed.',
      rule: 'autonomy.resume',
    },
  ];
}

/** The ready notice each pull request of the storefront has: sent with links, held by a check, held by a film, or due. */
export function storefrontReadyNotices(clock: FixtureClock): ReadonlyMap<number, ReadyNoticeView> {
  return new Map<number, ReadyNoticeView>([
    [
      PULL_REQUEST.localSetupDocs,
      { status: 'sent', sentAt: clock.minutesAgo(hours(31)), headSha: 'c0ffee0000000000000000000000000000000014', links: [], failures: [] },
    ],
    [
      PULL_REQUEST.naturalLanguageSearch,
      {
        status: 'sent',
        sentAt: clock.hoursAgo(2),
        headSha: 'bada550000000000000000000000000000000057',
        links: [
          { label: 'search-by-colour · before · film.mp4', url: 'https://files.example.com/search-by-colour/before.mp4' },
          { label: 'search-by-colour · after · film.mp4', url: 'https://files.example.com/search-by-colour/after.mp4' },
          { label: 'evidence · after · search-results.png', url: 'https://files.example.com/evidence/search-results.png' },
        ],
        failures: [{ label: 'search-by-colour · after · final.png', reason: 'the upload command exited with 3: the storage quota is spent' }],
      },
    ],
    [PULL_REQUEST.checkoutScreenReader, { status: 'held', holds: [{ kind: 'checks-running', checks: ['e2e-checkout'] }], checksReadAt: clock.minutesAgo(3) }],
    [PULL_REQUEST.expiredPromoMessage, { status: 'held', holds: [{ kind: 'films-failed', scenarios: ['expired-promo'] }], checksReadAt: clock.minutesAgo(3) }],
  ]);
}

/** Marks the issues and pull requests of the storefront with the gestures the orchestrator made on them. */
export function withDelegation(
  issues: readonly IssueView[],
  pullRequests: readonly PullRequestView[],
  decisions: readonly DelegatedDecisionView[],
  notices: ReadonlyMap<number, ReadyNoticeView>,
): { readonly issues: IssueView[]; readonly pullRequests: PullRequestView[] } {
  return {
    issues: issues.map((issue) => ({ ...issue, delegated: decisions.filter((decision) => decision.issueNumber === issue.number) })),
    pullRequests: pullRequests.map((pullRequest) => ({
      ...pullRequest,
      readyNotice: notices.get(pullRequest.number) ?? pullRequest.readyNotice,
      delegated: decisions.filter((decision) => decision.target.kind === 'pull-request' && decision.target.number === pullRequest.number),
    })),
  };
}
