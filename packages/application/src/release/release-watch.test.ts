import { describe, expect, it } from 'vitest';
import { FakeGitHubGateway, InMemoryEventStore } from '../audit/testing/fakes.ts';
import { RELEASE_DETECTED_EVENT, RELEASE_TAGS_SEEDED_EVENT, watchReleases, type ReleaseModel } from './release-watch.ts';

const RELEASE_PLEASE: ReleaseModel = { kind: 'release-please', tagPattern: 'app-v*' };
const OPENED_AT = new Date('2026-10-08T09:30:00.000Z');

function pullRequest(number: number, headSha: string, branch = 'release-please--branches--main', title = 'chore(main): release app 1.3.0') {
  return { number, title, branch, headSha, url: `https://example.invalid/${number}`, labels: ['autorelease: pending'], createdAt: OPENED_AT };
}

describe('release watch', () => {
  it('remembers the existing release tags on first sight without evaluating them', async () => {
    const events = new InMemoryEventStore();
    const github = new FakeGitHubGateway();
    github.tags = [{ name: 'app-v1.2.0', sha: 'a12' }, { name: 'latest', sha: 'zzz' }];
    expect(await watchReleases({ events, github }, 'main', RELEASE_PLEASE)).toEqual([]);
    expect(events.typesOf('release/')).toEqual([RELEASE_TAGS_SEEDED_EVENT]);
    expect(await watchReleases({ events, github }, 'main', RELEASE_PLEASE)).toEqual([]);
  });

  it('detects a new tag with the previous tag of its component as base, once', async () => {
    const events = new InMemoryEventStore();
    const github = new FakeGitHubGateway();
    github.tags = [{ name: 'app-v1.9.0', sha: 'a19' }, { name: 'agent-v3.0.0', sha: 'g30' }];
    await watchReleases({ events, github }, 'main', RELEASE_PLEASE);
    github.tags = [...github.tags, { name: 'app-v1.10.0', sha: 'a110' }];
    const detected = await watchReleases({ events, github }, 'main', RELEASE_PLEASE);
    expect(detected.map((entry) => entry.descriptor)).toEqual([{ releaseId: 'app-v1.10.0', branch: 'app-v1.10.0', baseSha: 'a19' }]);
    expect(await watchReleases({ events, github }, 'main', RELEASE_PLEASE)).toEqual([]);
  });

  it('detects an open release-please pull request and again when its head moves', async () => {
    const events = new InMemoryEventStore();
    const github = new FakeGitHubGateway();
    github.tags = [{ name: 'app-v1.2.0', sha: 'a12' }];
    await watchReleases({ events, github }, 'main', RELEASE_PLEASE);
    github.openPullRequests = [pullRequest(31, 'h1'), pullRequest(32, 'x1', 'factory/32-thing')];
    const first = await watchReleases({ events, github }, 'main', RELEASE_PLEASE);
    expect(first.map((entry) => entry.descriptor)).toEqual([{ releaseId: 'pr-31', branch: 'main', baseSha: 'a12' }]);
    expect(await watchReleases({ events, github }, 'main', RELEASE_PLEASE)).toEqual([]);
    github.openPullRequests = [pullRequest(31, 'h2')];
    expect((await watchReleases({ events, github }, 'main', RELEASE_PLEASE)).map((entry) => entry.detection.headSha)).toEqual(['h2']);
    expect(events.typesOf('release/pr-31')).toEqual([RELEASE_DETECTED_EVENT, RELEASE_DETECTED_EVENT]);
    expect(first[0]?.detection).toMatchObject({ createdAt: OPENED_AT.toISOString(), supersededBy: null });
  });

  it('records a release pull request whose version is already tagged as superseded by that tag', async () => {
    const events = new InMemoryEventStore();
    const github = new FakeGitHubGateway();
    github.tags = [{ name: 'app-v1.2.0', sha: 'a12' }, { name: 'app-v1.3.0', sha: 'a13' }];
    await watchReleases({ events, github }, 'main', RELEASE_PLEASE);
    github.openPullRequests = [pullRequest(31, 'h1')];
    const [stale] = await watchReleases({ events, github }, 'main', RELEASE_PLEASE);
    expect(stale?.detection).toMatchObject({ releaseId: 'pr-31', supersededBy: 'app-v1.3.0' });
    expect(await watchReleases({ events, github }, 'main', RELEASE_PLEASE)).toEqual([]);
  });

  it('dates a new tag with its commit and ignores tags outside the pattern', async () => {
    const events = new InMemoryEventStore();
    const github = new FakeGitHubGateway();
    const tagged = new Date('2026-10-09T15:00:00.000Z');
    github.tags = [{ name: 'v1.0.0', sha: 'v10' }];
    const model: ReleaseModel = { kind: 'tags', tagPattern: 'v*' };
    await watchReleases({ events, github }, 'main', model);
    github.tags = [...github.tags, { name: 'v1.1.0', sha: 'v11' }, { name: 'nightly', sha: 'n1' }];
    github.history.push({ sha: 'v11', authorLogin: 'riley-chen', message: 'feat: add the wishlist', committedAt: tagged, pullRequestNumber: 12, pullRequestBranch: 'factory/12-wishlist', pullRequestLabels: ['factory'] });
    const detected = await watchReleases({ events, github }, 'main', model);
    expect(detected.map((entry) => entry.detection)).toEqual([expect.objectContaining({ releaseId: 'v1.1.0', baseSha: 'v10', createdAt: tagged.toISOString() })]);
  });

  it('tracks nothing for a project without releases', async () => {
    const events = new InMemoryEventStore();
    const github = new FakeGitHubGateway();
    github.tags = [{ name: 'v1.0.0', sha: 'v10' }];
    expect(await watchReleases({ events, github }, 'main', { kind: 'none' })).toEqual([]);
    expect(events.records).toEqual([]);
  });
});
