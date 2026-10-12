import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SpawnCommandRunner } from '../process/spawnCommandRunner.ts';
import { GH_FIXED_ENVIRONMENT } from './constants.ts';
import { CommitScanLimitError, GitHubCommandError, GitHubPayloadError, PullRequestHeadMovedError } from './errors.ts';
import { FakeGh, readFixture, readFixtureJson, type FakeGhRule } from './fakeGh.ts';
import { buildGhEnvironment } from './ghEnvironment.ts';
import { GhCliGateway } from './ghCliGateway.ts';

const OWNER = 'example-org';
const REPOSITORY = 'storefront';
const REPO_PATH = `repos/${OWNER}/${REPOSITORY}`;
const BASE_BRANCH = 'main';
const ISSUE_NUMBER = 194;
const KNOWN_COMMIT = 'c0ffee1';

const FixtureCommitsSchema = z.array(z.object({ sha: z.string() }));

describe('GhCliGateway', () => {
  let fake: FakeGh | undefined;

  afterEach(async () => {
    await fake?.cleanup();
    fake = undefined;
  });

  async function gatewayWith(rules: readonly FakeGhRule[]): Promise<{ gateway: GhCliGateway; gh: FakeGh }> {
    const gh = await FakeGh.create(rules);
    fake = gh;
    const gateway = new GhCliGateway(new SpawnCommandRunner(), {
      owner: OWNER,
      repository: REPOSITORY,
      baseBranch: BASE_BRANCH,
      environment: gh.environment,
      ghExecutable: gh.executable,
    });
    return { gateway, gh };
  }

  const issueRules = async (blockedBy: string): Promise<FakeGhRule[]> => [
    { contains: [`issues/${ISSUE_NUMBER}/dependencies/blocked_by`], stdout: blockedBy },
    { contains: [`${REPO_PATH}/issues/${ISSUE_NUMBER}`], stdout: await readFixture('issue.json') },
  ];

  describe('issues', () => {
    it('reads an issue with its labels and blockers', async () => {
      const blocker = await readFixtureJson('issue.json');
      const { gateway } = await gatewayWith(await issueRules(JSON.stringify([[blocker]])));
      const issue = await gateway.getIssue(ISSUE_NUMBER);
      expect(issue).toMatchObject({
        number: ISSUE_NUMBER,
        title: 'Offer a seasonal look and a Spanish language option on the home screen',
        state: expect.stringMatching(/^(open|closed)$/),
        labels: ['automation', 'automation:deployed'],
        blockedBy: [ISSUE_NUMBER],
      });
      expect(issue.body.length).toBeGreaterThan(0);
    });

    it('reads an issue without blockers from the recorded empty dependency list', async () => {
      const slurped = JSON.stringify([await readFixtureJson('blocked-by.json')]);
      const { gateway } = await gatewayWith(await issueRules(slurped));
      expect((await gateway.getIssue(ISSUE_NUMBER)).blockedBy).toEqual([]);
    });

    it('does not hand the parent environment to gh', async () => {
      process.env['AGENT_FACTORY_TEST_SECRET'] = 'leak';
      try {
        const { gateway, gh } = await gatewayWith(await issueRules('[[]]'));
        await gateway.getIssue(ISSUE_NUMBER);
        for (const call of await gh.calls()) expect(call.env).not.toHaveProperty('AGENT_FACTORY_TEST_SECRET');
      } finally {
        delete process.env['AGENT_FACTORY_TEST_SECRET'];
      }
    });

    it('builds the gh environment from an allowlist', () => {
      const environment = buildGhEnvironment({ PATH: '/bin', HOME: '/home/op', AWS_SECRET_ACCESS_KEY: 'x', GH_TOKEN: undefined });
      expect(environment).toEqual({ ...GH_FIXED_ENVIRONMENT, PATH: '/bin', HOME: '/home/op' });
    });

    it('lists labelled issues and leaves pull requests out', async () => {
      const issue = await readFixtureJson('issue.json');
      const pullRequests = z.array(z.unknown()).parse(await readFixtureJson('issue-list.json'));
      const { gateway, gh } = await gatewayWith([
        { contains: ['dependencies/blocked_by'], stdout: '[[]]' },
        { contains: ['labels=automation'], stdout: JSON.stringify([[issue, ...pullRequests]]) },
      ]);
      const issues = await gateway.listIssues('automation');
      expect(issues.map((listed) => listed.number)).toEqual([ISSUE_NUMBER]);
      expect((await gh.commandLines()).some((line) => line.includes('--paginate --slurp'))).toBe(true);
    });

    it('creates an issue with labels', async () => {
      const { gateway, gh } = await gatewayWith([{ contains: [`${REPO_PATH}/issues`, 'POST'], stdout: await readFixture('issue.json') }]);
      const created = await gateway.createIssue('A title', 'A body', ['bug', 'factory']);
      expect(created.number).toBe(ISSUE_NUMBER);
      const [call] = await gh.calls();
      expect(call?.args).toEqual([
        'api', `${REPO_PATH}/issues`, '--method', 'POST', '-f', 'title=A title', '-f', 'body=A body', '-f', 'labels[]=bug', '-f', 'labels[]=factory',
      ]);
    });

    it('records a dependency using the blocking issue id', async () => {
      const blocking = z.object({ id: z.number() }).parse(await readFixtureJson('issue.json'));
      const { gateway, gh } = await gatewayWith([
        { contains: ['issues/10/dependencies/blocked_by', 'POST'] },
        { contains: ['issues/10/dependencies/blocked_by'], stdout: '[[]]' },
        { contains: [`issues/${ISSUE_NUMBER}`], stdout: await readFixture('issue.json') },
      ]);
      await gateway.addBlockedBy(10, ISSUE_NUMBER);
      const post = (await gh.calls()).find((call) => call.args.includes('POST'));
      expect(post?.args).toEqual([
        'api', `${REPO_PATH}/issues/10/dependencies/blocked_by`, '--method', 'POST', '-F', `issue_id=${blocking.id}`,
      ]);
    });

    it('does not record a dependency twice', async () => {
      const blocker = await readFixtureJson('issue.json');
      const { gateway, gh } = await gatewayWith([
        { contains: ['issues/10/dependencies/blocked_by'], stdout: JSON.stringify([[blocker]]) },
      ]);
      await gateway.addBlockedBy(10, ISSUE_NUMBER);
      expect((await gh.calls()).some((call) => call.args.includes('POST'))).toBe(false);
    });

    it('adds labels and removes only the ones present', async () => {
      const { gateway, gh } = await gatewayWith([
        { contains: ['issues/5/labels', 'POST'] },
        { contains: ['issues/5/labels', 'DELETE'] },
        { contains: ['issues/5/labels'], stdout: JSON.stringify([[{ name: 'factory:ready' }, { name: 'bug' }]]) },
      ]);
      await gateway.setLabels(5, ['factory:active'], ['factory:ready', 'absent']);
      const lines = await gh.commandLines();
      expect(lines).toContain(`api ${REPO_PATH}/issues/5/labels --method POST -f labels[]=factory:active`);
      expect(lines.filter((line) => line.includes('--method DELETE'))).toEqual([
        `api ${REPO_PATH}/issues/5/labels/factory%3Aready --method DELETE`,
      ]);
    });

    it('posts comments and updates pull request bodies as raw text', async () => {
      const { gateway, gh } = await gatewayWith([{ contains: ['api'] }]);
      await gateway.comment(5, '@someone `code` -x');
      await gateway.updatePullRequestBody(9, '@body');
      expect((await gh.calls()).map((call) => call.args)).toEqual([
        ['api', `${REPO_PATH}/issues/5/comments`, '--method', 'POST', '-f', 'body=@someone `code` -x'],
        ['api', `${REPO_PATH}/pulls/9`, '--method', 'PATCH', '-f', 'body=@body'],
      ]);
    });
  });

  describe('pull requests', () => {
    const prUrl = `https://github.com/${OWNER}/${REPOSITORY}/pull/300`;

    it('opens a pull request labelled factory that closes its issues', async () => {
      const { gateway, gh } = await gatewayWith([
        { contains: ['pr', 'create'], stdout: `Creating pull request\n${prUrl}\n` },
        { contains: ['pr', 'view', prUrl], stdout: JSON.stringify({ number: 300, url: prUrl, headRefOid: 'abc123' }) },
      ]);
      const ref = await gateway.openPullRequest({
        branch: 'factory/194-look',
        title: 'feat: look',
        body: 'Proof attached.',
        labels: ['factory', 'ui'],
        closes: [194, 195],
      });
      expect(ref).toEqual({ number: 300, url: prUrl, headSha: 'abc123' });
      const create = (await gh.calls())[0]?.args ?? [];
      expect(create).toEqual([
        'pr', 'create', '--repo', `${OWNER}/${REPOSITORY}`, '--base', BASE_BRANCH, '--head', 'factory/194-look',
        '--title', 'feat: look', '--body', 'Proof attached.\n\nCloses #194\nCloses #195\n', '--label', 'factory', '--label', 'ui',
      ]);
    });

    it('finds the open pull request of a branch', async () => {
      const { gateway, gh } = await gatewayWith([
        { contains: ['pr', 'list', '--head', 'factory/194-look'], stdout: JSON.stringify([{ number: 300, url: prUrl, headRefOid: 'abc123' }]) },
      ]);
      expect(await gateway.findOpenPullRequest('factory/194-look')).toEqual({ number: 300, url: prUrl, headSha: 'abc123' });
      expect((await gh.calls())[0]?.args).toEqual([
        'pr', 'list', '--repo', `${OWNER}/${REPOSITORY}`, '--head', 'factory/194-look', '--state', 'open', '--json', 'number,url,headRefOid',
      ]);
    });

    it('reports no pull request when the branch has none open', async () => {
      const { gateway } = await gatewayWith([{ contains: ['pr', 'list'], stdout: '[]' }]);
      expect(await gateway.findOpenPullRequest('factory/195-other')).toBeNull();
    });

    it('does not repeat a closing line already in the body', async () => {
      const { gateway, gh } = await gatewayWith([
        { contains: ['pr', 'create'], stdout: `${prUrl}\n` },
        { contains: ['pr', 'view'], stdout: JSON.stringify({ number: 300, url: prUrl, headRefOid: 'abc123' }) },
      ]);
      await gateway.openPullRequest({ branch: 'factory/1-a', title: 't', body: 'Closes #1', labels: ['factory', 'factory'], closes: [1] });
      const create = (await gh.calls())[0]?.args ?? [];
      expect(create[create.indexOf('--body') + 1]).toBe('Closes #1');
      expect(create.filter((argument) => argument === 'factory')).toHaveLength(1);
    });

    it('squash-merges only while the head matches and returns the merge commit', async () => {
      const { gateway, gh } = await gatewayWith([
        { contains: ['pr', 'view', '--json headRefOid'], stdout: JSON.stringify({ headRefOid: 'abc123' }) },
        { contains: ['pr merge'] },
        { contains: ['pr', 'view', '--json mergeCommit'], stdout: JSON.stringify({ mergeCommit: { oid: 'merged456' } }) },
      ]);
      expect(await gateway.squashMerge(300, 'abc123')).toBe('merged456');
      const merge = (await gh.commandLines()).find((line) => line.startsWith('pr merge'));
      expect(merge).toBe(`pr merge 300 --repo ${OWNER}/${REPOSITORY} --squash --match-head-commit abc123`);
    });

    it('refuses to merge when the head moved', async () => {
      const { gateway, gh } = await gatewayWith([
        { contains: ['pr', 'view', '--json headRefOid'], stdout: JSON.stringify({ headRefOid: 'moved999' }) },
      ]);
      await expect(gateway.squashMerge(300, 'abc123')).rejects.toBeInstanceOf(PullRequestHeadMovedError);
      expect((await gh.commandLines()).some((line) => line.startsWith('pr merge'))).toBe(false);
    });
  });

  describe('checks', () => {
    it('merges check runs and commit statuses into conclusions', async () => {
      const statuses = {
        statuses: [
          { context: 'legacy/ci', state: 'error', target_url: 'https://ci.example/1' },
          { context: 'legacy/lint', state: 'pending', target_url: null },
          { context: 'legacy/deploy', state: 'success', target_url: 'https://ci.example/3' },
        ],
      };
      const { gateway } = await gatewayWith([
        { contains: ['check-runs'], stdout: JSON.stringify([await readFixtureJson('check-runs.json')]) },
        { contains: ['/status'], stdout: JSON.stringify([statuses]) },
      ]);
      const summaries = await gateway.checks(KNOWN_COMMIT);
      expect(summaries).toHaveLength(9);
      expect(summaries[0]).toEqual({
        name: 'Analyze (actions)',
        conclusion: 'success',
        url: 'https://github.com/example-org/storefront/actions/runs/28133052741/job/82551344735',
      });
      expect(summaries.slice(-3)).toEqual([
        { name: 'legacy/ci', conclusion: 'failure', url: 'https://ci.example/1' },
        { name: 'legacy/lint', conclusion: 'pending', url: '' },
        { name: 'legacy/deploy', conclusion: 'success', url: 'https://ci.example/3' },
      ]);
    });

    it('maps unfinished and unsuccessful check runs', async () => {
      const run = (status: string, conclusion: string | null, name: string) => ({ name, status, conclusion, html_url: null });
      const runs = [
        run('in_progress', null, 'running'),
        run('completed', 'timed_out', 'timed-out'),
        run('completed', 'cancelled', 'cancelled'),
        run('completed', 'skipped', 'skipped'),
        run('completed', 'neutral', 'neutral'),
        run('completed', 'action_required', 'needs-action'),
      ];
      const { gateway } = await gatewayWith([
        { contains: ['check-runs'], stdout: JSON.stringify([{ check_runs: runs }]) },
        { contains: ['/status'], stdout: JSON.stringify([{ statuses: [] }]) },
      ]);
      const conclusions = (await gateway.checks('ref')).map((summary) => summary.conclusion);
      expect(conclusions).toEqual(['pending', 'failure', 'cancelled', 'skipped', 'neutral', 'failure']);
    });
  });

  describe('commitsSince', () => {
    async function commitRules(labelled: boolean): Promise<{ rules: FakeGhRule[]; shas: string[] }> {
      const commits = await readFixture('commits.json');
      const shas = FixtureCommitsSchema.parse(JSON.parse(commits)).map((commit) => commit.sha);
      const pulls = z.array(z.record(z.string(), z.unknown())).parse(await readFixtureJson('commit-pulls.json'));
      const decorated = labelled
        ? pulls.map((pull) => ({ ...pull, head: { ref: 'factory/194-look' }, labels: [{ name: 'factory' }] }))
        : pulls;
      const rules: FakeGhRule[] = [
        { contains: [`commits/${shas[0]}/pulls`], stdout: JSON.stringify(decorated) },
        { contains: ['/pulls'], stdout: '[]' },
        { contains: ['commits?sha=main'], stdout: commits },
      ];
      return { rules, shas };
    }

    it('returns every commit after the given sha, oldest first, with pull request context', async () => {
      const { rules, shas } = await commitRules(true);
      const { gateway } = await gatewayWith(rules);
      const since = shas[2] ?? '';
      const summaries = await gateway.commitsSince(BASE_BRANCH, since);
      expect(summaries.map((summary) => summary.sha)).toEqual([shas[1], shas[0]]);
      const newest = summaries[1];
      expect(newest).toMatchObject({
        authorLogin: 'river-ops',
        pullRequestNumber: 280,
        pullRequestBranch: 'factory/194-look',
        pullRequestLabels: ['factory'],
      });
      expect(newest?.committedAt).toEqual(new Date('2026-10-09T15:22:02Z'));
      expect(summaries[0]).toMatchObject({ pullRequestNumber: null, pullRequestBranch: null, pullRequestLabels: [] });
    });

    it('reads one page of recent history without a starting sha', async () => {
      const { rules, shas } = await commitRules(false);
      const { gateway, gh } = await gatewayWith(rules);
      const summaries = await gateway.commitsSince(BASE_BRANCH, null);
      expect(summaries).toHaveLength(shas.length);
      expect(summaries.at(-1)?.pullRequestLabels).toEqual([]);
      expect((await gh.commandLines()).filter((line) => line.includes('commits?sha='))).toHaveLength(1);
    });

    it('returns nothing when already at the head', async () => {
      const { rules, shas } = await commitRules(false);
      const { gateway } = await gatewayWith(rules);
      expect(await gateway.commitsSince(BASE_BRANCH, shas[0] ?? '')).toEqual([]);
    });

    it('fails when the starting sha is not found within the scan limit', async () => {
      const full = JSON.stringify(Array.from({ length: 100 }, (_, index) => ({
        sha: `sha${index}`,
        author: null,
        commit: { message: 'm', committer: { date: '2026-01-01T00:00:00Z' } },
      })));
      const { gateway } = await gatewayWith([
        { contains: ['/pulls'], stdout: '[]' },
        { contains: ['commits?sha=main'], stdout: full },
      ]);
      await expect(gateway.commitsSince(BASE_BRANCH, 'unknown')).rejects.toBeInstanceOf(CommitScanLimitError);
    });
  });

  describe('branches, open pull requests and tags', () => {
    it('reads the head sha of a branch', async () => {
      const { gateway, gh } = await gatewayWith([{ contains: [`${REPO_PATH}/branches/factory/7-x`], stdout: JSON.stringify({ commit: { sha: 'abc123' } }) }]);
      expect(await gateway.branchHead('factory/7-x')).toBe('abc123');
      expect(await gh.commandLines()).toEqual([`api ${REPO_PATH}/branches/factory/7-x --method GET`]);
    });

    it('maps a missing branch to null', async () => {
      const { gateway } = await gatewayWith([{ contains: ['/branches/'], exitCode: 1, stderr: 'gh: Branch not found (HTTP 404)' }]);
      expect(await gateway.branchHead('gone')).toBeNull();
    });

    it('rethrows a branch lookup failure other than not found', async () => {
      const { gateway } = await gatewayWith([{ contains: ['/branches/'], exitCode: 1, stderr: 'gh: Server Error (HTTP 500)' }]);
      await expect(gateway.branchHead('main')).rejects.toBeInstanceOf(GitHubCommandError);
    });

    it('lists every open pull request ascending by number', async () => {
      const listed = [
        { number: 9, title: 'Nine', headRefName: 'factory/9', headRefOid: 'sha9', url: 'https://example.test/pull/9', labels: [{ name: 'factory' }], createdAt: '2026-10-08T09:30:00Z' },
        { number: 3, title: 'Three', headRefName: 'factory/3', headRefOid: 'sha3', url: 'https://example.test/pull/3', labels: [] },
      ];
      const { gateway, gh } = await gatewayWith([{ contains: ['pr', 'list'], stdout: JSON.stringify(listed) }]);
      expect(await gateway.listOpenPullRequests()).toEqual([
        { number: 3, title: 'Three', branch: 'factory/3', headSha: 'sha3', url: 'https://example.test/pull/3', labels: [], createdAt: null },
        { number: 9, title: 'Nine', branch: 'factory/9', headSha: 'sha9', url: 'https://example.test/pull/9', labels: ['factory'], createdAt: new Date('2026-10-08T09:30:00Z') },
      ]);
      expect(await gh.commandLines()).toEqual([
        `pr list --repo ${OWNER}/${REPOSITORY} --state open --limit 1000 --json number,title,headRefName,headRefOid,url,labels,createdAt`,
      ]);
    });

    it('lists the latest workflow runs with their actor and times', async () => {
      const listed = {
        workflow_runs: [
          {
            id: 901,
            name: 'CI',
            display_title: 'feat: add the wishlist',
            head_branch: 'main',
            head_sha: 'abc123',
            event: 'push',
            status: 'completed',
            conclusion: 'success',
            actor: { login: 'riley-chen' },
            run_started_at: '2026-10-12T08:00:00Z',
            created_at: '2026-10-12T07:59:50Z',
            updated_at: '2026-10-12T08:04:10Z',
            html_url: 'https://github.com/example-org/storefront/actions/runs/901',
          },
        ],
      };
      const { gateway, gh } = await gatewayWith([{ contains: [`${REPO_PATH}/actions/runs?per_page=20`], stdout: JSON.stringify(listed) }]);
      expect(await gateway.workflowRuns(20)).toEqual([
        {
          id: '901',
          workflow: 'CI',
          title: 'feat: add the wishlist',
          branch: 'main',
          sha: 'abc123',
          trigger: 'push',
          status: 'completed',
          conclusion: 'success',
          actor: 'riley-chen',
          startedAt: new Date('2026-10-12T08:00:00Z'),
          updatedAt: new Date('2026-10-12T08:04:10Z'),
          url: 'https://github.com/example-org/storefront/actions/runs/901',
        },
      ]);
      expect((await gh.calls())[0]?.args.slice(0, 2)).toEqual(['api', `${REPO_PATH}/actions/runs?per_page=20`]);
    });

    it('lists every tag across pages with the commit it points to', async () => {
      const pages = [
        [{ name: 'v2', commit: { sha: 'sha2', url: 'u' } }],
        [{ name: 'v1', commit: { sha: 'sha1', url: 'u' } }],
      ];
      const { gateway, gh } = await gatewayWith([{ contains: [`${REPO_PATH}/tags?per_page=100`], stdout: JSON.stringify(pages) }]);
      expect(await gateway.listTags()).toEqual([
        { name: 'v2', sha: 'sha2' },
        { name: 'v1', sha: 'sha1' },
      ]);
      expect((await gh.commandLines()).some((line) => line.includes('--paginate --slurp'))).toBe(true);
    });
  });

  describe('deployments and workflow dispatch', () => {
    it('reads the deployments of an environment with the state of their latest status', async () => {
      const { gateway, gh } = await gatewayWith([
        { contains: ['deployments/4318920657/statuses'], stdout: JSON.stringify((await readFixtureJson('deployment-statuses.json')) ?? []) },
        { contains: ['deployments/4318920636/statuses'], stdout: '[]' },
        { contains: [`${REPO_PATH}/deployments?environment=storefront-dev&per_page=2`], stdout: await readFixture('deployments.json') },
      ]);
      const deployments = await gateway.deployments('storefront-dev', 2);
      expect(deployments).toEqual([
        {
          id: '4318920657',
          environment: 'storefront-dev',
          ref: 'main',
          sha: 'c0ffee18072fef5fff421873a53db40cd2d2dc9d',
          createdAt: new Date('2026-10-09T15:29:56Z'),
          creator: 'release-engineer',
          state: 'success',
          logUrl: 'https://github.com/example-org/storefront/actions/runs/28104377916/job/82456019374',
          environmentUrl: 'https://storefront-dev.example.invalid',
        },
        expect.objectContaining({ id: '4318920636', state: 'in-progress', logUrl: null }),
      ]);
      expect((await gh.commandLines()).every((line) => line.includes('--method GET'))).toBe(true);
    });

    it('reads a release deployment by its tag', async () => {
      const { gateway } = await gatewayWith([
        { contains: ['/statuses'], stdout: JSON.stringify([{ state: 'inactive', log_url: null, environment_url: '' }]) },
        { contains: [`${REPO_PATH}/deployments?environment=storefront-prep`], stdout: await readFixture('deployments-prep.json') },
      ]);
      const [latest] = await gateway.deployments('storefront-prep', 2);
      expect(latest).toMatchObject({ ref: 'storefront-v1.10.0', state: 'inactive', environmentUrl: null });
    });

    it('dispatches a workflow at a ref with raw string inputs', async () => {
      const { gateway, gh } = await gatewayWith([{ contains: ['workflow', 'run'], stdout: '' }]);
      const receipt = await gateway.dispatchWorkflow({
        workflow: 'cloud-delivery.yml',
        ref: 'storefront-v1.10.0',
        inputs: { environment_name: 'storefront-prep', build: 'skip', deploy: 'true' },
      });
      expect(receipt).toEqual({ simulated: false, url: `https://github.com/${OWNER}/${REPOSITORY}/actions/workflows/cloud-delivery.yml` });
      expect(await gh.commandLines()).toEqual([
        `workflow run cloud-delivery.yml --repo ${OWNER}/${REPOSITORY} --ref storefront-v1.10.0 --raw-field environment_name=storefront-prep --raw-field build=skip --raw-field deploy=true`,
      ]);
    });
  });

  describe('commit and pull request details', () => {
    it('reads the diff and the changed files of a commit', async () => {
      const { gateway, gh } = await gatewayWith([
        { contains: ['vnd.github.diff'], stdout: await readFixture('commit.diff') },
        { contains: [`commits/${KNOWN_COMMIT}`], stdout: await readFixture('commit-detail.json') },
      ]);
      const detail = await gateway.commitDiff(KNOWN_COMMIT);
      expect(detail.changedFiles).toEqual(['.github/workflows/build-web-image.yml', 'docker-compose.yml', 'package-lock.json']);
      expect(detail.diff).toContain('diff --git a/docker-compose.yml b/docker-compose.yml');
      expect((await gh.commandLines()).some((line) => line.includes('Accept: application/vnd.github.diff'))).toBe(true);
    });

    it('describes a commit with the pull request that merged it', async () => {
      const commitPayload = { sha: KNOWN_COMMIT, author: { login: 'dev' }, commit: { message: 'Merge pull request #280', committer: { date: '2026-05-01T10:00:00Z' } } };
      const pulls = [{ number: 280, merge_commit_sha: KNOWN_COMMIT, head: { ref: 'fix/cart-total' }, labels: [{ name: 'bug' }] }];
      const { gateway } = await gatewayWith([
        { contains: [`commits/${KNOWN_COMMIT}/pulls`], stdout: JSON.stringify(pulls) },
        { contains: [`commits/${KNOWN_COMMIT}`], stdout: JSON.stringify(commitPayload) },
      ]);
      expect(await gateway.commit(KNOWN_COMMIT)).toMatchObject({
        sha: KNOWN_COMMIT,
        authorLogin: 'dev',
        message: 'Merge pull request #280',
        pullRequestNumber: 280,
        pullRequestBranch: 'fix/cart-total',
        pullRequestLabels: ['bug'],
      });
    });

    it('reads the title, body and author of a pull request', async () => {
      const { gateway } = await gatewayWith([{ contains: [`${REPO_PATH}/pulls/280`], stdout: await readFixture('pull-detail.json') }]);
      const pull = await gateway.pullRequestDetails(280);
      expect(pull).toMatchObject({ number: 280, title: 'Stop pulling the private analytics package into the web image' });
      expect(pull.body).toContain('403 Forbidden');
      expect(pull.authorLogin).toEqual(expect.any(String));
    });

    it('raises a typed error when the commit payload does not match its schema', async () => {
      const { gateway } = await gatewayWith([{ contains: ['commits/'], stdout: JSON.stringify({ files: [{ name: 'x' }] }) }]);
      await expect(gateway.commitDiff(KNOWN_COMMIT)).rejects.toBeInstanceOf(GitHubPayloadError);
    });
  });

  describe('failures', () => {
    it('raises a typed error when gh exits non-zero', async () => {
      const { gateway } = await gatewayWith([{ contains: ['api'], exitCode: 1, stderr: 'HTTP 404: Not Found' }]);
      const failure = await gateway.comment(1, 'x').catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(GitHubCommandError);
      expect(failure).toMatchObject({ exitCode: 1 });
    });

    it('raises a typed error when a payload does not match its schema', async () => {
      const { gateway } = await gatewayWith([
        { contains: ['dependencies/blocked_by'], stdout: '[[]]' },
        { contains: ['issues/1'], stdout: JSON.stringify({ number: 'one' }) },
      ]);
      await expect(gateway.getIssue(1)).rejects.toBeInstanceOf(GitHubPayloadError);
    });

    it('raises a typed error when the output is not JSON', async () => {
      const { gateway } = await gatewayWith([
        { contains: ['dependencies/blocked_by'], stdout: '[[]]' },
        { contains: ['issues/1'], stdout: 'not json' },
      ]);
      await expect(gateway.getIssue(1)).rejects.toBeInstanceOf(GitHubPayloadError);
    });
  });
});
