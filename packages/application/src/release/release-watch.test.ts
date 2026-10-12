import { describe, expect, it } from 'vitest';
import { FakeGitHubGateway, InMemoryEventStore } from '../audit/testing/fakes.ts';
import { RELEASE_DETECTED_EVENT, RELEASE_TAGS_SEEDED_EVENT, watchReleases } from './release-watch.ts';

function pullRequest(number: number, headSha: string, branch = 'release-please--branches--main') {
  return { number, title: 'chore(main): release app 1.3.0', branch, headSha, url: `https://example.invalid/${number}`, labels: ['autorelease: pending'] };
}

describe('release watch', () => {
  it('remembers the existing release tags on first sight without evaluating them', async () => {
    const events = new InMemoryEventStore();
    const github = new FakeGitHubGateway();
    github.tags = [{ name: 'app-v1.2.0', sha: 'a12' }, { name: 'latest', sha: 'zzz' }];
    expect(await watchReleases({ events, github }, 'main')).toEqual([]);
    expect(events.typesOf('release/')).toEqual([RELEASE_TAGS_SEEDED_EVENT]);
    expect(await watchReleases({ events, github }, 'main')).toEqual([]);
  });

  it('detects a new tag with the previous tag of its component as base, once', async () => {
    const events = new InMemoryEventStore();
    const github = new FakeGitHubGateway();
    github.tags = [{ name: 'app-v1.9.0', sha: 'a19' }, { name: 'agent-v3.0.0', sha: 'g30' }];
    await watchReleases({ events, github }, 'main');
    github.tags = [...github.tags, { name: 'app-v1.10.0', sha: 'a110' }];
    const detected = await watchReleases({ events, github }, 'main');
    expect(detected.map((entry) => entry.descriptor)).toEqual([{ releaseId: 'app-v1.10.0', branch: 'app-v1.10.0', baseSha: 'a19' }]);
    expect(await watchReleases({ events, github }, 'main')).toEqual([]);
  });

  it('detects an open release-please pull request and again when its head moves', async () => {
    const events = new InMemoryEventStore();
    const github = new FakeGitHubGateway();
    github.tags = [{ name: 'app-v1.2.0', sha: 'a12' }];
    await watchReleases({ events, github }, 'main');
    github.openPullRequests = [pullRequest(31, 'h1'), pullRequest(32, 'x1', 'factory/32-thing')];
    const first = await watchReleases({ events, github }, 'main');
    expect(first.map((entry) => entry.descriptor)).toEqual([{ releaseId: 'pr-31', branch: 'main', baseSha: 'a12' }]);
    expect(await watchReleases({ events, github }, 'main')).toEqual([]);
    github.openPullRequests = [pullRequest(31, 'h2')];
    expect((await watchReleases({ events, github }, 'main')).map((entry) => entry.detection.headSha)).toEqual(['h2']);
    expect(events.typesOf('release/pr-31')).toEqual([RELEASE_DETECTED_EVENT, RELEASE_DETECTED_EVENT]);
  });
});
