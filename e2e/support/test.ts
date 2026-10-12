import { test as base, expect } from '@playwright/test';
import { startFactory, type FactoryMode, type RunningFactory } from './factory.ts';

const FACTORY_SETUP_TIMEOUT_MS = 600_000;
const FAILED_RESOURCE = /^Failed to load resource/;
const COMMANDS_PATH = '/api/commands/';

export interface Options {
  mode: FactoryMode;
}

interface WorkerFixtures {
  factory: RunningFactory;
}

/**
 * `test` for the specs: a factory of the project's mode shared by every spec of the run, and a page that
 * fails its test on any uncaught error or console error. A refused command makes the browser log the failed
 * request, which is the factory's answer and not a defect of the page.
 */
export const test = base.extend<Record<never, never>, Options & WorkerFixtures>({
  mode: ['demo', { option: true, scope: 'worker' }],
  factory: [
    async ({ mode }, use) => {
      const factory = await startFactory(mode);
      try {
        await use(factory);
      } finally {
        await factory.stop();
      }
    },
    { scope: 'worker', timeout: FACTORY_SETUP_TIMEOUT_MS, auto: false },
  ],
  page: async ({ page }, use) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(`uncaught error: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const refusedCommand = FAILED_RESOURCE.test(message.text()) && message.location().url.includes(COMMANDS_PATH);
      if (!refusedCommand) problems.push(`console error: ${message.text()}`);
    });
    await use(page);
    expect(problems, 'the page must log no error').toEqual([]);
  },
});

export { expect };
