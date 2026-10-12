import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Clock } from '@agent-factory/application';
import { PullRequestHeadMovedError } from '../github/errors.ts';
import { localOnlyGitEnvironment } from '../git/remoteLocality.ts';
import {
  createTestRepositories,
  git,
  TEST_BASE_BRANCH,
  TEST_GIT_ENVIRONMENT,
  TEST_IDENTITY,
  testRunner,
  writeRepositoryFile,
  type TestRepositories,
} from '../git/testSupport.ts';
import type { LocalCheckMode } from './constants.ts';
import { LocalGitHubFileError, LocalMergeConflictError, LocalPullRequestRefusedError, LocalRecordNotFoundError, UnknownCommitError } from './errors.ts';
import { LocalGateChecks, type LocalCheckRun, type LocalCheckRunner } from './localGateChecks.ts';
import { LocalGitHubGateway } from './localGitHubGateway.ts';

const NOW = new Date('2026-10-10T08:00:00.000Z');
const FIXED_CLOCK: Clock = { now: () => NOW };
const BRANCH = 'factory/1-serve-the-domain';
const SPEC_BODY = '## Need\n\nThe domain reaches the UI.\n';

describe('LocalGitHubGateway', () => {
  let repositories: TestRepositories;
  let directory: string;

  beforeEach(async () => {
    repositories = await createTestRepositories();
    directory = join(repositories.root, 'github');
  });
  afterEach(async () => {
    await repositories.cleanup();
  });

  function gateway(checks: LocalCheckMode = 'none'): LocalGitHubGateway {
    return new LocalGitHubGateway(
      testRunner(),
      {
        directory,
        bareRepositoryPath: repositories.remote,
        baseBranch: TEST_BASE_BRANCH,
        checks,
        identity: TEST_IDENTITY,
        environment: localOnlyGitEnvironment(TEST_GIT_ENVIRONMENT),
      },
      FIXED_CLOCK,
    );
  }

  async function pushBranch(path: string, content: string, message: string, branch = BRANCH): Promise<string> {
    const current = git(repositories.clone, 'rev-parse', '--abbrev-ref', 'HEAD');
    if (current !== branch) git(repositories.clone, 'checkout', '-B', branch, `origin/${TEST_BASE_BRANCH}`);
    await writeRepositoryFile(repositories.clone, path, content);
    git(repositories.clone, 'add', '--all');
    git(repositories.clone, 'commit', '--message', message);
    git(repositories.clone, 'push', '--force', 'origin', branch);
    return git(repositories.clone, 'rev-parse', 'HEAD');
  }

  function bareHead(branch: string): string {
    return git(repositories.remote, 'rev-parse', `refs/heads/${branch}`);
  }

  describe('deployments and workflow dispatch', () => {
    it('reads the recorded deployments of an environment, newest first, and none for an unknown one', async () => {
      const github = gateway();
      await mkdir(join(directory, 'deployments'), { recursive: true });
      await writeFile(
        join(directory, 'deployments', 'widgets-dev.json'),
        JSON.stringify([
          { id: 'd1', ref: 'main', sha: 'a'.repeat(40), createdAt: '2026-10-09T10:00:00.000Z', creator: 'deployer', state: 'inactive', logUrl: null, environmentUrl: null },
          { id: 'd2', ref: 'main', sha: 'b'.repeat(40), createdAt: '2026-10-09T12:00:00.000Z', creator: 'deployer', state: 'success', logUrl: null, environmentUrl: null },
        ]),
      );
      expect((await github.deployments('widgets-dev', 5)).map((deployment) => [deployment.id, deployment.environment, deployment.createdAt.toISOString()])).toEqual([
        ['d2', 'widgets-dev', '2026-10-09T12:00:00.000Z'],
        ['d1', 'widgets-dev', '2026-10-09T10:00:00.000Z'],
      ]);
      expect(await github.deployments('widgets-prep', 5)).toEqual([]);
      await expect(github.deployments('../escape', 5)).rejects.toBeInstanceOf(LocalGitHubFileError);
    });

    it('records a dispatch as a simulation and never runs a workflow', async () => {
      const github = gateway();
      const receipt = await github.dispatchWorkflow({ workflow: 'cloud-delivery.yml', ref: 'main', inputs: { build: 'skip', deploy: 'true' } });
      expect(receipt.simulated).toBe(true);
      const recorded = JSON.parse(await readFile(fileURLToPath(receipt.url), 'utf8'));
      expect(recorded).toEqual({ number: 1, workflow: 'cloud-delivery.yml', ref: 'main', inputs: { build: 'skip', deploy: 'true' }, recordedAt: NOW.toISOString() });
      const second = await github.dispatchWorkflow({ workflow: 'cloud-delivery.yml', ref: 'main', inputs: {} });
      expect(second.url.endsWith('workflow-dispatches/2.json')).toBe(true);
    });
  });

  describe('issues', () => {
    it('creates numbered issue files with their front matter and reads them back', async () => {
      const github = gateway();
      const first = await github.createIssue('Serve the domain', SPEC_BODY, ['type:infra', 'spec:validated', 'type:infra']);
      const second = await github.createIssue('Another', SPEC_BODY, []);
      expect([first.number, second.number]).toEqual([1, 2]);
      const opened = NOW.toISOString();
      expect(await readFile(join(directory, 'issues', '1.md'), 'utf8')).toBe(
        [
          '---',
          'title: Serve the domain',
          'labels:',
          '  - type:infra',
          '  - spec:validated',
          'state: open',
          'blockedBy: []',
          `createdAt: ${opened}`,
          `updatedAt: ${opened}`,
          '---',
          '',
          SPEC_BODY,
        ].join('\n'),
      );
      expect(await github.getIssue(1)).toEqual({
        number: 1,
        title: 'Serve the domain',
        body: SPEC_BODY,
        labels: ['type:infra', 'spec:validated'],
        state: 'open',
        blockedBy: [],
        createdAt: NOW,
        updatedAt: NOW,
      });
      await expect(github.getIssue(9)).rejects.toBeInstanceOf(LocalRecordNotFoundError);
    });

    it('keeps the time an issue was opened when it is relabelled, and dates a hand-written issue from its file', async () => {
      let now = NOW;
      const github = new LocalGitHubGateway(
        testRunner(),
        { directory, bareRepositoryPath: repositories.remote, baseBranch: TEST_BASE_BRANCH, checks: 'none', identity: TEST_IDENTITY, environment: localOnlyGitEnvironment(TEST_GIT_ENVIRONMENT) },
        { now: () => now },
      );
      const issue = await github.createIssue('Serve the domain', SPEC_BODY, ['type:infra']);
      now = new Date(NOW.getTime() + 60_000);
      await github.setLabels(issue.number, ['spec:validated'], []);
      expect(await github.getIssue(issue.number)).toMatchObject({ labels: ['type:infra', 'spec:validated'], createdAt: NOW, updatedAt: now });
      await writeFile(join(directory, 'issues', '2.md'), ['---', 'title: Written by hand', 'labels: []', '---', '', SPEC_BODY].join('\n'));
      const written = await github.getIssue(2);
      expect(written.createdAt.getTime()).toBe(written.updatedAt.getTime());
    });

    it('lists the open issues carrying a label', async () => {
      const github = gateway();
      await github.createIssue('Labelled', SPEC_BODY, ['automation']);
      await github.createIssue('Unlabelled', SPEC_BODY, []);
      await github.createIssue('Closed later', SPEC_BODY, ['automation']);
      const path = join(directory, 'issues', '3.md');
      await writeFile(path, (await readFile(path, 'utf8')).replace('state: open', 'state: closed'));
      expect((await github.listIssues('automation')).map((issue) => issue.number)).toEqual([1]);
    });

    it('records dependencies once, relabels and collects comments', async () => {
      const github = gateway();
      await github.createIssue('Blocked', SPEC_BODY, ['spec:draft', 'type:ui']);
      await github.createIssue('Blocker', SPEC_BODY, []);
      await github.addBlockedBy(1, 2);
      await github.addBlockedBy(1, 2);
      await github.setLabels(1, ['spec:validated'], ['spec:draft', 'absent']);
      await github.comment(1, 'first');
      await github.comment(1, '@someone second');
      expect(await github.getIssue(1)).toMatchObject({ blockedBy: [2], labels: ['type:ui', 'spec:validated'] });
      expect(JSON.parse(await readFile(join(directory, 'comments', '1.json'), 'utf8'))).toEqual([
        { body: 'first', createdAt: NOW.toISOString() },
        { body: '@someone second', createdAt: NOW.toISOString() },
      ]);
      await expect(github.comment(7, 'nowhere')).rejects.toBeInstanceOf(LocalRecordNotFoundError);
      await expect(github.addBlockedBy(1, 7)).rejects.toBeInstanceOf(LocalRecordNotFoundError);
    });

    it('refuses an issue file that does not match its schema', async () => {
      const github = gateway();
      await github.createIssue('Broken', SPEC_BODY, []);
      const path = join(directory, 'issues', '1.md');
      await writeFile(path, (await readFile(path, 'utf8')).replace('state: open', 'state: pending'));
      await expect(github.getIssue(1)).rejects.toBeInstanceOf(LocalGitHubFileError);
    });
  });

  describe('pull requests', () => {
    it('refuses a pull request for a branch the local remote does not have', async () => {
      await expect(gateway().openPullRequest({ branch: BRANCH, title: 't', body: 'b', labels: [], closes: [] })).rejects.toBeInstanceOf(
        LocalPullRequestRefusedError,
      );
    });

    it('opens a pull request in the shared number space with its rendered body', async () => {
      const github = gateway();
      await github.createIssue('Serve the domain', SPEC_BODY, ['type:infra']);
      const head = await pushBranch('src/app.txt', 'changed\n', 'ci(infra): serve the domain');
      const opened = await github.openPullRequest({
        branch: BRANCH,
        title: 'ci(infra): serve the domain',
        body: 'Proof attached.',
        labels: ['factory', 'type:infra'],
        closes: [1],
      });
      expect(opened.number).toBe(2);
      expect(opened.headSha).toBe(head);
      expect(fileURLToPath(opened.url)).toBe(join(directory, 'pulls', '2.md'));
      expect(await readFile(join(directory, 'pulls', '2.md'), 'utf8')).toBe('Proof attached.\n\nCloses #1\n');
      expect(JSON.parse(await readFile(join(directory, 'pulls', '2.json'), 'utf8'))).toEqual({
        number: 2,
        title: 'ci(infra): serve the domain',
        head: BRANCH,
        base: TEST_BASE_BRANCH,
        labels: ['factory', 'type:infra'],
        closes: [1],
        state: 'open',
        author: TEST_IDENTITY.name,
        createdAt: NOW.toISOString(),
        mergeSha: null,
        mergedAt: null,
      });
      await expect(github.openPullRequest({ branch: BRANCH, title: 't', body: 'b', labels: [], closes: [] })).rejects.toBeInstanceOf(
        LocalPullRequestRefusedError,
      );
      await github.updatePullRequestBody(2, 'Updated.');
      expect(await github.pullRequestDetails(2)).toEqual({ number: 2, title: 'ci(infra): serve the domain', body: 'Updated.', authorLogin: TEST_IDENTITY.name, state: 'open' });
    });

    it('reports the live head of an open pull request', async () => {
      const github = gateway();
      await pushBranch('src/app.txt', 'one\n', 'first');
      await github.openPullRequest({ branch: BRANCH, title: 't', body: 'b', labels: [], closes: [] });
      const moved = await pushBranch('src/app.txt', 'two\n', 'second');
      expect(await github.findOpenPullRequest(BRANCH)).toMatchObject({ number: 1, headSha: moved });
      expect(await github.findOpenPullRequest('factory/2-other')).toBeNull();
    });

    it('squash-merges the reviewed head into the base branch and closes the linked issues', async () => {
      const github = gateway();
      await github.createIssue('Serve the domain', SPEC_BODY, ['type:infra']);
      const baseBefore = bareHead(TEST_BASE_BRANCH);
      await pushBranch('src/app.txt', 'one\n', 'test(infra): add acceptance checks for #1');
      const head = await pushBranch('src/new.txt', 'two\n', 'ci(infra): serve the domain');
      const opened = await github.openPullRequest({ branch: BRANCH, title: 'ci(infra): serve the domain', body: 'b', labels: [], closes: [1] });

      const mergeSha = await github.squashMerge(opened.number, head);

      expect(bareHead(TEST_BASE_BRANCH)).toBe(mergeSha);
      expect(git(repositories.remote, 'rev-list', '--parents', '-n', '1', mergeSha)).toBe(`${mergeSha} ${baseBefore}`);
      expect(git(repositories.remote, 'rev-parse', `${mergeSha}^{tree}`)).toBe(git(repositories.remote, 'rev-parse', `${head}^{tree}`));
      expect(git(repositories.remote, 'log', '-1', '--format=%B', mergeSha)).toBe(
        'ci(infra): serve the domain (#2)\n\n* test(infra): add acceptance checks for #1\n* ci(infra): serve the domain',
      );
      expect(git(repositories.remote, 'log', '-1', '--format=%an <%ae>', mergeSha)).toBe(`${TEST_IDENTITY.name} <${TEST_IDENTITY.email}>`);
      expect((await github.getIssue(1)).state).toBe('closed');
      expect(await github.findOpenPullRequest(BRANCH)).toBeNull();
      await expect(github.squashMerge(opened.number, head)).rejects.toBeInstanceOf(LocalPullRequestRefusedError);
    });

    it('refuses to merge when the head moved', async () => {
      const github = gateway();
      const reviewed = await pushBranch('src/app.txt', 'one\n', 'first');
      const opened = await github.openPullRequest({ branch: BRANCH, title: 't', body: 'b', labels: [], closes: [] });
      await pushBranch('src/app.txt', 'two\n', 'second');
      const baseBefore = bareHead(TEST_BASE_BRANCH);
      await expect(github.squashMerge(opened.number, reviewed)).rejects.toBeInstanceOf(PullRequestHeadMovedError);
      expect(bareHead(TEST_BASE_BRANCH)).toBe(baseBefore);
    });

    it('refuses a merge that conflicts with the base branch', async () => {
      const github = gateway();
      const head = await pushBranch('src/app.txt', 'branch side\n', 'branch');
      const opened = await github.openPullRequest({ branch: BRANCH, title: 't', body: 'b', labels: [], closes: [] });
      await repositories.pushToRemote('src/app.txt', 'base side\n', 'base moved');
      const baseBefore = bareHead(TEST_BASE_BRANCH);
      await expect(github.squashMerge(opened.number, head)).rejects.toBeInstanceOf(LocalMergeConflictError);
      expect(bareHead(TEST_BASE_BRANCH)).toBe(baseBefore);
    });
  });

  describe('history', () => {
    it('lists the commits since a known one with the pull request that produced them', async () => {
      const github = gateway();
      const seed = bareHead(TEST_BASE_BRANCH);
      await repositories.pushToRemote('docs/direct.md', 'direct\n', 'docs: direct push');
      const head = await pushBranch('src/app.txt', 'merged\n', 'ci(infra): serve the domain');
      const opened = await github.openPullRequest({ branch: BRANCH, title: 'ci(infra): serve the domain', body: 'b', labels: ['factory', 'type:infra'], closes: [] });
      const mergeSha = await github.squashMerge(opened.number, head);

      const commits = await github.commitsSince(TEST_BASE_BRANCH, seed);
      expect(commits.map((commit) => commit.message)).toEqual(['docs: direct push', 'ci(infra): serve the domain (#1)\n\n* ci(infra): serve the domain']);
      expect(commits[1]).toMatchObject({
        sha: mergeSha,
        authorLogin: TEST_IDENTITY.name,
        pullRequestNumber: 1,
        pullRequestBranch: BRANCH,
        pullRequestLabels: ['factory', 'type:infra'],
      });
      expect(commits[0]).toMatchObject({ pullRequestNumber: null, pullRequestBranch: null, pullRequestLabels: [] });
      expect(await github.commitsSince(TEST_BASE_BRANCH, mergeSha)).toEqual([]);
      expect((await github.commitsSince(TEST_BASE_BRANCH, null)).map((commit) => commit.sha).at(-1)).toBe(mergeSha);
      await expect(github.commitsSince(TEST_BASE_BRANCH, head)).rejects.toBeInstanceOf(UnknownCommitError);

      const diff = await github.commitDiff(mergeSha);
      expect(diff.changedFiles).toEqual(['src/app.txt']);
      expect(diff.diff).toContain('+merged');
    });

    it('describes one commit by an abbreviated sha, with its pull request when it came from one', async () => {
      const github = gateway();
      const seed = bareHead(TEST_BASE_BRANCH);
      await repositories.pushToRemote('docs/direct.md', 'direct\n', 'docs: direct push');
      const head = await pushBranch('src/app.txt', 'merged\n', 'ci(infra): serve the domain');
      const opened = await github.openPullRequest({ branch: BRANCH, title: 'ci(infra): serve the domain', body: 'b', labels: ['factory', 'type:infra'], closes: [] });
      const mergeSha = await github.squashMerge(opened.number, head);
      const [direct] = await github.commitsSince(TEST_BASE_BRANCH, seed);

      expect(await github.commit(mergeSha.slice(0, 8))).toMatchObject({ sha: mergeSha, pullRequestNumber: 1, pullRequestBranch: BRANCH });
      expect(await github.commit(direct?.sha ?? '')).toMatchObject({ message: 'docs: direct push', pullRequestNumber: null, pullRequestBranch: null });
      await expect(github.commit('deadbeef')).rejects.toBeInstanceOf(UnknownCommitError);
    });
  });

  describe('branches, open pull requests and tags', () => {
    const OTHER_BRANCH = 'factory/2-another';
    const PULL_REQUEST_LABELS = ['factory', 'type:infra'];

    it('reports the head of an existing branch and null for a missing one', async () => {
      const github = gateway();
      expect(await github.branchHead(TEST_BASE_BRANCH)).toBe(bareHead(TEST_BASE_BRANCH));
      expect(await github.branchHead('factory/missing')).toBeNull();
    });

    it('lists the open pull requests ascending by number with their live head and labels', async () => {
      const github = gateway();
      const firstHead = await pushBranch('src/first.txt', 'first\n', 'feat: first');
      const first = await github.openPullRequest({ branch: BRANCH, title: 'feat: first', body: 'b', labels: PULL_REQUEST_LABELS, closes: [] });
      const secondHead = await pushBranch('src/second.txt', 'second\n', 'feat: second', OTHER_BRANCH);
      const second = await github.openPullRequest({ branch: OTHER_BRANCH, title: 'feat: second', body: 'b', labels: [], closes: [] });

      expect(await github.listOpenPullRequests()).toEqual([
        { number: first.number, title: 'feat: first', branch: BRANCH, headSha: firstHead, url: first.url, labels: PULL_REQUEST_LABELS, createdAt: NOW },
        { number: second.number, title: 'feat: second', branch: OTHER_BRANCH, headSha: secondHead, url: second.url, labels: [], createdAt: NOW },
      ]);
    });

    it('leaves merged pull requests and pull requests whose branch is gone out of the open list', async () => {
      const github = gateway();
      const mergedHead = await pushBranch('src/merged.txt', 'merged\n', 'feat: merged');
      const merged = await github.openPullRequest({ branch: BRANCH, title: 'feat: merged', body: 'b', labels: [], closes: [] });
      await github.squashMerge(merged.number, mergedHead);
      await pushBranch('src/orphan.txt', 'orphan\n', 'feat: orphan', OTHER_BRANCH);
      const orphan = await github.openPullRequest({ branch: OTHER_BRANCH, title: 'feat: orphan', body: 'b', labels: [], closes: [] });
      expect(await github.listOpenPullRequests()).toHaveLength(1);
      git(repositories.remote, 'update-ref', '-d', `refs/heads/${OTHER_BRANCH}`);

      expect(await github.listOpenPullRequests()).toEqual([]);
      expect(orphan.number).toBeGreaterThan(merged.number);
    });

    it('lists lightweight and annotated tags with the commit they point to', async () => {
      const github = gateway();
      const lightweightSha = bareHead(TEST_BASE_BRANCH);
      git(repositories.remote, 'tag', 'v1.0.0', lightweightSha);
      await repositories.pushToRemote('docs/next.md', 'next\n', 'docs: next');
      git(repositories.remote, 'tag', '--annotate', '--message', 'release', 'v2.0.0', bareHead(TEST_BASE_BRANCH));

      const tags = await github.listTags();
      expect([...tags].sort((left, right) => left.name.localeCompare(right.name))).toEqual([
        { name: 'v1.0.0', sha: lightweightSha },
        { name: 'v2.0.0', sha: bareHead(TEST_BASE_BRANCH) },
      ]);
    });

    it('lists the commits since a known one on a tag and stops at the tag', async () => {
      const github = gateway();
      const seed = bareHead(TEST_BASE_BRANCH);
      await repositories.pushToRemote('docs/one.md', 'one\n', 'docs: one');
      git(repositories.remote, 'tag', '--annotate', '--message', 'release', 'v1.0.0', bareHead(TEST_BASE_BRANCH));
      await repositories.pushToRemote('docs/two.md', 'two\n', 'docs: two');

      expect((await github.commitsSince('v1.0.0', seed)).map((commit) => commit.message)).toEqual(['docs: one']);
      expect((await github.commitsSince(TEST_BASE_BRANCH, seed)).map((commit) => commit.message)).toEqual(['docs: one', 'docs: two']);
      await expect(github.commitsSince('v1.0.0', bareHead(TEST_BASE_BRANCH))).rejects.toBeInstanceOf(UnknownCommitError);
    });
  });

  describe('checks', () => {
    function gated(runner: LocalCheckRunner): { github: LocalGitHubGateway; checks: LocalGateChecks } {
      const checks = new LocalGateChecks(directory, runner, FIXED_CLOCK, new AbortController().signal);
      const github = new LocalGitHubGateway(
        testRunner(),
        { directory, bareRepositoryPath: repositories.remote, baseBranch: TEST_BASE_BRANCH, checks: 'gate', identity: TEST_IDENTITY, environment: localOnlyGitEnvironment(TEST_GIT_ENVIRONMENT), gateChecks: checks },
        FIXED_CLOCK,
      );
      return { github, checks };
    }

    it('reports no check when the forge runs none', async () => {
      expect(await gateway('none').checks(TEST_BASE_BRANCH)).toEqual([]);
    });

    it("runs the project's gate once per commit, pending until it finishes, then one check per step with the gate's log", async () => {
      const runs: string[] = [];
      let finish: (run: LocalCheckRun) => void = () => undefined;
      const { github, checks } = gated({
        run: (sha) => {
          runs.push(sha);
          return new Promise((resolve) => {
            finish = resolve;
          });
        },
      });
      const head = bareHead(TEST_BASE_BRANCH);
      const logUrl = pathToFileURL(join(directory, 'checks', `${head}.log`)).href;
      expect(await github.checks(TEST_BASE_BRANCH)).toEqual([{ name: 'gate', conclusion: 'pending', url: logUrl, durationMs: null }]);
      expect(await github.checks(head)).toEqual([{ name: 'gate', conclusion: 'pending', url: logUrl, durationMs: null }]);
      finish({ steps: [{ name: 'lint', passed: true, durationMs: 1_200 }, { name: 'unit', passed: false, durationMs: 3_400 }], log: '$ npm test\n1 failing\n' });
      await checks.settled();
      expect(await github.checks(head)).toEqual([
        { name: 'lint', conclusion: 'success', url: logUrl, durationMs: 1_200 },
        { name: 'unit', conclusion: 'failure', url: logUrl, durationMs: 3_400 },
      ]);
      expect(runs).toEqual([head]);
      expect(await readFile(join(directory, 'checks', `${head}.log`), 'utf8')).toBe('$ npm test\n1 failing\n');
    });

    it('shows a gate that could not run as one failed check that says why', async () => {
      const { github, checks } = gated({ run: () => Promise.reject(new Error('the clean checkout could not be prepared')) });
      const head = bareHead(TEST_BASE_BRANCH);
      await github.checks(head);
      await checks.settled();
      expect(await github.checks(head)).toEqual([{ name: 'gate', conclusion: 'failure', url: pathToFileURL(join(directory, 'checks', `${head}.log`)).href, durationMs: null }]);
      expect(await readFile(join(directory, 'checks', `${head}.log`), 'utf8')).toContain('the clean checkout could not be prepared');
    });
  });
});
