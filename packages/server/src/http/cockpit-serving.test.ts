import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CockpitSnapshotSchema, evidencePath } from '@agent-factory/cockpit';
import { openInstallation, type InstallationRuntime } from '../composition/installation/installation-runtime.ts';
import { SILENT_LOG } from '../composition/operation-log.ts';
import { createHttpServer } from '../composition/runtime.ts';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { createRehearsal, FIRST_PROJECT, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';
import type { FactoryHttpServer } from './factory-http-server.ts';
import { IMMUTABLE_CACHE_CONTROL, REVALIDATE_CACHE_CONTROL } from './static-files.ts';

const TIMEOUT_MS = 60_000;
const NO_STORE = 'no-store';
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };
const FAST_STREAM = { heartbeatMs: 200, pollMs: 50, telemetryMs: 10_000 };
const PAGE = '<!doctype html><html><head><title>Cockpit</title></head><body><div id="root"></div></body></html>';
const FAVICON = '<svg xmlns="http://www.w3.org/2000/svg"/>';
const HASHED_ASSET = '/assets/index-Dx4kXJAl.js';
const MISSING_ASSET = '/assets/ReleasesView-Zz9y8x7w.js';
const EVIDENCE_ISSUE = 42;
const EVIDENCE_FILE = 'before/screenshot.png';

describe('serving the cockpit', { timeout: TIMEOUT_MS }, () => {
  let rehearsal: RehearsalEnvironment;
  let installation: InstallationRuntime;
  let server: FactoryHttpServer;
const lifetime = new AbortController();
  let base = '';

  beforeAll(async () => {
    rehearsal = await createRehearsal({ projects: [FIRST_PROJECT] });
    installation = await openInstallation(rehearsal.config, rehearsal.environment, {
      harnessFor: () => new RehearsalAgents(),
      resources: NORMAL_RESOURCES,
      usage: { read: (account) => Promise.resolve({ account, source: 'usage-report', readAt: new Date(), limits: [] }) },
      fetch: () => Promise.resolve({ status: 200 }),
      log: SILENT_LOG,
      userHome: rehearsal.root,
    });
    const cockpitDirectory = join(rehearsal.root, 'cockpit-dist');
    await mkdir(join(cockpitDirectory, 'assets'), { recursive: true });
    await writeFile(join(cockpitDirectory, 'index.html'), PAGE);
    await writeFile(join(cockpitDirectory, 'favicon.svg'), FAVICON);
    await writeFile(join(cockpitDirectory, HASHED_ASSET), 'export {};');
    const evidence = installation.project(FIRST_PROJECT).config.directories.evidence;
    await mkdir(join(evidence, `issue-${EVIDENCE_ISSUE}`, 'before'), { recursive: true });
    await writeFile(join(evidence, `issue-${EVIDENCE_ISSUE}`, EVIDENCE_FILE), 'png');
    server = createHttpServer(installation, null, lifetime.signal, { cockpitDirectory, stream: FAST_STREAM });
    base = `http://127.0.0.1:${(await server.start()).port}`;
  });

  afterAll(async () => {
  lifetime.abort();
    await server.stop();
    installation.close();
    await rehearsal.cleanup();
  });

  it('never stores the page, whichever client-side route asked for it', async () => {
    for (const path of ['/', '/runs', `/projects/${FIRST_PROJECT}/delivery`]) {
      const response = await fetch(`${base}${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('cache-control')).toBe(NO_STORE);
    }
  });

  it('caches the content-hashed assets for good', async () => {
    const response = await fetch(`${base}${HASHED_ASSET}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(IMMUTABLE_CACHE_CONTROL);
  });

  it('answers 404, never the page, for an asset that does not exist', async () => {
    const response = await fetch(`${base}${MISSING_ASSET}`);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe(NO_STORE);
  });

  it('revalidates a file outside the assets directory', async () => {
    const first = await fetch(`${base}/favicon.svg`);
    expect(first.headers.get('cache-control')).toBe(REVALIDATE_CACHE_CONTROL);
    const second = await fetch(`${base}/favicon.svg`, { headers: { 'if-none-match': first.headers.get('etag') ?? '' } });
    expect(second.status).toBe(304);
  });

  it('revalidates the evidence of an issue the same way', async () => {
    const path = evidencePath(FIRST_PROJECT, EVIDENCE_ISSUE, EVIDENCE_FILE);
    const first = await fetch(`${base}${path}`);
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe(REVALIDATE_CACHE_CONTROL);
    expect((await fetch(`${base}${path}`, { headers: { 'if-none-match': first.headers.get('etag') ?? '' } })).status).toBe(304);
  });

  it('never stores the snapshot', async () => {
    const response = await fetch(`${base}/api/state`);
    expect(response.headers.get('cache-control')).toBe(NO_STORE);
    expect(CockpitSnapshotSchema.parse(await response.json()).projects.map((project) => project.id)).toEqual([FIRST_PROJECT]);
  });
});
