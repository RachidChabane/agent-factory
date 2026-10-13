import { describe, expect, it } from 'vitest';
import type { ProjectView } from '../../contract/index.ts';
import { LEDGER_ID, STOREFRONT_ID } from '../../test/fixtures/project-ids.ts';
import { fixtureSnapshot, TEST_NOW } from '../../test/render.tsx';
import { DAY_MS, HOUR_MS } from '../../i18n/formatters.ts';
import { buildChanges, isQuiet } from './changes-model.ts';

function projectNamed(id: string): ProjectView {
  const found = fixtureSnapshot().projects.find((project) => project.id === id);
  if (found === undefined) throw new Error(`no project ${id} in the fixture world`);
  return found;
}

const storefront = projectNamed(STOREFRONT_ID);
const ledger = projectNamed(LEDGER_ID);

function laneOf(project: ProjectView, name: string, since: number) {
  const lane = buildChanges([project], since).projects[0]?.lanes.find((entry) => entry.name === name);
  if (lane === undefined) throw new Error(`no lane ${name}`);
  return lane;
}

describe('the changes since a moment', () => {
  it('keeps only the pull request events and the deployments that happened since, newest first', () => {
    const recent = buildChanges([storefront], TEST_NOW - 2 * HOUR_MS).projects[0];
    const wide = buildChanges([storefront], TEST_NOW - 30 * DAY_MS).projects[0];
    expect(recent?.pullRequests.length).toBeLessThanOrEqual(wide?.pullRequests.length ?? 0);
    const times = (wide?.pullRequests ?? []).map((pullRequest) => Date.parse(pullRequest.lastEventAt));
    expect(times).toEqual([...times].sort((left, right) => right - left));
    for (const pullRequest of recent?.pullRequests ?? []) {
      expect(pullRequest.events.every((event) => Date.parse(event.at) >= TEST_NOW - 2 * HOUR_MS)).toBe(true);
    }
    const deployments = laneOf(storefront, 'development', TEST_NOW - 3 * HOUR_MS).deployments;
    expect(deployments.every((deployment) => Date.parse(deployment.deployedAt) >= TEST_NOW - 3 * HOUR_MS)).toBe(true);
  });

  it('counts every deployment of the period, the redeployments of one commit included, and the failed ones apart', () => {
    const lane = laneOf(storefront, 'staging', TEST_NOW - 90 * DAY_MS);
    const read = storefront.environments.find((environment) => environment.name === 'staging')?.deployments?.value;
    expect(lane.deployments.reduce((sum, deployment) => sum + deployment.occurrences, 0)).toBe(read?.history.length);
    const summary = buildChanges([storefront], TEST_NOW - 90 * DAY_MS).summary;
    expect(summary.failedDeployments).toBeGreaterThan(0);
    expect(summary.deployments).toBeGreaterThanOrEqual(summary.failedDeployments);
  });

  it('folds the redeployments of one commit that ended the same way into one deployment and keeps its delivered commits', () => {
    const lane = laneOf(storefront, 'development', TEST_NOW - 30 * DAY_MS);
    const repeated = lane.deployments.find((deployment) => deployment.occurrences > 1);
    expect(repeated).toBeUndefined();
    const doubled = {
      ...storefront,
      environments: storefront.environments.map((environment) => {
        const read = environment.deployments?.value;
        if (environment.name !== 'development' || environment.deployments === null || read === null || read === undefined) return environment;
        const [newest, ...older] = read.history;
        if (newest === undefined) return environment;
        const again = { ...newest, id: 'again', changes: [] };
        return { ...environment, deployments: { ...environment.deployments, value: { ...read, history: [again, newest, ...older] } } };
      }),
    };
    const merged = laneOf(doubled, 'development', TEST_NOW - 30 * DAY_MS).deployments[0];
    expect(merged?.occurrences).toBe(2);
    expect(merged?.id).toBe('again');
    expect(merged?.changes?.length).toBeGreaterThan(0);
  });

  it('lists the commits waiting only for the environments that not every merge reaches', () => {
    expect(laneOf(storefront, 'development', 0).pendingApplies).toBe(false);
    expect(laneOf(storefront, 'development', 0).pending).toBeNull();
    expect(laneOf(storefront, 'staging', 0).pendingApplies).toBe(true);
    expect(laneOf(storefront, 'staging', 0).pending?.length).toBeGreaterThan(0);
    expect(laneOf(storefront, 'production', 0).pending?.length).toBeGreaterThan(0);
  });

  it('leaves an environment without a deployment source with no deployment and no waiting commit, but its existence', () => {
    const lane = laneOf(ledger, 'staging', 0);
    expect(lane).toMatchObject({ name: 'staging', current: null, deployments: [], pending: null, reading: null });
  });

  it('tells a project where nothing changed from one where something did', () => {
    const farFuture = TEST_NOW + DAY_MS;
    const quiet = buildChanges([ledger], farFuture).projects[0];
    expect(quiet !== undefined && isQuiet(quiet)).toBe(true);
    const busy = buildChanges([storefront], TEST_NOW - 30 * DAY_MS).projects[0];
    expect(busy !== undefined && isQuiet(busy)).toBe(false);
  });

  it('counts the pull requests that were merged in the period', () => {
    const summary = buildChanges([storefront, ledger], TEST_NOW - 365 * DAY_MS).summary;
    const merged = [storefront, ledger].flatMap((project) => project.pullRequests).filter((pullRequest) => pullRequest.mergedAt !== null).length;
    expect(summary.mergedPullRequests).toBe(merged);
  });
});

describe('the reading the deployment counts come from', () => {
  const READ_AT = '2026-10-12T09:20:00.000Z';

  function withReadings(project: ProjectView, readAts: Readonly<Record<string, string | null>>): ProjectView {
    return {
      ...project,
      environments: project.environments.map((environment) => {
        const readAt = readAts[environment.name];
        if (environment.deployments === null || readAt === undefined) return environment;
        return { ...environment, deployments: { ...environment.deployments, readAt } };
      }),
    };
  }

  it('is the oldest of the readings of the environments that declare a source', () => {
    const project = withReadings(storefront, { development: '2026-10-12T09:58:00.000Z', staging: READ_AT, production: '2026-10-12T09:57:00.000Z' });
    expect(buildChanges([project], TEST_NOW - 90 * DAY_MS).summary.deploymentsRead).toEqual({ kind: 'read', readAt: READ_AT });
  });

  it('is unknown when one of the sources was never read', () => {
    const project = withReadings(storefront, { development: '2026-10-12T09:58:00.000Z', staging: null, production: '2026-10-12T09:57:00.000Z' });
    expect(buildChanges([project], TEST_NOW - 90 * DAY_MS).summary.deploymentsRead).toEqual({ kind: 'read', readAt: null });
  });

  it('says that nothing was read when no environment declares a source', () => {
    const bare = { ...storefront, environments: storefront.environments.map((environment) => ({ ...environment, deployments: null })) };
    expect(buildChanges([bare], TEST_NOW - 90 * DAY_MS).summary.deploymentsRead).toEqual({ kind: 'none' });
    expect(buildChanges([], TEST_NOW).summary.deploymentsRead).toEqual({ kind: 'none' });
  });
});

describe('the health the status of a lane comes from', () => {
  it('was sampled when the oldest of the latest samples of its checks was taken', () => {
    const staging = laneOf(storefront, 'staging', TEST_NOW - 90 * DAY_MS);
    const samples = (storefront.environments.find((environment) => environment.name === 'staging')?.health ?? []).flatMap((check) => (check.latest === null ? [] : [check.latest.at]));
    expect(samples.length).toBeGreaterThan(0);
    expect(staging.statusSampledAt).toBe(samples.toSorted()[0]);
  });

  it('was never sampled when no check has a sample', () => {
    const unsampled = {
      ...storefront,
      environments: storefront.environments.map((environment) => ({ ...environment, health: environment.health.map((check) => ({ ...check, latest: null, series: [] })) })),
    };
    expect(laneOf(unsampled, 'production', TEST_NOW).statusSampledAt).toBeNull();
  });
});

