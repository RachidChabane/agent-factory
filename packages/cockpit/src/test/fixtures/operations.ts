import type { CostsView, HealthEnvironment, HealthView, KnowledgeView, ResourceSample, SettingsView } from '../../contract/index.ts';
import { MODEL_HAIKU, MODEL_OPUS, MODEL_SONNET } from './runs.ts';
import type { FixtureClock } from './time.ts';
import { DATADOG_URL, GITHUB_URL, seededRandom } from './time.ts';

const SERIES_POINTS = 48;
const SERIES_INTERVAL_MINUTES = 30;
const COST_HISTORY_DAYS = 30;

function series(seed: number, base: number, amplitude: number, spikeAt: number | null, spikeHeight: number): number[] {
  const random = seededRandom(seed);
  return Array.from({ length: SERIES_POINTS }, (_, index) => {
    const daily = Math.sin((index / SERIES_POINTS) * Math.PI * 2 - 1.2) * amplitude * 0.6;
    const noise = (random() - 0.5) * amplitude;
    const spike = spikeAt !== null && Math.abs(index - spikeAt) <= 1 ? spikeHeight * (index === spikeAt ? 1 : 0.45) : 0;
    return Math.max(0, Math.round((base + daily + noise + spike) * 1000) / 1000);
  });
}

function healthEnvironment(clock: FixtureClock, environment: 'prod' | 'prep', seed: number): HealthEnvironment {
  const production = environment === 'prod';
  const errorRate = series(seed, production ? 0.42 : 0.31, 0.18, production ? 39 : null, 0.9);
  const latency = series(seed + 1, production ? 1850 : 1620, 260, production ? 40 : null, 1400);
  const cost = series(seed + 2, production ? 3.4 : 0.6, production ? 1.6 : 0.3, null, 0);
  const requests = series(seed + 3, production ? 840 : 60, production ? 420 : 30, null, 0);
  return {
    environment,
    errorRate: { current: errorRate.at(-1) ?? 0, unit: 'percent', points: errorRate, threshold: 2 },
    latencyP95: { current: latency.at(-1) ?? 0, unit: 'milliseconds', points: latency, threshold: 3000 },
    llmCost: { current: cost.at(-1) ?? 0, unit: 'usd', points: cost, threshold: null },
    requests: { current: requests.at(-1) ?? 0, unit: 'count', points: requests, threshold: null },
    feedback: production
      ? {
          positive: 184,
          negative: 23,
          recent: [
            { id: 'fb-1', at: clock.minutesAgo(18), rating: 'down', comment: 'The product brief states a battery life that is not in the datasheet.' },
            { id: 'fb-2', at: clock.minutesAgo(47), rating: 'up', comment: 'Perfect delivery update email, I knew exactly when to expect my parcel.' },
            { id: 'fb-3', at: clock.hoursAgo(2), rating: 'up', comment: '' },
            { id: 'fb-4', at: clock.hoursAgo(3), rating: 'down', comment: 'Very slow answer (more than 20 s) in the compatibility assistant.' },
          ],
        }
      : { positive: 12, negative: 1, recent: [{ id: 'fb-p1', at: clock.hoursAgo(5), rating: 'up', comment: 'Acceptance test OK on the delivery window email.' }] },
    pods: production
      ? [
          { name: 'storefront-web-6d8f9c7b4-k4pzr', status: 'running', restarts: 0, startedAt: clock.daysAgo(6), version: 'storefront-v2.3.0' },
          { name: 'storefront-web-6d8f9c7b4-w9xtn', status: 'running', restarts: 0, startedAt: clock.daysAgo(6), version: 'storefront-v2.3.0' },
          { name: 'storefront-worker-5f4b7d9c8-m2jqs', status: 'running', restarts: 2, startedAt: clock.hoursAgo(9), version: 'storefront-v2.3.0' },
          { name: 'storefront-api-7b5c8d9f6-q7hnv', status: 'running', restarts: 0, startedAt: clock.daysAgo(6), version: 'storefront-v2.3.0' },
          { name: 'storefront-api-7b5c8d9f6-tz4lc', status: 'running', restarts: 0, startedAt: clock.daysAgo(6), version: 'storefront-v2.3.0' },
        ]
      : [
          { name: 'storefront-web-58d6c9b7f-ab12c', status: 'running', restarts: 0, startedAt: clock.hoursAgo(26), version: 'storefront-v2.3.1-rc.1' },
          { name: 'storefront-api-6c7d9f5b8-cd34e', status: 'running', restarts: 0, startedAt: clock.hoursAgo(26), version: 'storefront-v2.3.1-rc.1' },
        ],
    alerts: production
      ? [
          {
            id: 'al-1',
            title: 'Checkout API p95 latency > 3 s',
            severity: 'warning',
            status: 'triggered',
            triggeredAt: clock.minutesAgo(34),
            url: `${DATADOG_URL}/monitors/52816`,
          },
          {
            id: 'al-2',
            title: 'API error rate > 2 % over 10 min',
            severity: 'critical',
            status: 'resolved',
            triggeredAt: clock.hoursAgo(4.5),
            url: `${DATADOG_URL}/monitors/52790`,
          },
          {
            id: 'al-3',
            title: 'Restart of pod storefront-worker',
            severity: 'info',
            status: 'resolved',
            triggeredAt: clock.hoursAgo(9),
            url: `${DATADOG_URL}/monitors/52934`,
          },
        ]
      : [],
    datadogUrl: `${DATADOG_URL}?env=${environment}`,
    sampledAt: clock.secondsAgo(40),
  };
}

export function buildHealth(clock: FixtureClock): HealthView {
  return {
    seriesIntervalMinutes: SERIES_INTERVAL_MINUTES,
    environments: [healthEnvironment(clock, 'prod', 11), healthEnvironment(clock, 'prep', 29)],
  };
}

export function buildCosts(clock: FixtureClock): CostsView {
  const random = seededRandom(7);
  const daily = Array.from({ length: COST_HISTORY_DAYS }, (_, offset) => {
    const daysAgo = COST_HISTORY_DAYS - 1 - offset;
    const weekday = new Date(clock.now - daysAgo * 86_400_000).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const runs = weekend ? Math.round(2 + random() * 4) : Math.round(9 + random() * 14);
    const costUsd = Math.round(runs * (1.1 + random() * 1.4) * 100) / 100;
    return {
      date: clock.dateDaysAgo(daysAgo),
      costUsd,
      inputTokens: Math.round(costUsd * 210_000),
      outputTokens: Math.round(costUsd * 21_000),
      runs,
    };
  });
  const monthToDateUsd = Math.round(daily.slice(-10).reduce((sum, day) => sum + day.costUsd, 0) * 100) / 100;
  return {
    monthToDateUsd,
    daily,
    byRole: [
      { role: 'implementer', costUsd: 412.3, tokens: 88_400_000, runs: 61 },
      { role: 'reviewer', costUsd: 96.8, tokens: 21_300_000, runs: 74 },
      { role: 'acceptance-author', costUsd: 71.2, tokens: 17_900_000, runs: 39 },
      { role: 'challenger', costUsd: 38.5, tokens: 8_100_000, runs: 17 },
      { role: 'auditor', costUsd: 22.9, tokens: 5_600_000, runs: 15 },
      { role: 'release-auditor', costUsd: 6.4, tokens: 1_500_000, runs: 4 },
      { role: 'summarizer', costUsd: 1.9, tokens: 2_300_000, runs: 52 },
    ],
    byModel: [
      { key: MODEL_OPUS, costUsd: 487.6, tokens: 81_200_000, runs: 128 },
      { key: MODEL_SONNET, costUsd: 160.5, tokens: 61_600_000, runs: 82 },
      { key: MODEL_HAIKU, costUsd: 1.9, tokens: 2_300_000, runs: 52 },
    ],
    byIssue: [
      { issueNumber: 225, costUsd: 18.42, tokens: 3_900_000, runs: 6 },
      { issueNumber: 223, costUsd: 11.07, tokens: 2_400_000, runs: 5 },
      { issueNumber: 226, costUsd: 9.86, tokens: 2_100_000, runs: 4 },
      { issueNumber: 221, costUsd: 7.31, tokens: 1_700_000, runs: 3 },
      { issueNumber: 224, costUsd: 5.94, tokens: 1_300_000, runs: 3 },
      { issueNumber: 227, costUsd: 3.12, tokens: 700_000, runs: 2 },
    ],
    subscription: [
      { window: 'five_hour', utilization: 0.46, resetsAt: clock.inMinutes(133) },
      { window: 'seven_day', utilization: 0.63, resetsAt: clock.inMinutes(4 * 24 * 60 + 190) },
    ],
    caps: { dailyUsd: 60, perRunUsd: 8, pauseAtUtilization: 0.9 },
  };
}

export function buildResources(clock: FixtureClock): ResourceSample {
  return { freeMemoryPercent: 63, pressure: 'normal', thresholdPercent: 40, schedulingPaused: false, sampledAt: clock.secondsAgo(4) };
}

export function buildKnowledge(clock: FixtureClock): KnowledgeView {
  return {
    refreshedAt: clock.hoursAgo(3),
    productAreas: [
      {
        id: 'web',
        name: 'Web storefront',
        description: 'Customer-facing web application: catalogue, cart, checkout, order history, wishlists and account pages. Shared component library.',
        paths: ['web/src/pages', 'web/src/components', 'web/src/hooks'],
        owners: ['Storefront web team'],
      },
      {
        id: 'api',
        name: 'Shop API',
        description: 'Server routes: products, cart, checkout, orders, payments and discount codes. PostgreSQL through a typed query builder.',
        paths: ['api/src/routes', 'api/src/db'],
        owners: ['Storefront web team'],
      },
      {
        id: 'worker',
        name: 'Background workers',
        description: 'Queue consumers: order emails, inventory sync and payment retries.',
        paths: ['worker/src', 'worker/tests'],
        owners: ['Platform team'],
      },
      {
        id: 'skills',
        name: 'Assistant skills',
        description: 'Instructions of the assistant skills (product brief, order email, support reply) and their evaluations.',
        paths: ['assistant/skills', 'assistant/evals'],
        owners: ['Platform team', 'Product'],
      },
      {
        id: 'platform',
        name: 'Platform & delivery',
        description: 'Helm charts, GitHub Actions workflows, DEV / PREP / PROD environments, monitoring dashboards and monitors.',
        paths: ['infrastructure', '.github/workflows', 'environments'],
        owners: ['Platform team'],
      },
    ],
    screens: [
      { id: 'home', name: 'Home', route: '/', area: 'web', description: 'Featured products, categories and recent orders.' },
      { id: 'history', name: 'Order history', route: '/orders', area: 'web', description: 'List of orders, savings, filters.' },
      { id: 'order', name: 'Order', route: '/orders/:id', area: 'web', description: 'Order timeline, delivery status and invoice.' },
      { id: 'product', name: 'Product page', route: '/products/:slug', area: 'web', description: 'Gallery, price, stock, reviews and wishlist button.' },
      { id: 'checkout', name: 'Checkout', route: '/checkout', area: 'web', description: 'Address, delivery, payment and discount code.' },
    ],
    decisions: [
      {
        id: 'ADR-0014',
        title: 'Prices are stored in USD and converted at display time',
        status: 'accepted',
        date: clock.dateDaysAgo(9),
        summary: 'The catalogue is priced in USD; conversion uses a daily rate per storefront currency.',
        link: `${GITHUB_URL}/blob/main/docs/adr/0014-price-currency.md`,
      },
      {
        id: 'ADR-0013',
        title: 'Cursor-based pagination for list endpoints',
        status: 'accepted',
        date: clock.dateDaysAgo(16),
        summary: 'Opaque cursors built from the creation date and the id; the page size never exceeds 100.',
        link: `${GITHUB_URL}/blob/main/docs/adr/0013-cursor-based-pagination.md`,
      },
      {
        id: 'ADR-0012',
        title: 'Product briefs use a neutral, factual register',
        status: 'accepted',
        date: clock.dateDaysAgo(40),
        summary: 'Briefs are shown next to technical datasheets; enthusiasm markers and unverifiable claims are excluded.',
        link: `${GITHUB_URL}/blob/main/docs/adr/0012-product-brief-register.md`,
      },
      {
        id: 'ADR-0011',
        title: 'Carts are kept in browser storage',
        status: 'superseded',
        date: clock.dateDaysAgo(55),
        summary: 'Superseded by the server-side cart shipped in #217.',
        link: `${GITHUB_URL}/blob/main/docs/adr/0011-browser-cart.md`,
      },
      {
        id: 'ADR-0015',
        title: 'Shareable order links',
        status: 'proposed',
        date: clock.dateDaysAgo(1),
        summary: 'Signed links that expire, to be reviewed by security once R-17 is answered.',
        link: `${GITHUB_URL}/pull/308`,
      },
    ],
    sources: [
      { id: 'repo', name: 'example-org/storefront', kind: 'repository', location: GITHUB_URL, refreshedAt: clock.minutesAgo(12) },
      { id: 'docs', name: 'Product documentation', kind: 'documentation', location: `${GITHUB_URL}/tree/main/docs`, refreshedAt: clock.hoursAgo(3) },
      { id: 'figma', name: 'Storefront mockups 2026', kind: 'design', location: 'https://design.example.invalid/storefront-2026', refreshedAt: clock.daysAgo(1) },
      { id: 'datadog', name: 'Storefront dashboard', kind: 'dashboard', location: DATADOG_URL, refreshedAt: clock.minutesAgo(5) },
      { id: 'chat', name: '#storefront-product', kind: 'channel', location: 'Slack', refreshedAt: clock.minutesAgo(38) },
    ],
  };
}

export function buildSettings(clock: FixtureClock): SettingsView {
  const checkedAt = clock.minutesAgo(3);
  return {
    models: [MODEL_OPUS, MODEL_SONNET, MODEL_HAIKU],
    roles: [
      { role: 'challenger', model: MODEL_OPUS, effort: 'high', maxBudgetUsd: 3, maxTurns: 40 },
      { role: 'acceptance-author', model: MODEL_SONNET, effort: 'high', maxBudgetUsd: 2, maxTurns: 60 },
      { role: 'implementer', model: MODEL_OPUS, effort: 'high', maxBudgetUsd: 8, maxTurns: 150 },
      { role: 'reviewer', model: MODEL_OPUS, effort: 'xhigh', maxBudgetUsd: 3, maxTurns: 40 },
      { role: 'auditor', model: MODEL_SONNET, effort: 'high', maxBudgetUsd: 2, maxTurns: 40 },
      { role: 'release-auditor', model: MODEL_SONNET, effort: 'medium', maxBudgetUsd: 2, maxTurns: 30 },
      { role: 'summarizer', model: MODEL_HAIKU, effort: 'low', maxBudgetUsd: 0.3, maxTurns: 10 },
    ],
    concurrency: { ceiling: 2, maximum: 4, active: 2 },
    resourceGuard: { freeMemoryThresholdPercent: 40, pauseAbovePressure: 'normal' },
    tools: [
      { tool: 'gh', status: 'connected', version: '2.74.0', detail: 'Logged in to github.com as storefront-release[bot]', fixCommand: null, checkedAt },
      { tool: 'claude', status: 'connected', version: '2.1.296', detail: '2.1.296 (Claude Code)', fixCommand: null, checkedAt },
      { tool: 'pup', status: 'connected', version: '0.8.2', detail: 'authenticated with Datadog', fixCommand: null, checkedAt },
      { tool: 'tuc', status: 'unauthenticated', version: '1.9.3', detail: 'The deployment token has expired', fixCommand: 'tuc login', checkedAt },
      { tool: 'gcloud', status: 'connected', version: '528.0.0', detail: 'storefront-release@example.com', fixCommand: null, checkedAt },
      { tool: 'vault', status: 'error', version: '1.19.4', detail: 'permission denied on secret/storefront/prep', fixCommand: 'vault login', checkedAt },
      { tool: 'avn', status: 'missing', version: null, detail: 'avn is not installed or not on the PATH', fixCommand: 'pipx install aiven-client', checkedAt },
      { tool: 'gws', status: 'connected', version: '0.3.7', detail: 'alex.morgan@example.com', fixCommand: null, checkedAt },
      { tool: 'figma', status: 'connected', version: null, detail: 'the figma-pat keychain item exists', fixCommand: null, checkedAt },
    ],
  };
}
