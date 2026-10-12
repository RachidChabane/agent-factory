import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CockpitSnapshotSchema } from '@agent-factory/cockpit';
import { openInstallation, type InstallationRuntime } from '../composition/installation/installation-runtime.ts';
import { SILENT_LOG } from '../composition/operation-log.ts';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { createRehearsal, FIRST_PROJECT, SECOND_PROJECT, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';
import { SnapshotSource } from './snapshot-source.ts';

const TIMEOUT_MS = 60_000;
const COLD_WAIT_MS = 150;
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };
const NEVER = new Promise<never>(() => undefined);

describe('the snapshot of the cockpit while a forge does not answer', { timeout: TIMEOUT_MS }, () => {
  let rehearsal: RehearsalEnvironment;
  let installation: InstallationRuntime;

  beforeEach(async () => {
    rehearsal = await createRehearsal({ projects: [FIRST_PROJECT, SECOND_PROJECT] });
    installation = await openInstallation(rehearsal.config, rehearsal.environment, {
      harnessFor: () => new RehearsalAgents(),
      resources: NORMAL_RESOURCES,
      usage: { read: (account) => Promise.resolve({ account, source: 'usage-report', readAt: new Date(), limits: [] }) },
      fetch: () => Promise.resolve({ status: 200 }),
      log: SILENT_LOG,
      userHome: rehearsal.root,
    });
  });
  afterEach(async () => {
    installation.close();
    await rehearsal.cleanup();
  });

  it('answers within the cold wait with the readings it has not completed left empty, for every project at once', async () => {
    for (const id of [FIRST_PROJECT, SECOND_PROJECT]) {
      const { forge } = installation.project(id);
      forge.workflowRuns = () => NEVER;
      forge.listIssues = () => NEVER;
    }
    const source = new SnapshotSource(installation, { coldReadWaitMs: COLD_WAIT_MS });

    const started = performance.now();
    const snapshot = CockpitSnapshotSchema.parse(JSON.parse(JSON.stringify(await source.snapshot())));
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(COLD_WAIT_MS * 4);
    for (const project of snapshot.projects) expect(project.workflows).toEqual({ value: null, readAt: null, error: null });
  });
});
