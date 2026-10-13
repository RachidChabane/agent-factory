import { createServer } from 'node:net';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page, Request } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withServerPort } from '../config/agent-factory-config.ts';
import { openInstallation, type InstallationRuntime } from '../composition/installation/installation-runtime.ts';
import { SILENT_LOG } from '../composition/operation-log.ts';
import { createHttpServer } from '../composition/runtime.ts';
import { appendBusyRuns, appendLiveRun, busyRunId } from '../testing/busy-factory.ts';
import {
  assetTransferSizes,
  buildCockpit,
  chromiumInstalled,
  clickMenuAndMeasure,
  COCKPIT_ALERT_SELECTOR,
  COCKPIT_HEADING_SELECTOR,
  COCKPIT_SIDEBAR_SELECTOR,
  launchChromium,
  menuEntries,
  menuLink,
} from '../testing/cockpit-browser.ts';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { createRehearsal, FIRST_PROJECT, SECOND_PROJECT, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';
import type { FactoryHttpServer } from './factory-http-server.ts';

const TEST_TIMEOUT_MS = 240_000;
const NAVIGATION_ROUNDS = 2;
const VIEW_RENDER_BUDGET_MS = 300;
const CONTENT_TIMEOUT_MS = 15_000;
const TAB_COUNT = 7;
const FAST_STREAM = { heartbeatMs: 5_000, pollMs: 100, telemetryMs: 5_000 };
const MINIMUM_MENU_ENTRIES = 12;
const OFFLINE_WINDOW_MS = 600;
const SNAPSHOT_PATH = '/api/state';
const EVENT_SOURCE_TYPE = 'eventsource';
const LIVE_RUN_ID = busyRunId(9_999);
const RESUME_RUN_ID = busyRunId(9_998);
const PROJECT_PATH = `/projects/${FIRST_PROJECT}`;
const BROKEN_VIEW = { chunk: '**/assets/DeliveryView-*.js', path: `${PROJECT_PATH}/delivery` };
const WORKING_VIEW_PATH = '/usage';
const VIEW_ERROR_TITLE = 'This view could not be displayed';
const LIVE_RUNS_COUNT = `${COCKPIT_SIDEBAR_SELECTOR} a[href^="/runs"] .sidebar__count`;
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };

interface Observation {
  readonly documentLoads: Request[];
  readonly snapshotRequests: Request[];
  readonly eventSourceRequests: Request[];
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
}

function observe(page: Page): Observation {
  const observation: Observation = { documentLoads: [], snapshotRequests: [], eventSourceRequests: [], consoleErrors: [], pageErrors: [] };
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (request.isNavigationRequest() && request.resourceType() === 'document') observation.documentLoads.push(request);
    if (path === SNAPSHOT_PATH) observation.snapshotRequests.push(request);
    if (request.resourceType() === EVENT_SOURCE_TYPE) observation.eventSourceRequests.push(request);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') observation.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => observation.pageErrors.push(error.message));
  return observation;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => (address !== null && typeof address === 'object' ? resolve(address.port) : reject(new Error('no port'))));
    });
  });
}

async function openCockpit(page: Page, base: string): Promise<void> {
  await page.goto(`${base}/`);
  await page.waitForSelector(COCKPIT_HEADING_SELECTOR, { timeout: CONTENT_TIMEOUT_MS });
}

function afterOf(request: Request | undefined): string | null {
  return new URL(request?.url() ?? 'http://localhost/').searchParams.get('after');
}

describe.skipIf(!chromiumInstalled())('the cockpit in a real browser', { timeout: TEST_TIMEOUT_MS }, () => {
  let rehearsal: RehearsalEnvironment;
  let installation: InstallationRuntime;
  let server: FactoryHttpServer;
const lifetime = new AbortController();
  let browser: Browser;
  let context: BrowserContext | undefined;
  let base = '';

  const lastSequence = async (): Promise<number> => (await installation.events.read('', 0)).at(-1)?.sequence ?? 0;

  beforeAll(async () => {
    rehearsal = await createRehearsal({ projects: [FIRST_PROJECT, SECOND_PROJECT] });
    const port = await freePort();
    installation = await openInstallation(withServerPort(rehearsal.config, port), rehearsal.environment, {
      harnessFor: () => new RehearsalAgents(),
      resources: NORMAL_RESOURCES,
      usage: { read: (account) => Promise.resolve({ account, source: 'usage-report', readAt: new Date(), limits: [] }) },
      fetch: () => Promise.resolve({ status: 200 }),
      log: SILENT_LOG,
      userHome: rehearsal.root,
    });
    const cockpitDirectory = join(rehearsal.root, 'cockpit-dist');
    buildCockpit(cockpitDirectory);
    await appendBusyRuns(installation.events, FIRST_PROJECT);
    await rehearsal.project(FIRST_PROJECT).addDocIssue('Document the cockpit');
    server = createHttpServer(installation, null, lifetime.signal, { cockpitDirectory, stream: FAST_STREAM });
    base = `http://127.0.0.1:${(await server.start()).port}`;
    browser = await launchChromium();
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
  lifetime.abort();
    await browser?.close();
    await server?.stop();
    installation?.close();
    await rehearsal?.cleanup();
  });

  async function freshContext(): Promise<BrowserContext> {
    await context?.close();
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
    return context;
  }

  it('walks every menu entry twice without a document load, with one snapshot, one stream and no error', async () => {
    const page = await (await freshContext()).newPage();
    const seen = observe(page);
    await openCockpit(page, base);
    const snapshotSequence = await lastSequence();
    await clickMenuAndMeasure(page, PROJECT_PATH);
    const menu = await menuEntries(page);
    expect(menu.length).toBeGreaterThanOrEqual(MINIMUM_MENU_ENTRIES);
    const timings = new Map<string, number[]>();
    for (let round = 0; round < NAVIGATION_ROUNDS; round += 1) {
      await clickMenuAndMeasure(page, PROJECT_PATH);
      for (const entry of menu) {
        const elapsed = await clickMenuAndMeasure(page, entry.href);
        timings.set(entry.href, [...(timings.get(entry.href) ?? []), elapsed]);
        await expect(page.locator(COCKPIT_ALERT_SELECTOR).count(), `${entry.label} shows an error`).resolves.toBe(0);
      }
    }
    const summary = [...timings.entries()].map(([href, values]) => `${href}: ${values.map((value) => value.toFixed(0)).join('/')} ms`);
    console.info(`view render times (first/second visit): ${summary.join(', ')}`);
    for (const [href, values] of timings) {
      for (const value of values) expect(value, `${href} rendered in ${value.toFixed(0)} ms`).toBeLessThan(VIEW_RENDER_BUDGET_MS);
    }
    expect(seen.documentLoads).toHaveLength(1);
    expect(seen.snapshotRequests).toHaveLength(1);
    expect(seen.eventSourceRequests).toHaveLength(1);
    expect(afterOf(seen.eventSourceRequests[0])).toBe(String(snapshotSequence));
    expect(seen.consoleErrors).toEqual([]);
    expect(seen.pageErrors).toEqual([]);
  });

  it('serves a reload from the browser cache for every hashed asset', async () => {
    const page = await (await freshContext()).newPage();
    await openCockpit(page, base);
    await page.reload();
    await page.waitForSelector(COCKPIT_HEADING_SELECTOR, { timeout: CONTENT_TIMEOUT_MS });
    const transferred = await assetTransferSizes(page);
    expect(transferred.length).toBeGreaterThan(0);
    expect(transferred.every((size) => size === 0)).toBe(true);
  });

  it('loads every one of seven tabs and keeps a single stream open for all of them', async () => {
    const shared = await freshContext();
    const observations: Observation[] = [];
    const pages: Page[] = [];
    for (let index = 0; index < TAB_COUNT; index += 1) {
      const page = await shared.newPage();
      observations.push(observe(page));
      await openCockpit(page, base);
      pages.push(page);
    }
    expect(observations.flatMap((entry) => entry.eventSourceRequests)).toHaveLength(1);
    await appendLiveRun(installation.events, FIRST_PROJECT, LIVE_RUN_ID);
    for (const page of pages) await page.locator(LIVE_RUNS_COUNT).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    expect(observations.flatMap((entry) => entry.consoleErrors)).toEqual([]);
    expect(observations.every((entry) => entry.snapshotRequests.length >= 1 && entry.snapshotRequests.length <= 2)).toBe(true);
  });

  it('shows the error of a view whose chunk cannot be loaded, keeps the menu usable and recovers on reload', async () => {
    const page = await (await freshContext()).newPage();
    const seen = observe(page);
    await openCockpit(page, base);
    await clickMenuAndMeasure(page, PROJECT_PATH);
    await page.route(BROKEN_VIEW.chunk, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"gone"}' }));
    await menuLink(page, BROKEN_VIEW.path).click();
    await page.waitForSelector(COCKPIT_ALERT_SELECTOR, { timeout: CONTENT_TIMEOUT_MS });
    await expect(page.locator(COCKPIT_ALERT_SELECTOR).textContent()).resolves.toContain(VIEW_ERROR_TITLE);
    await expect(page.locator(COCKPIT_SIDEBAR_SELECTOR).isVisible()).resolves.toBe(true);
    await clickMenuAndMeasure(page, WORKING_VIEW_PATH);
    await expect(page.locator(COCKPIT_ALERT_SELECTOR).count()).resolves.toBe(0);
    await page.unroute(BROKEN_VIEW.chunk);
    await page.goto(`${base}${BROKEN_VIEW.path}`);
    await page.waitForSelector(COCKPIT_HEADING_SELECTOR, { timeout: CONTENT_TIMEOUT_MS });
    await expect(page.locator(COCKPIT_ALERT_SELECTOR).count()).resolves.toBe(0);
    expect(seen.pageErrors).toEqual([]);
  });

  it('resumes the stream after the last sequence it applied once the server is back, with at most one more snapshot', async () => {
    const page = await (await freshContext()).newPage();
    const seen = observe(page);
    await openCockpit(page, base);
    await appendLiveRun(installation.events, FIRST_PROJECT, RESUME_RUN_ID);
    await page.locator(LIVE_RUNS_COUNT).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    const appliedSequence = await lastSequence();
    const snapshotsBefore = seen.snapshotRequests.length;
    await server.stop();
    await page.waitForTimeout(OFFLINE_WINDOW_MS);
    await server.start();
    await expect.poll(() => seen.eventSourceRequests.length, { timeout: CONTENT_TIMEOUT_MS }).toBeGreaterThanOrEqual(2);
    expect(afterOf(seen.eventSourceRequests.at(-1))).toBe(String(appliedSequence));
    expect(seen.snapshotRequests.length).toBeLessThanOrEqual(snapshotsBefore + 1);
  });
});
