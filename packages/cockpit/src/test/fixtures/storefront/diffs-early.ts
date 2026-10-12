import { add, createdFile, ctx, del, editedFile, hunk } from '../patch.ts';
import type { PatchedFile } from '../patch.ts';
import { CHECK_PATH } from './paths.ts';

export const LOCAL_SETUP_FILES: readonly PatchedFile[] = [
  createdFile(CHECK_PATH.localSetup, [
    '# Local development setup',
    '',
    'Storefront runs on Node 24 with pnpm. Install the dependencies once, then start the web app and the API together.',
    '',
    '```sh',
    'pnpm install --frozen-lockfile',
    'cp .env.example .env.local',
    'pnpm dev',
    '```',
    '',
    'The web app is served on port 5173 and proxies `/api` to the API on port 4000.',
    'Seed data for a customer with orders in every status is loaded by `pnpm --filter api seed`.',
  ]),
  editedFile('README.md', [
    hunk(
      9,
      [
        ctx('## Getting started'),
        ctx(''),
        del('Run `pnpm install` and `pnpm dev`.'),
        add('See [the local development setup](docs/development/local-setup.md) for the tools, the environment file and the seed data.'),
        ctx(''),
        ctx('## Scripts'),
      ],
      '## Getting started',
    ),
  ]),
];

export const HTTP_CLIENT_BUMP_FILES: readonly PatchedFile[] = [
  editedFile('package.json', [
    hunk(
      27,
      [
        ctx('  "dependencies": {'),
        ctx('    "fastify": "5.6.1",'),
        del('    "undici": "7.4.0",'),
        add('    "undici": "7.5.1",'),
        ctx('    "zod": "4.1.11"'),
        ctx('  },'),
      ],
      '"scripts": {',
    ),
  ]),
  editedFile('pnpm-lock.yaml', [
    hunk(
      412,
      [
        ctx('  undici@7.4.0:'),
        del('    resolution: {integrity: sha512-pL3NmVeBtW0pTjSzzVkNwWhPfAzp4ORfVaMuILCNpYyiHgPWCaTqUSNsrtY0nxFqO8LVUQM84jmUDMGHmycG8Q==}'),
        add('    resolution: {integrity: sha512-yR1tFgAuMdXqNpWIfZDGSL2pGKT1UXa9Zq5ZUc0JdVhXx6u3Cj7pzs3W1b2gAQEeoN7uyrWmL4pHjmdD2FsLw==}'),
        ctx("    engines: {node: '>=20.18.1'}"),
        ctx(''),
      ],
      'packages:',
    ),
  ]),
  editedFile('api/src/http/client.ts', [
    hunk(
      3,
      [
        ctx("import { Agent, request } from 'undici';"),
        ctx(''),
        del('const agent = new Agent({ keepAliveTimeout: 10_000 });'),
        add('const agent = new Agent({ keepAliveTimeout: 10_000, connections: MAX_CONNECTIONS_PER_ORIGIN });'),
        ctx(''),
        ctx('export async function getJson<T>(url: string): Promise<T> {'),
      ],
      'import type { Readable } from "node:stream";',
    ),
  ]),
];

export const CI_PACKAGE_CACHE_FILES: readonly PatchedFile[] = [
  editedFile('.github/workflows/ci.yml', [
    hunk(
      18,
      [
        ctx('      - uses: actions/checkout@v4'),
        ctx('      - uses: pnpm/action-setup@v4'),
        add('      - name: Compute the cache key'),
        add('        id: cache-key'),
        add('        run: node scripts/ci-cache-key.mjs >> "$GITHUB_OUTPUT"'),
        add('      - uses: actions/cache@v4'),
        add('        with:'),
        add('          path: ~/.local/share/pnpm/store'),
        add('          key: ${{ steps.cache-key.outputs.key }}'),
        add('          restore-keys: pnpm-store-${{ runner.os }}-'),
        ctx('      - run: pnpm install --frozen-lockfile'),
        ctx('      - run: pnpm lint'),
      ],
      'jobs:',
    ),
  ]),
  createdFile('scripts/ci-cache-key.mjs', [
    "import { createHash } from 'node:crypto';",
    "import { readFileSync } from 'node:fs';",
    '',
    "const lockfile = readFileSync('pnpm-lock.yaml');",
    "const digest = createHash('sha256').update(lockfile).digest('hex').slice(0, 16);",
    'console.log(`key=pnpm-store-${process.env.RUNNER_OS}-${digest}`);',
  ]),
  createdFile(CHECK_PATH.ciCache, [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { readFileSync } from 'node:fs';",
    '',
    "const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');",
    '',
    "test('the CI workflow restores the package store with a key built from the lockfile', () => {",
    "  assert.match(workflow, /actions\\/cache@v4/);",
    "  assert.match(workflow, /node scripts\\/ci-cache-key\\.mjs/);",
    '});',
    '',
    "test('the cache key changes when the lockfile changes', async () => {",
    "  const { execFileSync } = await import('node:child_process');",
    "  const key = () => execFileSync('node', ['scripts/ci-cache-key.mjs'], { encoding: 'utf8', env: { ...process.env, RUNNER_OS: 'Linux' } });",
    "  assert.match(key(), /^key=pnpm-store-Linux-[0-9a-f]{16}$/m);",
    '});',
  ]),
];

export const DELIVERY_BANNER_FILES: readonly PatchedFile[] = [
  createdFile('web/src/product/DeliveryBanner.tsx', [
    "import { useDeliveryEstimate } from './useDeliveryEstimate';",
    '',
    'export function DeliveryBanner({ productId }: { productId: string }) {',
    '  const estimate = useDeliveryEstimate(productId);',
    '  if (estimate === null) return null;',
    '  return (',
    '    <p className="delivery-banner" data-testid="delivery-banner">',
    '      Order today, delivered by {estimate.deliveryDate}',
    '    </p>',
    '  );',
    '}',
  ]),
  editedFile('web/src/product/ProductPage.tsx', [
    hunk(
      4,
      [
        ctx("import { PriceBlock } from './PriceBlock';"),
        add("import { DeliveryBanner } from './DeliveryBanner';"),
        ctx(''),
      ],
      'import { useProduct } from "./useProduct";',
    ),
    hunk(
      31,
      [
        ctx('      <PriceBlock product={product} />'),
        add('      <DeliveryBanner productId={product.id} />'),
        ctx('      <AddToCartButton product={product} />'),
      ],
      'export function ProductPage() {',
    ),
  ]),
  createdFile(CHECK_PATH.deliveryBanner, [
    "import { test, expect } from '@playwright/test';",
    '',
    "test('shows the delivery date on the product page when an estimate exists', async ({ page }) => {",
    "  await page.goto('/products/cordless-drill-kit');",
    "  await expect(page.getByTestId('delivery-banner')).toContainText('delivered by');",
    '});',
    '',
    "test('hides the banner when no estimate is available', async ({ page }) => {",
    "  await page.goto('/products/garden-bench');",
    "  await expect(page.getByTestId('delivery-banner')).toHaveCount(0);",
    '});',
  ]),
];
