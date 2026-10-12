import type { DeliveredCommit, Deployment, DeploymentOutcome, EnvironmentView, HealthCheckView, HealthSample, WorkflowRun } from '../../../contract/index.ts';
import { actionsRunUrl, workflowUrl } from '../forge-links.ts';
import { ACTIONS_BOT_LOGIN, DANA, OPERATOR, RILEY } from '../people.ts';
import { failedAfter, readOn } from '../readings.ts';
import { environmentView } from '../seeds.ts';
import { days, hours, seededRandom, SECOND_MS, type FixtureClock } from '../time.ts';
import { ISSUE, mergeSha, PULL_REQUEST, OUTSIDE_PULL_REQUEST, RELEASE, TAG_SHA, headSha } from './ids.ts';

const SHORT_SHA_LENGTH = 7;
const SAMPLES_PER_DAY = 24;
const SERVICE_UNAVAILABLE = 503;
const OK_STATUS = 200;
const TIMEOUT_LATENCY_MS = 5_000;

const DEVELOPMENT = 'development';
export const STAGING = 'staging';
export const HOMEPAGE_CHECK = 'homepage';
const PRODUCTION = 'production';

export const PRODUCTION_WORKFLOW_RUN = { oneSeven: '9073340918', oneEight: '9111420685' } as const;

export const HEALTH_URL = {
  development: 'https://dev.storefront.example.com/healthz',
  stagingHomepage: 'https://staging.storefront.example.com/',
  stagingCheckout: 'https://staging.storefront.example.com/api/checkout/health',
  productionHomepage: 'https://storefront.example.com/',
} as const;

interface SeriesPlan {
  readonly newestMinutesAgo: number;
  readonly seed: number;
  readonly baseLatencyMs: number;
  /** How many hours before the newest sample the failing samples were taken. */
  readonly failedHoursBack: readonly number[];
}

function healthSeries(clock: FixtureClock, plan: SeriesPlan): HealthSample[] {
  const random = seededRandom(plan.seed);
  return Array.from({ length: SAMPLES_PER_DAY }, (_, index) => {
    const hoursBack = SAMPLES_PER_DAY - 1 - index;
    const at = clock.minutesAgo(plan.newestMinutesAgo + hours(hoursBack));
    if (plan.failedHoursBack.includes(hoursBack)) {
      return { at, ok: false, statusCode: SERVICE_UNAVAILABLE, latencyMs: TIMEOUT_LATENCY_MS, detail: 'Service Unavailable' };
    }
    return { at, ok: true, statusCode: OK_STATUS, latencyMs: Math.round(plan.baseLatencyMs * (1 + random() * 0.6)), detail: '200 OK' };
  });
}

function checkOf(name: string, url: string, series: readonly HealthSample[]): HealthCheckView {
  return { name, url, latest: series.at(-1) ?? null, series: [...series] };
}

/** The commits the base branch received as squash merges, by pull request: what a deployment can bring. */
const SHIPPED = {
  orderHistoryPagination: { pullRequest: PULL_REQUEST.orderHistoryPagination, issue: ISSUE.orderHistoryPagination, headline: 'feat(orders): paginate the order history endpoint (#44)', author: 'Example Factory', minutesAgo: 15 },
  cartBadgeSync: { pullRequest: PULL_REQUEST.cartBadgeSync, issue: ISSUE.cartBadgeSync, headline: 'fix(cart): keep the cart badge in sync after removing a line (#39)', author: 'Example Factory', minutesAgo: days(1) },
  promoRounding: { pullRequest: PULL_REQUEST.promoRounding, issue: ISSUE.promoRounding, headline: 'fix(cart): round promo code discounts to the cent (#34)', author: 'Example Factory', minutesAgo: days(3) },
  lockfileRefresh: { pullRequest: OUTSIDE_PULL_REQUEST.lockfileRefresh, issue: null, headline: 'chore(deps): refresh the lockfile (#54)', author: 'dependency-bot[bot]', minutesAgo: hours(1) },
  apiReferenceResync: { pullRequest: OUTSIDE_PULL_REQUEST.apiReferenceResync, issue: null, headline: 'docs: resynchronise the API reference (#56)', author: RILEY.name, minutesAgo: hours(2) },
  viteBump: { pullRequest: OUTSIDE_PULL_REQUEST.viteBump, issue: null, headline: 'chore(deps): bump vite to its latest minor release (#46)', author: 'dependency-bot[bot]', minutesAgo: days(4) },
  footerLinks: { pullRequest: OUTSIDE_PULL_REQUEST.footerLinks, issue: null, headline: 'feat(footer): link the returns policy (#42)', author: DANA.name, minutesAgo: days(6) },
  zodBump: { pullRequest: OUTSIDE_PULL_REQUEST.zodBump, issue: null, headline: 'chore(deps): bump zod (#43)', author: 'dependency-bot[bot]', minutesAgo: days(6) },
} as const;

function shipped(clock: FixtureClock, key: keyof typeof SHIPPED): DeliveredCommit {
  const change = SHIPPED[key];
  return {
    sha: mergeSha(change.pullRequest),
    headline: change.headline,
    author: change.author,
    committedAt: clock.minutesAgo(change.minutesAgo),
    pullRequestNumber: change.pullRequest,
    issueNumber: change.issue,
  };
}

interface DeploymentSeed {
  readonly id: string;
  readonly ref: string;
  readonly sha: string;
  readonly minutesAgo: number;
  readonly outcome: DeploymentOutcome;
  readonly actor: string | null;
  readonly runId: string | null;
  readonly changes: readonly DeliveredCommit[] | null;
  readonly tag?: boolean;
}

function deploymentOf(clock: FixtureClock, seed: DeploymentSeed): Deployment {
  return {
    id: seed.id,
    version: seed.tag === true ? seed.ref : seed.sha.slice(0, SHORT_SHA_LENGTH),
    ref: seed.ref,
    sha: seed.sha,
    deployedAt: clock.minutesAgo(seed.minutesAgo),
    actor: seed.actor,
    outcome: seed.outcome,
    workflowUrl: seed.runId === null ? null : actionsRunUrl(seed.runId),
    changes: seed.changes === null ? null : [...seed.changes],
  };
}

type DeploymentReading = { current: Deployment; history: Deployment[]; pending: DeliveredCommit[] | null };

function developmentDeployments(clock: FixtureClock): DeploymentReading {
  const branch = (id: string, pullRequest: number, minutesAgo: number, outcome: DeploymentOutcome, runId: string, changes: readonly DeliveredCommit[] | null): Deployment =>
    deploymentOf(clock, { id, ref: 'main', sha: mergeSha(pullRequest), minutesAgo, outcome, actor: ACTIONS_BOT_LOGIN, runId, changes });
  const history = [
    branch('1204518', PULL_REQUEST.orderHistoryPagination, 15, 'in-progress', '9120446281', [shipped(clock, 'orderHistoryPagination')]),
    branch('1204512', OUTSIDE_PULL_REQUEST.lockfileRefresh, 48, 'success', '9120201733', [shipped(clock, 'apiReferenceResync'), shipped(clock, 'lockfileRefresh')]),
    branch('1204507', OUTSIDE_PULL_REQUEST.apiReferenceResync, 118, 'success', '9119887410', [shipped(clock, 'cartBadgeSync')]),
    branch('1204499', PULL_REQUEST.cartBadgeSync, 148, 'success', '9119652208', [shipped(clock, 'promoRounding')]),
    branch('1204481', PULL_REQUEST.promoRounding, 296, 'success', '9118745093', [shipped(clock, 'viteBump')]),
    branch('1204478', PULL_REQUEST.promoRounding, 298, 'failure', '9118733816', [shipped(clock, 'viteBump')]),
    branch('1204402', OUTSIDE_PULL_REQUEST.viteBump, 838, 'success', '9116402957', null),
  ];
  const current = history[1];
  if (current === undefined) throw new Error('the development history is empty');
  return { current, history, pending: [shipped(clock, 'orderHistoryPagination')] };
}

function stagingDeployments(clock: FixtureClock): DeploymentReading {
  const tag = (id: string, ref: string, sha: string, minutesAgo: number, outcome: DeploymentOutcome, runId: string, changes: readonly DeliveredCommit[] | null, actor: string | null = OPERATOR.login): Deployment =>
    deploymentOf(clock, { id, ref, sha, minutesAgo, outcome, actor, runId, changes, tag: true });
  const history = [
    tag('1203911', RELEASE.oneEightTwo, TAG_SHA.oneEightTwo, hours(22), 'success', '9114023388', [shipped(clock, 'cartBadgeSync'), shipped(clock, 'lockfileRefresh')]),
    tag('1203544', RELEASE.oneEightOne, TAG_SHA.oneEightOne, days(3), 'success', '9109553021', [shipped(clock, 'promoRounding')]),
    tag('1203538', RELEASE.oneEightOne, TAG_SHA.oneEightOne, days(3) + hours(1), 'failure', '9109498745', [shipped(clock, 'promoRounding')]),
    tag('1203102', RELEASE.oneEight, TAG_SHA.oneEight, days(5), 'success', '9103210976', [shipped(clock, 'footerLinks'), shipped(clock, 'zodBump')]),
    tag('1201877', RELEASE.oneSeven, TAG_SHA.oneSeven, days(20), 'success', '9071154429', []),
    tag('1200931', '1.6.1', TAG_SHA.oneSixOne, days(33), 'success', '9040231170', null, null),
  ];
  const current = history[0];
  if (current === undefined) throw new Error('the staging history is empty');
  return { current, history, pending: [shipped(clock, 'apiReferenceResync'), shipped(clock, 'orderHistoryPagination')] };
}

function productionDeployments(clock: FixtureClock): DeploymentReading {
  const tag = (id: string, ref: string, sha: string, minutesAgo: number, runId: string, changes: readonly DeliveredCommit[] | null): Deployment =>
    deploymentOf(clock, { id, ref, sha, minutesAgo, outcome: 'success', actor: OPERATOR.login, runId, changes, tag: true });
  const history = [
    tag('1203702', RELEASE.oneEight, TAG_SHA.oneEight, days(2), PRODUCTION_WORKFLOW_RUN.oneEight, [shipped(clock, 'footerLinks'), shipped(clock, 'zodBump')]),
    tag('1202011', RELEASE.oneSeven, TAG_SHA.oneSeven, days(21), PRODUCTION_WORKFLOW_RUN.oneSeven, []),
    tag('1200988', '1.6.1', TAG_SHA.oneSixOne, days(33) - hours(2), '9041012266', null),
    tag('1199764', '1.6.0', TAG_SHA.oneSix, days(41), '9001788340', null),
  ];
  const current = history[0];
  if (current === undefined) throw new Error('the production history is empty');
  return { current, history, pending: [shipped(clock, 'promoRounding'), shipped(clock, 'cartBadgeSync'), shipped(clock, 'lockfileRefresh'), shipped(clock, 'apiReferenceResync'), shipped(clock, 'orderHistoryPagination')] };
}

export function storefrontEnvironments(clock: FixtureClock): EnvironmentView[] {
  const development = developmentDeployments(clock);
  const staging = stagingDeployments(clock);
  const production = productionDeployments(clock);
  return [
    environmentView({
      name: DEVELOPMENT,
      promotion: 'automatic',
      status: 'deploying',
      deployments: readOn(development, clock.minutesAgo(2)),
      health: [checkOf('healthz', HEALTH_URL.development, healthSeries(clock, { newestMinutesAgo: 3, seed: 11, baseLatencyMs: 120, failedHoursBack: [3, 10, 17] }))],
      redeployable: true,
      workflowUrl: workflowUrl('deploy-development.yml'),
    }),
    environmentView({
      name: STAGING,
      promotion: 'batch',
      status: 'degraded',
      deployments: failedAfter(readOn(staging, clock.minutesAgo(40)), 'GitHub API request failed: 502 Bad Gateway'),
      health: [
        checkOf(HOMEPAGE_CHECK, HEALTH_URL.stagingHomepage, healthSeries(clock, { newestMinutesAgo: 30, seed: 23, baseLatencyMs: 240, failedHoursBack: [0, 1, 2, 19] })),
        { name: 'checkout-api', url: HEALTH_URL.stagingCheckout, latest: null, series: [] },
      ],
      redeployable: true,
      workflowUrl: workflowUrl('deploy-staging.yml'),
    }),
    environmentView({
      name: PRODUCTION,
      production: true,
      promotion: 'manual',
      status: 'healthy',
      deployments: readOn(production, clock.minutesAgo(3)),
      health: [checkOf(HOMEPAGE_CHECK, HEALTH_URL.productionHomepage, healthSeries(clock, { newestMinutesAgo: 4, seed: 37, baseLatencyMs: 180, failedHoursBack: [14] }))],
      redeployable: false,
      workflowUrl: workflowUrl('deploy-production.yml'),
    }),
  ];
}

interface WorkflowSeed {
  readonly id: string;
  readonly workflow: string;
  readonly title: string;
  readonly branch: string;
  readonly sha: string;
  readonly trigger: string;
  readonly status: WorkflowRun['status'];
  readonly conclusion: WorkflowRun['conclusion'];
  readonly actor: string | null;
  readonly minutesAgo: number;
  readonly durationSeconds: number | null;
}

export function storefrontWorkflowRuns(clock: FixtureClock): WorkflowRun[] {
  const run = (seed: WorkflowSeed): WorkflowRun => ({
    id: seed.id,
    workflow: seed.workflow,
    title: seed.title,
    branch: seed.branch,
    sha: seed.sha,
    trigger: seed.trigger,
    status: seed.status,
    conclusion: seed.conclusion,
    actor: seed.actor,
    startedAt: clock.minutesAgo(seed.minutesAgo),
    durationMs: seed.durationSeconds === null ? null : seed.durationSeconds * SECOND_MS,
    url: actionsRunUrl(seed.id),
  });
  return [
    run({ id: '9120531904', workflow: 'Visual regression', title: 'feat(checkout): announce the errors of the address form to assistive technology', branch: 'factory/55-checkout-screen-reader', sha: headSha(PULL_REQUEST.checkoutScreenReader), trigger: 'pull_request', status: 'queued', conclusion: null, actor: OPERATOR.login, minutesAgo: 1, durationSeconds: null }),
    run({ id: '9120446281', workflow: 'Deploy development', title: 'feat(orders): paginate the order history endpoint (#44)', branch: 'main', sha: mergeSha(PULL_REQUEST.orderHistoryPagination), trigger: 'push', status: 'in_progress', conclusion: null, actor: ACTIONS_BOT_LOGIN, minutesAgo: 15, durationSeconds: null }),
    run({ id: '9120401175', workflow: 'CI', title: 'fix(cart): tell customers when a promo code has expired', branch: 'factory/58-expired-promo-message', sha: headSha(PULL_REQUEST.expiredPromoMessage), trigger: 'pull_request', status: 'completed', conclusion: 'failure', actor: OPERATOR.login, minutesAgo: 20, durationSeconds: 372 }),
    run({ id: '9120377426', workflow: 'CI', title: 'feat(orders): paginate the order history endpoint (#44)', branch: 'main', sha: mergeSha(PULL_REQUEST.orderHistoryPagination), trigger: 'push', status: 'completed', conclusion: 'success', actor: OPERATOR.login, minutesAgo: 24, durationSeconds: 421 }),
    run({ id: '9119911802', workflow: 'Release', title: 'chore(main): release 1.9.0', branch: 'release-please--branches--main', sha: mergeSha(PULL_REQUEST.cartBadgeSync), trigger: 'push', status: 'completed', conclusion: 'success', actor: ACTIONS_BOT_LOGIN, minutesAgo: hours(3), durationSeconds: 64 }),
    run({ id: '9118214530', workflow: 'Dependency audit', title: 'Nightly dependency audit', branch: 'main', sha: mergeSha(OUTSIDE_PULL_REQUEST.viteBump), trigger: 'schedule', status: 'completed', conclusion: 'failure', actor: null, minutesAgo: hours(8), durationSeconds: 96 }),
    run({ id: '9114023388', workflow: 'Deploy staging', title: 'Deploy 1.8.2 to staging', branch: RELEASE.oneEightTwo, sha: TAG_SHA.oneEightTwo, trigger: 'workflow_dispatch', status: 'completed', conclusion: 'success', actor: OPERATOR.login, minutesAgo: hours(22), durationSeconds: 288 }),
    run({ id: '9109401877', workflow: 'CI', title: 'feat(checkout): announce the errors of the address form to assistive technology', branch: 'factory/55-checkout-screen-reader', sha: headSha(PULL_REQUEST.checkoutScreenReader), trigger: 'pull_request', status: 'completed', conclusion: 'cancelled', actor: OPERATOR.login, minutesAgo: days(1) + 10, durationSeconds: 54 }),
    run({ id: PRODUCTION_WORKFLOW_RUN.oneEight, workflow: 'Deploy production', title: 'Deploy 1.8.0 to production', branch: RELEASE.oneEight, sha: TAG_SHA.oneEight, trigger: 'workflow_dispatch', status: 'completed', conclusion: 'success', actor: OPERATOR.login, minutesAgo: days(2), durationSeconds: 342 }),
  ];
}
