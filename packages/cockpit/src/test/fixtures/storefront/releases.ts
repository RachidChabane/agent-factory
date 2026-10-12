import type { AuditView, PullRequestView, ReleaseView } from '../../../contract/index.ts';
import { actionsRunUrl } from '../forge-links.ts';
import { DEPENDENCY_BOT_LOGIN, JORDAN, OPERATOR, RILEY, SAM } from '../people.ts';
import { releaseFrom, type ReleaseCommitSeed, type ReleaseSpec } from '../release-build.ts';
import { days, hours, type FixtureClock } from '../time.ts';
import {
  API_REFERENCE_RESYNC_MESSAGE,
  DEPENDENCY_AUTOMATION,
  DOCS_AUTOMATION,
  DOUBLE_SUBMIT_MESSAGE,
  FOOTER_LINKS_MESSAGE,
  HTTP_CLIENT_BUMP_MESSAGE,
  LOCKFILE_REFRESH_MESSAGE,
  PROMO_BANNER_MESSAGE,
} from './audits.ts';
import { HOMEPAGE_CHECK, PRODUCTION_WORKFLOW_RUN, STAGING } from './delivery.ts';
import { DIRECT_PUSH_SHA, mergeSha, OUTSIDE_PULL_REQUEST, PULL_REQUEST, RELEASE_PULL_REQUEST, RELEASE } from './ids.ts';

const UNKNOWN_AUTHOR = null;

const FACTORY_MESSAGE: Readonly<Record<number, string>> = {
  [PULL_REQUEST.localSetupDocs]: `docs: document the local development setup (#${PULL_REQUEST.localSetupDocs})`,
  [PULL_REQUEST.ciPackageCache]: `ci: cache the package store between CI runs (#${PULL_REQUEST.ciPackageCache})`,
  [PULL_REQUEST.deliveryBanner]: `feat(product): show the delivery date on the product page (#${PULL_REQUEST.deliveryBanner})`,
  [PULL_REQUEST.promoRounding]: `fix(promo): round promo code discounts to the cent (#${PULL_REQUEST.promoRounding})`,
  [PULL_REQUEST.cartBadgeSync]: `fix(cart): keep the cart badge in sync after removing a line (#${PULL_REQUEST.cartBadgeSync})`,
  [PULL_REQUEST.orderHistoryPagination]: `feat(orders): paginate the order history endpoint (#${PULL_REQUEST.orderHistoryPagination})`,
};

function factoryMerge(pullRequest: number, message?: string): ReleaseCommitSeed {
  const text = message ?? FACTORY_MESSAGE[pullRequest];
  if (text === undefined) throw new Error(`no commit message for the pull request ${pullRequest}`);
  return { sha: mergeSha(pullRequest), message: text, author: OPERATOR.login, pullRequestNumber: pullRequest, attribution: 'factory-merge', automation: null };
}

function automation(pullRequest: number, message: string, name: string, author: string | null): ReleaseCommitSeed {
  return { sha: mergeSha(pullRequest), message, author, pullRequestNumber: pullRequest, attribution: 'automation', automation: name };
}

function audited(sha: string, message: string, author: string, pullRequest: number | null): ReleaseCommitSeed {
  return { sha, message, author, pullRequestNumber: pullRequest, attribution: 'audit', automation: null };
}

const ROUTER_BUMP = automation(OUTSIDE_PULL_REQUEST.routerBump, `build(deps): bump react-router from 7.17.2 to 7.18.4 (#${OUTSIDE_PULL_REQUEST.routerBump})`, DEPENDENCY_AUTOMATION, DEPENDENCY_BOT_LOGIN);
const API_REFERENCE_SYNC = automation(OUTSIDE_PULL_REQUEST.apiReferenceSync, `docs: sync the API reference from the OpenAPI schema (#${OUTSIDE_PULL_REQUEST.apiReferenceSync})`, DOCS_AUTOMATION, UNKNOWN_AUTHOR);
const ZOD_BUMP = automation(OUTSIDE_PULL_REQUEST.zodBump, `build(deps): bump zod from 4.1.5 to 4.1.11 (#${OUTSIDE_PULL_REQUEST.zodBump})`, DEPENDENCY_AUTOMATION, DEPENDENCY_BOT_LOGIN);
const VITE_BUMP = automation(OUTSIDE_PULL_REQUEST.viteBump, `build(deps-dev): bump vite from 7.1.2 to 7.3.7 (#${OUTSIDE_PULL_REQUEST.viteBump})`, DEPENDENCY_AUTOMATION, DEPENDENCY_BOT_LOGIN);
const API_REFERENCE_RESYNC = automation(OUTSIDE_PULL_REQUEST.apiReferenceResync, API_REFERENCE_RESYNC_MESSAGE, DOCS_AUTOMATION, UNKNOWN_AUTHOR);

function homepage(passed: boolean, detail: string) {
  return { environment: STAGING, name: HOMEPAGE_CHECK, passed, detail };
}

function releaseSpecs(clock: FixtureClock): ReleaseSpec[] {
  const ago = (minutes: number): string => clock.minutesAgo(minutes);
  const tagged = { source: 'tag', pullRequestNumber: null, supersededBy: null } as const;
  return [
    {
      id: RELEASE.nextMinor,
      state: 'open',
      source: 'pull-request',
      ref: 'main',
      title: 'chore(main): release 1.9.0',
      pullRequestNumber: RELEASE_PULL_REQUEST.nextMinor,
      createdAt: ago(days(5)),
      detectedAt: ago(days(2)),
      cutAt: null,
      promotedAt: null,
      verifiedAt: null,
      supersededBy: null,
      commits: [
        factoryMerge(PULL_REQUEST.orderHistoryPagination),
        audited(mergeSha(OUTSIDE_PULL_REQUEST.lockfileRefresh), LOCKFILE_REFRESH_MESSAGE, DEPENDENCY_BOT_LOGIN, OUTSIDE_PULL_REQUEST.lockfileRefresh),
        API_REFERENCE_RESYNC,
        factoryMerge(PULL_REQUEST.cartBadgeSync),
      ],
      evaluatedAt: ago(10),
      health: [homepage(false, '503 Service Unavailable after 5 s')],
      productionWorkflowUrl: null,
    },
    {
      ...tagged,
      id: RELEASE.oneEightThree,
      state: 'auditing',
      ref: RELEASE.oneEightThree,
      title: RELEASE.oneEightThree,
      createdAt: ago(205),
      detectedAt: ago(180),
      cutAt: ago(180),
      promotedAt: null,
      verifiedAt: null,
      commits: [factoryMerge(PULL_REQUEST.promoRounding), VITE_BUMP, audited(mergeSha(OUTSIDE_PULL_REQUEST.promoBannerCopy), PROMO_BANNER_MESSAGE, RILEY.login, OUTSIDE_PULL_REQUEST.promoBannerCopy)],
      evaluatedAt: null,
      health: [],
      productionWorkflowUrl: null,
    },
    {
      ...tagged,
      id: RELEASE.oneEightTwo,
      state: 'blocked',
      ref: RELEASE.oneEightTwo,
      title: RELEASE.oneEightTwo,
      createdAt: ago(hours(26) + 20),
      detectedAt: ago(hours(26)),
      cutAt: ago(hours(26)),
      promotedAt: null,
      verifiedAt: null,
      commits: [
        factoryMerge(PULL_REQUEST.deliveryBanner),
        audited(DIRECT_PUSH_SHA, DOUBLE_SUBMIT_MESSAGE, SAM.login, null),
        ZOD_BUMP,
        audited(mergeSha(OUTSIDE_PULL_REQUEST.footerLinks), FOOTER_LINKS_MESSAGE, JORDAN.login, OUTSIDE_PULL_REQUEST.footerLinks),
      ],
      evaluatedAt: ago(1_538),
      health: [homepage(false, '503 Service Unavailable after 5 s')],
      productionWorkflowUrl: null,
    },
    {
      ...tagged,
      id: RELEASE.oneEightOne,
      state: 'promotable',
      ref: RELEASE.oneEightOne,
      title: RELEASE.oneEightOne,
      createdAt: ago(days(4) + 35),
      detectedAt: ago(days(4)),
      cutAt: ago(days(4)),
      promotedAt: null,
      verifiedAt: null,
      commits: [factoryMerge(PULL_REQUEST.ciPackageCache), API_REFERENCE_SYNC],
      evaluatedAt: ago(days(4) - 31),
      health: [homepage(true, '200 OK in 244 ms')],
      productionWorkflowUrl: null,
    },
    {
      ...tagged,
      id: RELEASE.oneEight,
      state: 'promoted',
      ref: RELEASE.oneEight,
      title: RELEASE.oneEight,
      createdAt: ago(days(6) + 40),
      detectedAt: ago(days(6)),
      cutAt: ago(days(6)),
      promotedAt: ago(days(2)),
      verifiedAt: null,
      commits: [factoryMerge(PULL_REQUEST.httpClientBump, HTTP_CLIENT_BUMP_MESSAGE)],
      evaluatedAt: ago(days(6) - 25),
      health: [homepage(true, '200 OK in 231 ms')],
      productionWorkflowUrl: actionsRunUrl(PRODUCTION_WORKFLOW_RUN.oneEight),
    },
    {
      id: RELEASE.supersededOneEight,
      state: 'open',
      source: 'pull-request',
      ref: 'main',
      title: 'chore(main): release 1.8.0',
      pullRequestNumber: RELEASE_PULL_REQUEST.supersededOneEight,
      createdAt: ago(days(13)),
      detectedAt: ago(days(13)),
      cutAt: null,
      promotedAt: null,
      verifiedAt: null,
      supersededBy: RELEASE.oneEight,
      commits: [],
      evaluatedAt: null,
      health: [],
      productionWorkflowUrl: null,
    },
    {
      ...tagged,
      id: RELEASE.oneSeven,
      state: 'verified',
      ref: RELEASE.oneSeven,
      title: RELEASE.oneSeven,
      createdAt: null,
      detectedAt: ago(days(22)),
      cutAt: ago(days(22)),
      promotedAt: ago(days(21)),
      verifiedAt: ago(days(20)),
      commits: [factoryMerge(PULL_REQUEST.localSetupDocs), ROUTER_BUMP],
      evaluatedAt: ago(days(22) - 40),
      health: [homepage(true, '200 OK in 226 ms')],
      productionWorkflowUrl: actionsRunUrl(PRODUCTION_WORKFLOW_RUN.oneSeven),
    },
  ];
}

export function storefrontReleases(clock: FixtureClock, audits: readonly AuditView[], pullRequests: readonly PullRequestView[]): ReleaseView[] {
  return releaseSpecs(clock).map((spec) => releaseFrom(spec, { audits, pullRequests, healthRequired: true }));
}
