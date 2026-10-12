import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CockpitSnapshotSchema } from '@agent-factory/cockpit';
import { openInstallation, type InstallationRuntime } from '../composition/installation/installation-runtime.ts';
import { SILENT_LOG } from '../composition/operation-log.ts';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { createRehearsal, FIRST_PROJECT, SECOND_PROJECT, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';
import { SnapshotSource } from './snapshot-source.ts';

const TAG = 'v1.0.0';
const MISSING_TAG = 'v9.9.9';
const TIMEOUT_MS = 60_000;
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };
/** The source clone of the second project, which the first one cites as the repository its specifications refer to. */
const SOURCE = '../../sources/gadgets';
const ISOLATED_GIT = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Riley', GIT_AUTHOR_EMAIL: 'riley@example.test', GIT_COMMITTER_NAME: 'Riley', GIT_COMMITTER_EMAIL: 'riley@example.test' };

function reference(name: string, ref: string): Record<string, unknown> {
  return { name, repository: `example-org/${name}`, ref, source: SOURCE };
}

describe('the references in the snapshot of the cockpit', { timeout: TIMEOUT_MS }, () => {
  let rehearsal: RehearsalEnvironment;
  let installation: InstallationRuntime;
  let commit: string;

  beforeEach(async () => {
    rehearsal = await createRehearsal({
      projects: [FIRST_PROJECT, SECOND_PROJECT],
      projectSettings: { [FIRST_PROJECT]: { references: [reference('design-tokens', TAG), reference('icon-set', TAG), reference('brand-assets', MISSING_TAG)] } },
    });
    const source = `${rehearsal.root}/sources/${SECOND_PROJECT}`;
    execFileSync('git', ['tag', TAG], { cwd: source, env: { ...process.env, ...ISOLATED_GIT } });
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, env: { ...process.env, ...ISOLATED_GIT }, encoding: 'utf8' }).trim();
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

  it('shows each reference of a project in the state of its snapshot, with the time that state was read', async () => {
    const [designTokens] = rehearsal.config.projects.find((project) => project.id === FIRST_PROJECT)?.references ?? [];
    if (designTokens === undefined) throw new Error('the project cites no reference');
    await installation.project(FIRST_PROJECT).references.materialise(designTokens);

    const snapshot = CockpitSnapshotSchema.parse(JSON.parse(JSON.stringify(await new SnapshotSource(installation).snapshot())));

    const widgets = snapshot.projects.find((project) => project.id === FIRST_PROJECT);
    expect(widgets?.references.map((view) => [view.name, view.repository, view.ref, view.snapshot.value])).toEqual([
      ['design-tokens', 'example-org/design-tokens', TAG, { status: 'ready', commit }],
      ['icon-set', 'example-org/icon-set', TAG, { status: 'not-built', commit }],
      ['brand-assets', 'example-org/brand-assets', MISSING_TAG, { status: 'missing-ref', commit: null }],
    ]);
    for (const view of widgets?.references ?? []) {
      expect(view.snapshot.error).toBeNull();
      expect(Date.parse(view.snapshot.readAt ?? '')).toBeGreaterThan(Date.now() - TIMEOUT_MS);
    }
  });

  it('gives a project that cites nothing an empty list, and announces how old a reading of the kind may be', async () => {
    const snapshot = CockpitSnapshotSchema.parse(JSON.parse(JSON.stringify(await new SnapshotSource(installation).snapshot())));

    expect(snapshot.projects.find((project) => project.id === SECOND_PROJECT)?.references).toEqual([]);
    expect(snapshot.installation.staleAfterMs.references).toBeGreaterThan(0);
  });

  it('reads a reference again only once the interval has passed, and keeps the time of the reading it shows', async () => {
    const source = new SnapshotSource(installation);
    const first = await source.snapshot();
    const second = await source.snapshot();

    const readAts = (snapshot: typeof first): (string | null)[] => (snapshot.projects.find((project) => project.id === FIRST_PROJECT)?.references ?? []).map((view) => view.snapshot.readAt);
    expect(readAts(second)).toEqual(readAts(first));
    expect(readAts(first).every((readAt) => readAt !== null)).toBe(true);
  });
});
