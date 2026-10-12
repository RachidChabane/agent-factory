import { describe, expect, it } from 'vitest';
import { attributionRules, DEFAULT_PROJECT_CONVENTIONS } from '../conventions/project-conventions.ts';
import { REASON_NO_HEALTH_CHECKS } from '@agent-factory/domain';
import { auditSubject, AUDIT_DETECTED_EVENT } from '../audit/events.ts';
import { commit, factoryCommit, FakeGitHubGateway, InMemoryEventStore } from '../audit/testing/fakes.ts';
import { CutRelease, RELEASE_CUT_EVENT, ReleaseCutPayloadSchema, ReleaseCutRefusedError } from './cut-release.ts';
import { PULL_REQUEST_OPENED_EVENT, pullRequestSubject, RELEASE_EVALUATED_EVENT } from './events.ts';
import { FakeHealthProbe, type EnvironmentHealth } from './health-probe.ts';
import { RELEASE_DETECTED_EVENT, watchReleases, type ReleaseModel } from './release-watch.ts';

const MODEL: ReleaseModel = { kind: 'release-please', tagPattern: 'app-v*' };
const HEALTHY: readonly EnvironmentHealth[] = [
  { environment: 'staging', probe: new FakeHealthProbe([{ name: 'ui', url: 'https://staging.example.com/', passed: true, statusCode: 200, latencyMs: 90, detail: 'HTTP 200' }]) },
];

function releasePullRequest(headSha: string) {
  return { number: 31, title: 'chore(main): release app 1.3.0', branch: 'release-please--branches--main', headSha, url: 'https://example.invalid/31', labels: [], createdAt: null };
}

async function setup(health = HEALTHY) {
  const events = new InMemoryEventStore();
  const github = new FakeGitHubGateway();
  github.tags = [{ name: 'app-v1.2.0', sha: 'a12' }];
  github.history.push(commit({ sha: 'a12' }), factoryCommit('f1', 10));
  await events.append(PULL_REQUEST_OPENED_EVENT, pullRequestSubject(10), { number: 10, evidenceComplete: true });
  await watchReleases({ events, github }, 'main', MODEL);
  github.openPullRequests = [releasePullRequest('h1')];
  await watchReleases({ events, github }, 'main', MODEL);
  github.checkRuns = [{ name: 'ci', conclusion: 'success', url: 'https://example.invalid/ci' }];
  return { events, github, cut: new CutRelease({ events, github, health, rules: attributionRules(DEFAULT_PROJECT_CONVENTIONS) }) };
}

describe('cutting a release on operator order', () => {
  it('re-evaluates the gate, then squash-merges the release pull request at the head it evaluated and records the cut', async () => {
    const { events, github, cut } = await setup();
    const outcome = await cut.cut({ releaseId: 'pr-31', operator: 'alex' });
    expect(github.merges).toEqual([{ number: 31, headSha: 'h1' }]);
    expect(outcome).toEqual({ releaseId: 'pr-31', pullRequestNumber: 31, headSha: 'h1', mergeSha: 'merge-of-31', operator: 'alex' });
    expect(events.typesOf('release/pr-31')).toEqual([RELEASE_DETECTED_EVENT, RELEASE_EVALUATED_EVENT, RELEASE_CUT_EVENT]);
    expect(ReleaseCutPayloadSchema.parse(events.records.at(-1)?.payload).mergeSha).toBe('merge-of-31');
    await expect(cut.cut({ releaseId: 'pr-31', operator: 'alex' })).rejects.toThrow('it was cut as merge-of-31');
  });

  it('refuses with the blocking reasons while the gate is not promotable, and merges nothing', async () => {
    const { events, github, cut } = await setup([{ environment: 'staging', probe: new FakeHealthProbe([]) }]);
    await events.append(AUDIT_DETECTED_EVENT, auditSubject('f1'), { commitSha: 'f1', reason: 'direct-push', commitMessage: 'm', authorLogin: null, pullRequestNumber: null });
    const refused = cut.cut({ releaseId: 'pr-31', operator: 'alex' });
    await expect(refused).rejects.toBeInstanceOf(ReleaseCutRefusedError);
    await expect(refused).rejects.toMatchObject({ blockingReasons: ['audit detected is open on commit f1', REASON_NO_HEALTH_CHECKS] });
    expect(github.merges).toEqual([]);
  });

  it('records the moved head before evaluating, and refuses while checks run on it', async () => {
    const { events, github, cut } = await setup();
    github.openPullRequests = [releasePullRequest('h2')];
    github.checkRuns = [{ name: 'ci', conclusion: 'pending', url: 'https://example.invalid/ci' }];
    await expect(cut.cut({ releaseId: 'pr-31', operator: 'alex' })).rejects.toThrow('checks still running: ci (pending)');
    expect(events.typesOf('release/pr-31').filter((type) => type === RELEASE_DETECTED_EVENT)).toHaveLength(2);
    expect(github.merges).toEqual([]);
  });

  it('refuses a release that comes from a tag or whose pull request is no longer open', async () => {
    const { events, github, cut } = await setup();
    github.tags = [...github.tags, { name: 'app-v1.3.0', sha: 'a13' }];
    await watchReleases({ events, github }, 'main', MODEL);
    await expect(cut.cut({ releaseId: 'app-v1.3.0', operator: 'alex' })).rejects.toThrow('already cut');
    github.openPullRequests = [];
    await expect(cut.cut({ releaseId: 'pr-31', operator: 'alex' })).rejects.toThrow('release pull request #31 is not open');
    await expect(cut.cut({ releaseId: 'pr-99', operator: 'alex' })).rejects.toThrow('release pr-99 was never detected');
  });
});
