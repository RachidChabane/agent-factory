import type { RepositoryCommit } from '@agent-factory/adapters';
import type { DeploymentRecord, DeploymentState } from '@agent-factory/application';
import { describe, expect, it } from 'vitest';
import { DeploymentCommits, MAX_CACHED_RANGES, type ClonedHistory, type Commits } from './deployment-commits.ts';

const BASE = 'a'.repeat(40);
const MIDDLE = 'b'.repeat(40);
const HEAD = 'c'.repeat(40);
const BASE_HEAD = 'd'.repeat(40);

function commit(sha: string, message = `feat: ${sha.slice(0, 7)}`): RepositoryCommit {
  return { sha, message, authorName: 'Dana Reyes', committedAt: new Date('2026-10-12T08:00:00.000Z') };
}

function deployed(id: string, sha: string, state: DeploymentState = 'success'): DeploymentRecord {
  return { id, environment: 'storefront-staging', ref: 'main', sha, createdAt: new Date('2026-10-12T08:00:00.000Z'), creator: null, state, logUrl: null, environmentUrl: null };
}

class FakeClone implements ClonedHistory {
  readonly asked: string[] = [];
  baseHeadSha: string | null = BASE_HEAD;
  readonly ranges = new Map<string, Commits>();
  failing = false;

  commitsBetween(baseSha: string, headSha: string): Promise<Commits> {
    this.asked.push(`${baseSha}..${headSha}`);
    if (this.failing) return Promise.reject(new Error('git is not available'));
    return Promise.resolve(this.ranges.get(`${baseSha}..${headSha}`) ?? null);
  }

  baseHead(): Promise<string | null> {
    return Promise.resolve(this.baseHeadSha);
  }
}

describe('DeploymentCommits', () => {
  it('reads the commits each deployment brought from the nearest older deployment that landed', async () => {
    const clone = new FakeClone();
    clone.ranges.set(`${MIDDLE}..${HEAD}`, [commit(HEAD)]);
    clone.ranges.set(`${BASE}..${MIDDLE}`, [commit(MIDDLE)]);
    const changes = await new DeploymentCommits(clone).changes([deployed('3', HEAD), deployed('2', MIDDLE), deployed('1', BASE)]);
    expect(changes.get('3')?.map((entry) => entry.sha)).toEqual([HEAD]);
    expect(changes.get('2')?.map((entry) => entry.sha)).toEqual([MIDDLE]);
    expect(changes.get('1')).toBeNull();
  });

  it('keeps unknown apart from empty: a sha the clone lacks is null, the same sha deployed twice is an empty list', async () => {
    const clone = new FakeClone();
    const changes = await new DeploymentCommits(clone).changes([deployed('3', HEAD), deployed('2', MIDDLE), deployed('1', MIDDLE, 'inactive')]);
    expect(changes.get('3')).toBeNull();
    expect(changes.get('2')).toEqual([]);
  });

  it('asks the clone once for a range it answered, and again for one it could not', async () => {
    const clone = new FakeClone();
    clone.ranges.set(`${BASE}..${HEAD}`, [commit(HEAD)]);
    const commits = new DeploymentCommits(clone);
    const records = [deployed('2', HEAD), deployed('1', BASE)];
    await commits.changes(records);
    await commits.changes(records);
    expect(clone.asked).toEqual([`${BASE}..${HEAD}`]);
    await commits.changes([deployed('2', HEAD), deployed('1', MIDDLE)]);
    await commits.changes([deployed('2', HEAD), deployed('1', MIDDLE)]);
    expect(clone.asked.filter((range) => range === `${MIDDLE}..${HEAD}`)).toHaveLength(2);
  });

  it('asks the clone nothing for a second reading of the same deployments and of the commits waiting behind them', async () => {
    const clone = new FakeClone();
    clone.ranges.set(`${MIDDLE}..${HEAD}`, [commit(HEAD)]);
    clone.ranges.set(`${BASE}..${MIDDLE}`, [commit(MIDDLE)]);
    clone.ranges.set(`${HEAD}..${BASE_HEAD}`, [commit(BASE_HEAD)]);
    const commits = new DeploymentCommits(clone);
    const records = [deployed('3', HEAD), deployed('2', MIDDLE), deployed('1', BASE)];
    const read = async () => [await commits.changes(records), await commits.pending(records)] as const;

    const first = await read();
    const asked = [...clone.asked];
    const second = await read();

    expect(asked.toSorted()).toEqual([`${BASE}..${MIDDLE}`, `${HEAD}..${BASE_HEAD}`, `${MIDDLE}..${HEAD}`].toSorted());
    expect(clone.asked).toEqual(asked);
    expect(second).toEqual(first);
  });

  it('keys the commits waiting behind a deployment by the head of the base branch: a head that moved is a new range, one seen before is known', async () => {
    const clone = new FakeClone();
    const newer = 'e'.repeat(40);
    clone.ranges.set(`${HEAD}..${BASE_HEAD}`, [commit(BASE_HEAD)]);
    clone.ranges.set(`${HEAD}..${newer}`, [commit(BASE_HEAD), commit(newer)]);
    const commits = new DeploymentCommits(clone);
    const records = [deployed('1', HEAD)];

    expect((await commits.pending(records))?.map((entry) => entry.sha)).toEqual([BASE_HEAD]);
    clone.baseHeadSha = newer;
    expect((await commits.pending(records))?.map((entry) => entry.sha)).toEqual([BASE_HEAD, newer]);
    clone.baseHeadSha = BASE_HEAD;
    expect((await commits.pending(records))?.map((entry) => entry.sha)).toEqual([BASE_HEAD]);

    expect(clone.asked).toEqual([`${HEAD}..${BASE_HEAD}`, `${HEAD}..${newer}`]);
  });

  it('lets go of the range used least recently once the bound is reached, and reads it again when asked for it', async () => {
    const clone = new FakeClone();
    const heads = Array.from({ length: 3 }, (_, index) => `${index + 1}`.repeat(40));
    for (const head of heads) clone.ranges.set(`${HEAD}..${head}`, [commit(head)]);
    const commits = new DeploymentCommits(clone, 2);
    const records = [deployed('1', HEAD)];
    const pendingAt = async (head: string) => {
      clone.baseHeadSha = head;
      return commits.pending(records);
    };

    await pendingAt(heads[0] ?? '');
    await pendingAt(heads[1] ?? '');
    await pendingAt(heads[0] ?? '');
    await pendingAt(heads[2] ?? '');
    await pendingAt(heads[0] ?? '');
    await pendingAt(heads[1] ?? '');

    expect(clone.asked).toEqual([`${HEAD}..${heads[0]}`, `${HEAD}..${heads[1]}`, `${HEAD}..${heads[2]}`, `${HEAD}..${heads[1]}`]);
  });

  it('keeps the ranges of a project up to a bound, and no more, as the base branch moves on', async () => {
    const clone = new FakeClone();
    const heads = Array.from({ length: MAX_CACHED_RANGES + 1 }, (_, index) => index.toString(16).padStart(40, '0'));
    for (const head of heads) clone.ranges.set(`${HEAD}..${head}`, [commit(head)]);
    const commits = new DeploymentCommits(clone);
    const records = [deployed('1', HEAD)];
    for (const head of heads) {
      clone.baseHeadSha = head;
      await commits.pending(records);
    }
    expect(clone.asked).toHaveLength(heads.length);

    for (const head of [heads.at(-1), heads[1], heads[0]]) {
      clone.baseHeadSha = head ?? null;
      await commits.pending(records);
    }

    expect(clone.asked.slice(heads.length)).toEqual([`${HEAD}..${heads[0]}`]);
  });

  it('degrades to unknown when the clone fails, without failing the reading', async () => {
    const clone = new FakeClone();
    clone.failing = true;
    const changes = await new DeploymentCommits(clone).changes([deployed('2', HEAD), deployed('1', BASE)]);
    expect(changes.get('2')).toBeNull();
  });

  it('lists the commits of the base branch the current deployment lacks', async () => {
    const clone = new FakeClone();
    clone.ranges.set(`${HEAD}..${BASE_HEAD}`, [commit(BASE_HEAD)]);
    const pending = await new DeploymentCommits(clone).pending([deployed('2', HEAD), deployed('1', BASE)]);
    expect(pending?.map((entry) => entry.sha)).toEqual([BASE_HEAD]);
  });

  it('has no commits waiting when the deployment is at the head of the base branch, and nothing is known without a deployment or a base head', async () => {
    const clone = new FakeClone();
    const commits = new DeploymentCommits(clone);
    clone.baseHeadSha = HEAD;
    expect(await commits.pending([deployed('1', HEAD)])).toEqual([]);
    expect(await commits.pending([])).toBeNull();
    expect(await commits.pending([deployed('1', HEAD, 'failure')])).toBeNull();
    clone.baseHeadSha = null;
    expect(await commits.pending([deployed('1', HEAD)])).toBeNull();
  });
});
