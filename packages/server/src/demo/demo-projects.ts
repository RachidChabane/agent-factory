import { join } from 'node:path';
import type { DemoHealthEndpoints, DemoEnvironmentHealth } from './demo-health.ts';
import type { DemoProject } from './demo-world.ts';

const DANA = { name: 'Dana Reyes', email: 'dana.reyes@example.com' };
const RILEY = { name: 'Riley Chen', email: 'riley.chen@example.com' };
const FACTORY_IDENTITY = { name: 'Example Factory', email: 'factory@example.com' };

/** The person who runs the factory in the demonstration. */
export const DEMO_OPERATOR = 'Alex Morgan';
export const STOREFRONT_ID = 'storefront';
export const LEDGER_ID = 'ledger';

/** The environments the demonstration's projects deploy to, and how each one answers its health check. */
export const DEMO_ENVIRONMENTS: readonly DemoEnvironmentHealth[] = [
  { path: '/storefront/staging/healthz', healthy: true, detail: 'catalogue and cart answering' },
  { path: '/storefront/production/healthz', healthy: true, detail: 'catalogue and cart answering' },
  { path: '/ledger/sandbox/healthz', healthy: false, detail: 'the invoice store is not reachable' },
];

const CATALOG_ADMIN = 'catalog-admin';
const SESSION_KEEP_ALIVE_MINUTES = 5;

/** A tool of the catalogue service whose session is a file: logged out until the operator logs in from the cockpit. */
function catalogAdmin(sessionsDirectory: string): Readonly<Record<string, unknown>> {
  const session = join(sessionsDirectory, CATALOG_ADMIN);
  return {
    name: CATALOG_ADMIN,
    description: 'Publishes product changes to the catalogue service',
    check: ['/bin/sh', '-c', `test -f '${session}'`],
    fix: `${CATALOG_ADMIN} login`,
    login: `mkdir -p '${sessionsDirectory}' && date -u > '${session}'`,
    keepAlive: { command: `test -f '${session}' && touch '${session}'`, everyMinutes: SESSION_KEEP_ALIVE_MINUTES },
  };
}

const storefront: DemoProject = {
  id: STOREFRONT_ID,
  name: 'Storefront',
  repository: 'example-org/storefront',
  example: 'storefront',
  history: [
    { author: DANA, daysAgo: 41, message: 'feat: sell the first four products with a cart and a checkout summary', files: {}, tag: 'v1.3.0' },
    {
      author: RILEY,
      daysAgo: 12,
      message: 'docs: describe how prices are rounded on the checkout summary',
      files: { 'docs/pricing.md': '# Prices\n\nPrices are stored in cents and shown with two decimals. The checkout summary adds line totals before formatting them.\n' },
      tag: 'v1.4.0',
    },
  ],
  references: [
    {
      name: 'design-tokens',
      repository: 'example-org/design-tokens',
      tag: 'v1.0.0',
      author: RILEY,
      daysAgo: 30,
      files: {
        'README.md': '# Design tokens\n\nThe colours and the spacing the products of example-org share. Every value is a name and a number, in `tokens/`.\n',
        'tokens/colors.json': '{\n  "brand": "#1f6feb",\n  "surface": "#ffffff",\n  "danger": "#d1242f"\n}\n',
        'tokens/spacing.json': '{\n  "small": 4,\n  "medium": 8,\n  "large": 16\n}\n',
      },
    },
  ],
  settings: (health: DemoHealthEndpoints) => ({
    commitIdentity: FACTORY_IDENTITY,
    gate: {
      beforeAcceptance: [{ name: 'lint', run: 'node scripts/lint.js' }],
      afterAcceptance: [{ name: 'unit', run: 'node --test' }],
    },
    knowledge: [{ repository: 'docs/pricing.md' }],
    delivery: {
      release: { kind: 'tags', tagPattern: 'v*.*.*' },
      environments: [
        { name: 'staging', promotion: 'automatic', health: [{ name: 'web', url: health.url('/storefront/staging/healthz') }] },
        { name: 'production', promotion: 'manual', production: true, health: [{ name: 'web', url: health.url('/storefront/production/healthz') }] },
      ],
    },
    audits: { ignore: [{ name: 'Dependency updates', authors: ['dependency-bot[bot]'] }] },
    tools: [
      {
        name: 'design-export',
        description: 'Exports the screens of the design files the user-interface issues refer to',
        check: ['design-export', 'whoami'],
        install: 'npm install --global design-export',
      },
    ],
  }),
  sessionTools: (sessionsDirectory) => [catalogAdmin(sessionsDirectory)],
};

const ledger: DemoProject = {
  id: LEDGER_ID,
  name: 'Ledger',
  repository: 'example-org/ledger',
  example: 'ledger',
  history: [{ author: RILEY, daysAgo: 23, message: 'feat: issue invoices and record their payments', files: {}, tag: null }],
  settings: (health: DemoHealthEndpoints) => ({
    commitIdentity: FACTORY_IDENTITY,
    gate: { afterAcceptance: [{ name: 'test', run: 'node --test' }] },
    issueTypes: [
      { id: 'feature', proof: 'fails-on-base', commit: { type: 'feat' } },
      { id: 'fix', proof: 'fails-on-base', commit: { type: 'fix' } },
      { id: 'security', proof: 'fails-on-base', checks: 'a test reproducing the attack', commit: { type: 'fix' }, review: ['security'] },
      { id: 'refactor', proof: 'none', commit: { type: 'refactor' } },
      { id: 'docs', proof: 'none', commit: { type: 'docs' } },
    ],
    delivery: { environments: [{ name: 'sandbox', promotion: 'automatic', health: [{ name: 'api', url: health.url('/ledger/sandbox/healthz') }] }] },
  }),
};

export const DEMO_PROJECTS: readonly DemoProject[] = [storefront, ledger];

/** The installation settings of the demonstration: a quick daemon, and room for its agents on any machine. */
export const DEMO_INSTALLATION: Readonly<Record<string, unknown>> = {
  resources: { minimumFreeMemoryPercent: 5, pauseAbovePressure: 'warn', maxConcurrentRuns: 1 },
  daemon: { pollIntervalSeconds: 2, mergeWatchIntervalMinutes: 1, issueRefreshSeconds: 5 },
  tools: [{ name: 'node', description: 'Runs the gate commands of both projects', check: ['node', '--version'] }],
};
