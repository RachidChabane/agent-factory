import type { AuditView, SkippedChangeView } from '../../../contract/index.ts';
import { DEPENDENCY_BOT_LOGIN, JORDAN, OPERATOR, RILEY, SAM } from '../people.ts';
import { storefrontLinks } from '../forge-links.ts';
import type { AuditSeed } from '../seeds.ts';
import { auditView } from '../seeds.ts';
import { days, hours, type FixtureClock } from '../time.ts';
import {
  FOOTER_LINKS_CONCLUSION,
  HTTP_CLIENT_BUMP_CONCLUSION,
  HTTP_CLIENT_BUMP_DRAFT,
  PROMO_BANNER_COPY_CONCLUSION,
  PROMO_BANNER_COPY_DRAFT,
} from './audit-conclusions.ts';
import { DIRECT_PUSH_SHA, ISSUE, issueBranch, mergeSha, OUTSIDE_PULL_REQUEST, PULL_REQUEST, RELEASE } from './ids.ts';

export const DEPENDENCY_AUTOMATION = 'dependency-updates';
export const DOCS_AUTOMATION = 'docs-sync';

export const DOUBLE_SUBMIT_MESSAGE = 'fix(checkout): stop the payment form from submitting twice';
export const LOCKFILE_REFRESH_MESSAGE = `build(deps): refresh the lockfile (#${OUTSIDE_PULL_REQUEST.lockfileRefresh})`;
export const FOOTER_LINKS_MESSAGE = `fix(footer): point the delivery and returns links at the new help pages (#${OUTSIDE_PULL_REQUEST.footerLinks})`;
export const PROMO_BANNER_MESSAGE = `feat(cart): announce 20% off everything on the promo banner (#${OUTSIDE_PULL_REQUEST.promoBannerCopy})`;
export const HTTP_CLIENT_BUMP_MESSAGE = `build(deps): update the HTTP client to its latest minor release (#${PULL_REQUEST.httpClientBump})`;
export const API_REFERENCE_RESYNC_MESSAGE = `docs: sync the API reference from the OpenAPI schema (#${OUTSIDE_PULL_REQUEST.apiReferenceResync})`;

export const DOUBLE_SUBMIT_AUDIT_MINUTES_AGO = 1_828;
/** The auditor run of the double submit timed out this long after the change was detected. */
export const AUDITOR_TIMEOUT_MINUTES = 25;
export const PROMO_BANNER_CONCLUDED_MINUTES_AGO = 1_160;
export const HTTP_CLIENT_RESOLVED_MINUTES_AGO = days(7);

const audit = (seed: AuditSeed): AuditView => auditView(seed, storefrontLinks);

export function storefrontAudits(clock: FixtureClock): AuditView[] {
  const ago = (minutes: number): string => clock.minutesAgo(minutes);
  return [
    audit({
      id: DIRECT_PUSH_SHA,
      commitSha: DIRECT_PUSH_SHA,
      reason: 'direct-push',
      commitMessage: DOUBLE_SUBMIT_MESSAGE,
      authorLogin: SAM.login,
      state: 'auditing',
      detectedAt: ago(DOUBLE_SUBMIT_AUDIT_MINUTES_AGO),
      changedFiles: ['web/src/checkout/PaymentForm.tsx', 'web/src/checkout/PaymentForm.test.tsx'],
      suggestedType: null,
      releaseId: RELEASE.oneEightTwo,
      failureCount: 1,
      lastFailure: 'The auditor run ended with outcome timeout after 25 minutes.',
      lastFailureAt: ago(DOUBLE_SUBMIT_AUDIT_MINUTES_AGO - AUDITOR_TIMEOUT_MINUTES),
    }),
    audit({
      id: mergeSha(OUTSIDE_PULL_REQUEST.lockfileRefresh),
      commitSha: mergeSha(OUTSIDE_PULL_REQUEST.lockfileRefresh),
      reason: 'bot-author',
      commitMessage: LOCKFILE_REFRESH_MESSAGE,
      authorLogin: DEPENDENCY_BOT_LOGIN,
      pullRequestNumber: OUTSIDE_PULL_REQUEST.lockfileRefresh,
      branch: 'chore/refresh-lockfile',
      state: 'detected',
      detectedAt: ago(50),
      changedFiles: null,
      suggestedType: null,
      releaseId: RELEASE.nextMinor,
    }),
    audit({
      id: mergeSha(OUTSIDE_PULL_REQUEST.footerLinks),
      commitSha: mergeSha(OUTSIDE_PULL_REQUEST.footerLinks),
      reason: 'branch-not-factory',
      commitMessage: FOOTER_LINKS_MESSAGE,
      authorLogin: JORDAN.login,
      pullRequestNumber: OUTSIDE_PULL_REQUEST.footerLinks,
      branch: 'jlee/footer-links',
      state: 'keep',
      detectedAt: ago(days(3) + hours(4)),
      changedFiles: ['docs/help/returns.md', 'web/src/layout/Footer.tsx'],
      suggestedType: 'docs',
      releaseId: RELEASE.oneEightTwo,
      conclusion: FOOTER_LINKS_CONCLUSION,
      concludedAt: ago(days(3) + hours(3)),
    }),
    audit({
      id: mergeSha(OUTSIDE_PULL_REQUEST.promoBannerCopy),
      commitSha: mergeSha(OUTSIDE_PULL_REQUEST.promoBannerCopy),
      reason: 'missing-factory-label',
      commitMessage: PROMO_BANNER_MESSAGE,
      authorLogin: RILEY.login,
      pullRequestNumber: OUTSIDE_PULL_REQUEST.promoBannerCopy,
      branch: 'factory/promo-banner-copy',
      state: 'challenge',
      detectedAt: ago(1_190),
      changedFiles: ['web/src/cart/PromoBanner.tsx', 'web/src/cart/promo-banner.test.tsx'],
      suggestedType: null,
      releaseId: RELEASE.oneEightThree,
      conclusion: PROMO_BANNER_COPY_CONCLUSION,
      concludedAt: ago(PROMO_BANNER_CONCLUDED_MINUTES_AGO),
      draft: PROMO_BANNER_COPY_DRAFT,
    }),
    audit({
      id: mergeSha(PULL_REQUEST.httpClientBump),
      commitSha: mergeSha(PULL_REQUEST.httpClientBump),
      reason: 'on-demand',
      commitMessage: HTTP_CLIENT_BUMP_MESSAGE,
      authorLogin: OPERATOR.login,
      pullRequestNumber: PULL_REQUEST.httpClientBump,
      branch: issueBranch(ISSUE.httpClientBump),
      state: 'rewrite',
      detectedAt: ago(days(9)),
      changedFiles: ['package.json', 'pnpm-lock.yaml', 'api/src/http/client.ts'],
      suggestedType: 'dependencies',
      releaseId: RELEASE.oneEight,
      conclusion: HTTP_CLIENT_BUMP_CONCLUSION,
      concludedAt: ago(days(9) - hours(1)),
      draft: HTTP_CLIENT_BUMP_DRAFT,
      publishedIssueNumber: ISSUE.httpTimeoutRegression,
      publishedIssueAt: ago(days(8)),
      resolved: true,
      resolutionNote: 'The timeout is now set explicitly in the checkout configuration. Issue #75 tracks the regression test.',
      resolvedAt: ago(HTTP_CLIENT_RESOLVED_MINUTES_AGO),
    }),
    audit({
      id: mergeSha(OUTSIDE_PULL_REQUEST.apiReferenceResync),
      commitSha: mergeSha(OUTSIDE_PULL_REQUEST.apiReferenceResync),
      reason: 'on-demand',
      commitMessage: API_REFERENCE_RESYNC_MESSAGE,
      pullRequestNumber: OUTSIDE_PULL_REQUEST.apiReferenceResync,
      branch: 'docs-sync/2026-10-12',
      state: 'detected',
      detectedAt: ago(20),
      changedFiles: null,
      suggestedType: null,
      releaseId: RELEASE.nextMinor,
    }),
  ];
}

interface SkippedSeed {
  readonly pullRequest: number;
  readonly automation: string;
  readonly message: string;
  readonly author: string | null;
  readonly branch: string;
  readonly minutesAgo: number;
}

export function storefrontSkippedChanges(clock: FixtureClock): SkippedChangeView[] {
  const skipped = (seed: SkippedSeed): SkippedChangeView => ({
    commitSha: mergeSha(seed.pullRequest),
    automation: seed.automation,
    commitMessage: seed.message,
    authorLogin: seed.author,
    pullRequestNumber: seed.pullRequest,
    pullRequestUrl: storefrontLinks.pullRequest(seed.pullRequest),
    branch: seed.branch,
    recordedAt: clock.minutesAgo(seed.minutesAgo),
  });
  return [
    skipped({ pullRequest: OUTSIDE_PULL_REQUEST.apiReferenceResync, automation: DOCS_AUTOMATION, message: API_REFERENCE_RESYNC_MESSAGE, author: null, branch: 'docs-sync/2026-10-12', minutesAgo: 120 }),
    skipped({ pullRequest: OUTSIDE_PULL_REQUEST.viteBump, automation: DEPENDENCY_AUTOMATION, message: `build(deps-dev): bump vite from 7.1.2 to 7.3.7 (#${OUTSIDE_PULL_REQUEST.viteBump})`, author: DEPENDENCY_BOT_LOGIN, branch: 'dependency-bot/npm/vite-7.3.7', minutesAgo: hours(14) }),
    skipped({ pullRequest: OUTSIDE_PULL_REQUEST.zodBump, automation: DEPENDENCY_AUTOMATION, message: `build(deps): bump zod from 4.1.5 to 4.1.11 (#${OUTSIDE_PULL_REQUEST.zodBump})`, author: DEPENDENCY_BOT_LOGIN, branch: 'dependency-bot/npm/zod-4.1.11', minutesAgo: days(3) + hours(2) }),
    skipped({ pullRequest: OUTSIDE_PULL_REQUEST.apiReferenceSync, automation: DOCS_AUTOMATION, message: `docs: sync the API reference from the OpenAPI schema (#${OUTSIDE_PULL_REQUEST.apiReferenceSync})`, author: null, branch: 'docs-sync/2026-10-07', minutesAgo: days(5) + hours(2) }),
    skipped({ pullRequest: OUTSIDE_PULL_REQUEST.routerBump, automation: DEPENDENCY_AUTOMATION, message: `build(deps): bump react-router from 7.17.2 to 7.18.4 (#${OUTSIDE_PULL_REQUEST.routerBump})`, author: DEPENDENCY_BOT_LOGIN, branch: 'dependency-bot/npm/react-router-7.18.4', minutesAgo: days(24) }),
  ];
}
