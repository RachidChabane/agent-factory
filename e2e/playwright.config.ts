import { defineConfig } from '@playwright/test';
import type { Options } from './support/test.ts';

const MINUTE_MS = 60_000;

export default defineConfig<Options>({
  testDir: './specs',
  globalSetup: './support/global-setup.ts',
  globalTeardown: './support/global-teardown.ts',
  outputDir: '../build/e2e/results',
  workers: 1,
  retries: 0,
  fullyParallel: false,
  timeout: 2 * MINUTE_MS,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: '../build/e2e/report', open: 'never' }]],
  use: { browserName: 'chromium', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'en-US', timezoneId: 'UTC', viewport: { width: 1280, height: 800 } },
  projects: [
    { name: 'guard', testMatch: 'guard/**/*.spec.ts' },
    { name: 'demo', testMatch: 'demo/**/*.spec.ts', use: { mode: 'demo' } },
    { name: 'rehearsal', testMatch: 'rehearsal/**/*.spec.ts', use: { mode: 'rehearsal' } },
  ],
});
