import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CockpitSnapshotSchema } from '@agent-factory/cockpit';
import { openInstallation, type InstallationRuntime } from '../composition/installation/installation-runtime.ts';
import { SILENT_LOG } from '../composition/operation-log.ts';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { createRehearsal, FIRST_PROJECT, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';
import { FORGE_READ_INTERVAL_MS, SnapshotSource } from './snapshot-source.ts';

const TIMEOUT_MS = 60_000;
const DEPLOYMENT_TARGET = 'widgets-staging';
const UNKNOWN_SHA = 'f'.repeat(40);
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };
const STARTED_AT = new Date('2026-10-12T10:00:00.000Z');
const DELIVERY = { delivery: { environments: [{ name: 'staging', promotion: 'automatic', deployments: { kind: 'github', environment: DEPLOYMENT_TARGET } }] } };

function deployment(id: string, sha: string, createdAt: string) {
  return { id, ref: 'main', sha, createdAt, creator: 'release-engineer', state: 'success', logUrl: null, environmentUrl: null };
}

describe('the commits that deployments bring in the snapshot of the cockpit', { timeout: TIMEOUT_MS }, () => {
  let rehearsal: RehearsalEnvironment;
  let installation: InstallationRuntime;
  let first = '';
  let second = '';
  let third = '';
  let now = STARTED_AT;

  beforeAll(async () => {
    rehearsal = await createRehearsal({ projects: [FIRST_PROJECT], projectSettings: { [FIRST_PROJECT]: DELIVERY } });
    installation = await openInstallation(rehearsal.config, rehearsal.environment, {
      harnessFor: () => new RehearsalAgents(),
      resources: NORMAL_RESOURCES,
      usage: { read: (account) => Promise.resolve({ account, source: 'usage-report', readAt: new Date(), limits: [] }) },
      fetch: () => Promise.resolve({ status: 200 }),
      log: SILENT_LOG,
      userHome: rehearsal.root,
      clock: { now: () => now },
    });
    const project = rehearsal.project(FIRST_PROJECT);
    first = project.pushDirectCommit('first.md', 'first\n', 'docs: first\n\nWith a body.');
    second = project.pushDirectCommit('second.md', 'second\n', 'feat: second');
    third = project.pushDirectCommit('third.md', 'third\n', 'fix: third');
  }, TIMEOUT_MS);
  afterAll(async () => {
    installation?.close();
    await rehearsal?.cleanup();
  });

  async function recordDeployments(...records: readonly object[]): Promise<void> {
    const { forge } = rehearsal.project(FIRST_PROJECT).config;
    if (forge.kind !== 'local') throw new Error('the rehearsal project is not on a local forge');
    const directory = join(forge.directory, 'deployments');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${DEPLOYMENT_TARGET}.json`), JSON.stringify(records));
  }

  async function stagingOf(source: SnapshotSource) {
    const snapshot = CockpitSnapshotSchema.parse(JSON.parse(JSON.stringify(await source.snapshot())));
    const staging = snapshot.projects.find((project) => project.id === FIRST_PROJECT)?.environments.find((environment) => environment.name === 'staging');
    if (staging === undefined) throw new Error('the project has no staging environment');
    return staging;
  }

  it('reads what each deployment brought and what waits behind the current one from the clone of the project', async () => {
    await recordDeployments(deployment('1', first, '2026-10-12T08:00:00.000Z'), deployment('2', second, '2026-10-12T09:00:00.000Z'));

    const staging = await stagingOf(new SnapshotSource(installation));

    const read = staging.deployments?.value;
    expect(read?.current?.id).toBe('2');
    expect(read?.current?.changes?.map((entry) => [entry.headline, entry.author])).toEqual([['feat: second', 'Riley']]);
    expect(read?.history.map((entry) => entry.changes?.length ?? null)).toEqual([1, null]);
    expect(read?.pending?.map((entry) => entry.headline)).toEqual(['fix: third']);
    expect(staging.deployments?.readAt).not.toBeNull();
  });

  it('says that the commits are unknown, not that there are none, when the clone does not hold a deployed sha', async () => {
    await recordDeployments(deployment('1', first, '2026-10-12T08:00:00.000Z'), deployment('2', UNKNOWN_SHA, '2026-10-12T09:00:00.000Z'));

    const read = (await stagingOf(new SnapshotSource(installation))).deployments?.value;

    expect(read?.current?.changes).toBeNull();
    expect(read?.pending).toBeNull();
    expect(read?.history.map((entry) => entry.sha)).toEqual([UNKNOWN_SHA, first]);
  });

  it('runs no git command again for the ranges that a later reading of the deployments finds already read', async () => {
    await recordDeployments(deployment('1', first, '2026-10-12T08:00:00.000Z'), deployment('2', second, '2026-10-12T09:00:00.000Z'));
    const { forge, repository } = installation.project(FIRST_PROJECT);
    const ranges: string[] = [];
    const commitsBetween = repository.commitsBetween.bind(repository);
    repository.commitsBetween = (base, head) => {
      ranges.push(`${base}..${head}`);
      return commitsBetween(base, head);
    };
    let readings = 0;
    const deployments = forge.deployments.bind(forge);
    forge.deployments = (environment, limit) => {
      readings += 1;
      return deployments(environment, limit);
    };
    const source = new SnapshotSource(installation);

    const before = (await stagingOf(source)).deployments;
    expect(ranges.toSorted()).toEqual([`${first}..${second}`, `${second}..${third}`].toSorted());

    now = new Date(now.getTime() + FORGE_READ_INTERVAL_MS + 1);
    await stagingOf(source);
    await vi.waitFor(async () => expect((await stagingOf(source)).deployments?.readAt).toBe(now.toISOString()));

    expect(readings).toBe(2);
    expect(ranges).toHaveLength(2);
    expect((await stagingOf(source)).deployments?.value).toEqual({ ...before?.value });
  });

  it('lists no commit as waiting when the current deployment is at the head of the base branch', async () => {
    await recordDeployments(deployment('1', third, '2026-10-12T08:00:00.000Z'));

    const read = (await stagingOf(new SnapshotSource(installation))).deployments?.value;

    expect(read?.pending).toEqual([]);
    expect(read?.current?.changes).toBeNull();
  });
});
