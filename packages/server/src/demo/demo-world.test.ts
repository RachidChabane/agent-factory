import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpawnCommandRunner } from '@agent-factory/adapters';
import { referenceState } from '@agent-factory/application';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { projectOf } from '../config/agent-factory-config.ts';
import { openReferenceSnapshots } from '../composition/project/references.ts';
import { SystemClock } from '../composition/system.ts';
import type { DemoHealthEndpoints } from './demo-health.ts';
import { DEMO_INSTALLATION, DEMO_PROJECTS, LEDGER_ID, STOREFRONT_ID } from './demo-projects.ts';
import { DEMO_SERVER_PORT, prepareDemoWorld, type DemoWorld } from './demo-world.ts';

const REAL_GIT_TEST_TIMEOUT_MS = 60_000;
const HEALTH: DemoHealthEndpoints = { url: (path) => `http://127.0.0.1:7432${path}`, close: () => Promise.resolve() };

describe('the world of the demonstration', { timeout: REAL_GIT_TEST_TIMEOUT_MS }, () => {
  let home: string;
  let world: DemoWorld;

  beforeAll(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), 'factory-demo-world-')));
    world = await prepareDemoWorld({
      home,
      port: DEMO_SERVER_PORT,
      runner: new SpawnCommandRunner(),
      environment: process.env,
      clock: new SystemClock(),
      userHome: home,
      health: HEALTH,
      projects: DEMO_PROJECTS,
      scenario: {},
      installation: DEMO_INSTALLATION,
    });
  }, REAL_GIT_TEST_TIMEOUT_MS);
  afterAll(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it('has the storefront cite a fictional repository, tagged, in a local clone of its own', () => {
    const storefront = projectOf(world.config, STOREFRONT_ID);

    expect(storefront.references).toEqual([{ name: 'design-tokens', repository: 'example-org/design-tokens', ref: 'v1.0.0', source: join(home, 'sources', 'references', 'design-tokens') }]);
    const source = storefront.references[0]?.source ?? '';
    expect(execFileSync('git', ['tag', '--list'], { cwd: source, encoding: 'utf8' }).trim()).toBe('v1.0.0');
    expect(execFileSync('git', ['ls-tree', '-r', '--name-only', 'v1.0.0'], { cwd: source, encoding: 'utf8' }).trim().split('\n')).toEqual(['README.md', 'tokens/colors.json', 'tokens/spacing.json']);
  });

  it('gives the other project no reference', () => {
    expect(projectOf(world.config, LEDGER_ID).references).toEqual([]);
  });

  it('lets the storefront build a real snapshot of it, which its settings then show as ready', async () => {
    const storefront = projectOf(world.config, STOREFRONT_ID);
    const reference = storefront.references[0];
    if (reference === undefined) throw new Error('the storefront cites no reference');
    const snapshots = await openReferenceSnapshots(storefront, process.env, new SpawnCommandRunner());
    expect(await referenceState(snapshots, reference)).toMatchObject({ status: 'not-built' });

    const built = await snapshots.materialise(reference);

    expect(await readFile(join(built.path, 'tokens', 'colors.json'), 'utf8')).toContain('"brand"');
    expect(await referenceState(snapshots, reference)).toEqual({ status: 'ready', commit: built.commit });
    expect(built.path).toBe(join(home, 'projects', STOREFRONT_ID, 'references', 'design-tokens@v1.0.0'));
  });
});
