import type {
  CheckRunSummary,
  CommandRunner,
  CommitDiff,
  CommitSummary,
  DeploymentRecord,
  DeploymentState,
  GitHubGateway,
  IssueRecord,
  OpenPullRequestSummary,
  PullRequestDraft,
  PullRequestDetails,
  PullRequestRef,
  TagRef,
  WorkflowDispatch,
  WorkflowDispatchReceipt, WorkflowRunRecord } from '@agent-factory/application';
import type { z } from 'zod';
import { conclusionOfCheckRun, conclusionOfCommitStatus } from './checkConclusions.ts';
import {
  ACCEPT_HEADER,
  DIFF_MEDIA_TYPE,
  EXIT_CODE_OK,
  GH_COMMAND_TIMEOUT_MS,
  GH_EXECUTABLE,
  LATEST_DEPLOYMENT_STATUS_COUNT,
  LISTED_ISSUE_STATE,
  MAX_COMMIT_PAGES,
  NOT_FOUND_STDERR_MARKER,
  OPEN_PULL_REQUEST_LIST_LIMIT,
  OPEN_PULL_REQUEST_SUMMARY_FIELDS,
  OPEN_PULL_REQUEST_STATE,
  PAGE_SIZE,
  PULL_REQUEST_REF_FIELDS,
  WORKFLOW_DISPATCH_FIELD_FLAG,
} from './constants.ts';
import { CommitScanLimitError, GitHubCommandError, GitHubPayloadError, PullRequestHeadMovedError } from './errors.ts';
import { withClosingLines } from './pullRequestConventions.ts';
import { DEFAULT_RETRY_SETTINGS, withTransientRetries, type RetrySettings } from './transientRetries.ts';
import {
  BranchResponseSchema,
  CheckRunsPagesSchema,
  CommitDetailSchema,
  CommitListSchema,
  CommitSchema,
  CommitPullRequestsSchema,
  CommitStatusPagesSchema,
  DeploymentListSchema,
  DeploymentStatusListSchema,
  CommentListSchema,
  IssueListPagesSchema,
  IssueListSchema,
  IssueResponseSchema,
  LabelListPagesSchema,
  OpenPullRequestListSchema,
  PullRequestDetailsSchema,
  PullRequestHeadViewSchema,
  PullRequestListSchema,
  PullRequestMergeViewSchema,
  PullRequestViewSchema,
  TagListPagesSchema,
  WorkflowRunListSchema,
  type IssueResponse,
} from './schemas.ts';

const DEPLOYMENT_STATE_OF: Readonly<Record<string, DeploymentState>> = {
  success: 'success',
  failure: 'failure',
  error: 'failure',
  in_progress: 'in-progress',
  queued: 'in-progress',
  pending: 'in-progress',
  inactive: 'inactive',
};
const NO_STATUS_STATE: DeploymentState = 'in-progress';
const GITHUB_WEB_ORIGIN = 'https://github.com';
const READ_METHOD = 'GET';
const RECENT_ITEMS = 20;

export interface GhCliGatewaySettings {
  readonly owner: string;
  readonly repository: string;
  readonly baseBranch: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly ghExecutable?: string;
  readonly workingDirectory?: string;
  /** How calls that fail for a transient reason are tried again; reads always, writes only where a duplicate cannot happen. */
  readonly retry?: RetrySettings;
}

type FieldValue = string | number | readonly string[];

interface ApiRequest {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly fields?: Readonly<Record<string, FieldValue>>;
  readonly paginate?: boolean;
  readonly headers?: Readonly<Record<string, string>>;
}

export class GhCliGateway implements GitHubGateway {
  private readonly runner: CommandRunner;
  private readonly settings: GhCliGatewaySettings;
  private readonly repositoryPath: string;
  private readonly repositorySlug: string;

  constructor(runner: CommandRunner, settings: GhCliGatewaySettings) {
    this.runner = runner;
    this.settings = settings;
    this.repositorySlug = `${settings.owner}/${settings.repository}`;
    this.repositoryPath = `repos/${this.repositorySlug}`;
  }

  async getIssue(number: number): Promise<IssueRecord> {
    const issue = await this.apiJson(`${this.repositoryPath}/issues/${number}`, IssueResponseSchema, `issue #${number}`);
    return toIssueRecord(issue, await this.blockedByOf(number));
  }

  async listIssues(label: string): Promise<readonly IssueRecord[]> {
    const pages = await this.apiJson(
      `${this.repositoryPath}/issues?state=${LISTED_ISSUE_STATE}&labels=${encodeURIComponent(label)}&per_page=${PAGE_SIZE}`,
      IssueListPagesSchema,
      `issues labelled ${label}`,
      { paginate: true },
    );
    const issues = pages.flat().filter((issue) => issue.pull_request === undefined);
    return Promise.all(issues.map(async (issue) => toIssueRecord(issue, await this.blockedByOf(issue.number))));
  }

  async createIssue(title: string, body: string, labels: readonly string[]): Promise<IssueRecord> {
    return this.retrying(
      async () => toIssueRecord(await this.apiJson(`${this.repositoryPath}/issues`, IssueResponseSchema, 'issue creation', { method: 'POST', fields: { title, body, labels } }), []),
      () => this.recentIssue(title, body),
    );
  }

  async addBlockedBy(issueNumber: number, blockingIssueNumber: number): Promise<void> {
    const alreadyBlocked = await this.blockedByOf(issueNumber);
    if (alreadyBlocked.includes(blockingIssueNumber)) return;
    const blocking = await this.apiJson(
      `${this.repositoryPath}/issues/${blockingIssueNumber}`,
      IssueResponseSchema,
      `issue #${blockingIssueNumber}`,
    );
    await this.retrying(
      async () => {
        await this.api(`${this.repositoryPath}/issues/${issueNumber}/dependencies/blocked_by`, { method: 'POST', fields: { issue_id: blocking.id } });
      },
      async () => ((await this.blockedByOf(issueNumber)).includes(blockingIssueNumber) ? undefined : null),
    );
  }

  async setLabels(issueNumber: number, add: readonly string[], remove: readonly string[]): Promise<void> {
    if (add.length > 0) {
      await this.retrying(() => this.api(`${this.repositoryPath}/issues/${issueNumber}/labels`, { method: 'POST', fields: { labels: add } }));
    }
    if (remove.length === 0) return;
    const present = await this.labelsOf(issueNumber);
    for (const label of remove.filter((name) => present.has(name))) {
      await this.retrying(
        () => this.api(`${this.repositoryPath}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, { method: 'DELETE' }),
        async () => ((await this.labelsOf(issueNumber)).has(label) ? null : ''),
      );
    }
  }

  async comment(issueNumber: number, body: string): Promise<void> {
    await this.retrying(
      async () => {
        await this.api(`${this.repositoryPath}/issues/${issueNumber}/comments`, { method: 'POST', fields: { body } });
      },
      async () => ((await this.recentCommentBodies(issueNumber)).includes(body) ? undefined : null),
    );
  }

  async openPullRequest(draft: PullRequestDraft): Promise<PullRequestRef> {
    return this.retrying(
      () => this.createPullRequest(draft),
      () => this.findOpenPullRequest(draft.branch),
    );
  }

  private async createPullRequest(draft: PullRequestDraft): Promise<PullRequestRef> {
    const labels = [...new Set(draft.labels)];
    const created = await this.ghOnce([
      'pr',
      'create',
      '--repo',
      this.repositorySlug,
      '--base',
      this.settings.baseBranch,
      '--head',
      draft.branch,
      '--title',
      draft.title,
      '--body',
      withClosingLines(draft.body, draft.closes),
      ...labels.flatMap((label) => ['--label', label]),
    ]);
    const url = lastLine(created);
    const view = await this.ghJson(
      ['pr', 'view', url, '--repo', this.repositorySlug, '--json', PULL_REQUEST_REF_FIELDS],
      PullRequestViewSchema,
      'pull request view',
    );
    return { number: view.number, url: view.url, headSha: view.headRefOid };
  }

  async findOpenPullRequest(branch: string): Promise<PullRequestRef | null> {
    const pulls = await this.ghJson(
      [
        'pr',
        'list',
        '--repo',
        this.repositorySlug,
        '--head',
        branch,
        '--state',
        OPEN_PULL_REQUEST_STATE,
        '--json',
        PULL_REQUEST_REF_FIELDS,
      ],
      PullRequestListSchema,
      `open pull requests of ${branch}`,
    );
    const [first] = pulls;
    return first === undefined ? null : { number: first.number, url: first.url, headSha: first.headRefOid };
  }

  async branchHead(branch: string): Promise<string | null> {
    const branchPath = branch.split('/').map(encodeURIComponent).join('/');
    try {
      const response = await this.apiJson(`${this.repositoryPath}/branches/${branchPath}`, BranchResponseSchema, `branch ${branch}`);
      return response.commit.sha;
    } catch (error) {
      if (error instanceof GitHubCommandError && error.stderr.includes(NOT_FOUND_STDERR_MARKER)) return null;
      throw error;
    }
  }

  async listOpenPullRequests(): Promise<readonly OpenPullRequestSummary[]> {
    const pulls = await this.ghJson(
      [
        'pr',
        'list',
        '--repo',
        this.repositorySlug,
        '--state',
        OPEN_PULL_REQUEST_STATE,
        '--limit',
        String(OPEN_PULL_REQUEST_LIST_LIMIT),
        '--json',
        OPEN_PULL_REQUEST_SUMMARY_FIELDS,
      ],
      OpenPullRequestListSchema,
      'open pull requests',
    );
    return pulls
      .map((pull) => ({
        number: pull.number,
        title: pull.title,
        branch: pull.headRefName,
        headSha: pull.headRefOid,
        url: pull.url,
        labels: pull.labels.map((label) => label.name),
        createdAt: pull.createdAt === null ? null : new Date(pull.createdAt),
      }))
      .sort((left, right) => left.number - right.number);
  }

  async listTags(): Promise<readonly TagRef[]> {
    const pages = await this.apiJson(`${this.repositoryPath}/tags?per_page=${PAGE_SIZE}`, TagListPagesSchema, 'tags', { paginate: true });
    return pages.flat().map((tag) => ({ name: tag.name, sha: tag.commit.sha }));
  }

  async updatePullRequestBody(number: number, body: string): Promise<void> {
    await this.retrying(() => this.api(`${this.repositoryPath}/pulls/${number}`, { method: 'PATCH', fields: { body } }));
  }

  async checks(ref: string): Promise<readonly CheckRunSummary[]> {
    const encodedRef = encodeURIComponent(ref);
    const runPages = await this.apiJson(
      `${this.repositoryPath}/commits/${encodedRef}/check-runs?per_page=${PAGE_SIZE}`,
      CheckRunsPagesSchema,
      `check runs of ${ref}`,
      { paginate: true },
    );
    const statusPages = await this.apiJson(
      `${this.repositoryPath}/commits/${encodedRef}/status?per_page=${PAGE_SIZE}`,
      CommitStatusPagesSchema,
      `commit statuses of ${ref}`,
      { paginate: true },
    );
    const runs = runPages.flatMap((page) =>
      page.check_runs.map((run) => ({
        name: run.name,
        conclusion: conclusionOfCheckRun(run.status, run.conclusion),
        url: run.html_url ?? '',
      })),
    );
    const statuses = statusPages.flatMap((page) =>
      page.statuses.map((status) => ({
        name: status.context,
        conclusion: conclusionOfCommitStatus(status.state),
        url: status.target_url ?? '',
      })),
    );
    return [...runs, ...statuses];
  }

  baseBranchChecks(): Promise<readonly CheckRunSummary[]> {
    return this.checks(this.settings.baseBranch);
  }

  async squashMerge(number: number, expectedHeadSha: string): Promise<string> {
    const head = await this.ghJson(
      ['pr', 'view', String(number), '--repo', this.repositorySlug, '--json', 'headRefOid'],
      PullRequestHeadViewSchema,
      `head of pull request #${number}`,
    );
    if (head.headRefOid !== expectedHeadSha) throw new PullRequestHeadMovedError(number, expectedHeadSha, head.headRefOid);
    const mergeCommit = () =>
      this.ghJson(['pr', 'view', String(number), '--repo', this.repositorySlug, '--json', 'mergeCommit'], PullRequestMergeViewSchema, `merge commit of pull request #${number}`);
    await this.retrying(
      () => this.ghOnce(['pr', 'merge', String(number), '--repo', this.repositorySlug, '--squash', '--match-head-commit', expectedHeadSha]),
      async () => ((await mergeCommit()).mergeCommit === null ? null : ''),
    );
    const merged = await mergeCommit();
    if (merged.mergeCommit === null) {
      throw new GitHubPayloadError(`merge commit of pull request #${number}`, new Error('mergeCommit is null'));
    }
    return merged.mergeCommit.oid;
  }

  async commitsSince(branch: string, sinceSha: string | null): Promise<readonly CommitSummary[]> {
    const newestFirst: z.infer<typeof CommitListSchema> = [];
    const maxPages = sinceSha === null ? 1 : MAX_COMMIT_PAGES;
    let reachedSince = false;
    for (let page = 1; page <= maxPages && !reachedSince; page += 1) {
      const commits = await this.apiJson(
        `${this.repositoryPath}/commits?sha=${encodeURIComponent(branch)}&per_page=${PAGE_SIZE}&page=${page}`,
        CommitListSchema,
        `commits of ${branch}`,
      );
      const boundary = commits.findIndex((commit) => commit.sha === sinceSha);
      newestFirst.push(...(boundary === -1 ? commits : commits.slice(0, boundary)));
      reachedSince = boundary !== -1 || commits.length < PAGE_SIZE || sinceSha === null;
    }
    if (!reachedSince) throw new CommitScanLimitError(branch, sinceSha ?? '', maxPages);
    const oldestFirst = [...newestFirst].reverse();
    return Promise.all(oldestFirst.map((commit) => this.summariseCommit(commit)));
  }

  async commit(sha: string): Promise<CommitSummary> {
    const found = await this.apiJson(`${this.repositoryPath}/commits/${encodeURIComponent(sha)}`, CommitSchema, `commit ${sha}`);
    return this.summariseCommit(found);
  }

  async commitDiff(sha: string): Promise<CommitDiff> {
    const commitPath = `${this.repositoryPath}/commits/${encodeURIComponent(sha)}`;
    const detail = await this.apiJson(commitPath, CommitDetailSchema, `commit ${sha}`);
    const diff = await this.api(commitPath, { headers: { [ACCEPT_HEADER]: DIFF_MEDIA_TYPE } });
    return { diff, changedFiles: detail.files.map((file) => file.filename) };
  }

  async deployments(environment: string, limit: number): Promise<readonly DeploymentRecord[]> {
    const deployments = await this.apiJson(
      `${this.repositoryPath}/deployments?environment=${encodeURIComponent(environment)}&per_page=${limit}`,
      DeploymentListSchema,
      `deployments to ${environment}`,
    );
    return Promise.all(
      deployments.map(async (deployment): Promise<DeploymentRecord> => {
        const statuses = await this.apiJson(
          `${this.repositoryPath}/deployments/${deployment.id}/statuses?per_page=${LATEST_DEPLOYMENT_STATUS_COUNT}`,
          DeploymentStatusListSchema,
          `status of deployment ${deployment.id}`,
        );
        const latest = statuses[0];
        return {
          id: String(deployment.id),
          environment: deployment.environment,
          ref: deployment.ref,
          sha: deployment.sha,
          createdAt: deployment.created_at,
          creator: deployment.creator?.login ?? null,
          state: latest === undefined ? NO_STATUS_STATE : (DEPLOYMENT_STATE_OF[latest.state] ?? NO_STATUS_STATE),
          logUrl: latest?.log_url ?? latest?.target_url ?? null,
          environmentUrl: latest?.environment_url === '' ? null : (latest?.environment_url ?? null),
        };
      }),
    );
  }

  async dispatchWorkflow(dispatch: WorkflowDispatch): Promise<WorkflowDispatchReceipt> {
    const fields = Object.entries(dispatch.inputs).flatMap(([name, value]) => [WORKFLOW_DISPATCH_FIELD_FLAG, `${name}=${value}`]);
    await this.ghOnce(['workflow', 'run', dispatch.workflow, '--repo', this.repositorySlug, '--ref', dispatch.ref, ...fields]);
    return { simulated: false, url: `${GITHUB_WEB_ORIGIN}/${this.repositorySlug}/actions/workflows/${dispatch.workflow}` };
  }

  async workflowRuns(limit: number): Promise<readonly WorkflowRunRecord[]> {
    const listed = await this.apiJson(`${this.repositoryPath}/actions/runs?per_page=${limit}`, WorkflowRunListSchema, 'workflow runs');
    return listed.workflow_runs.map((run) => ({
      id: String(run.id),
      workflow: run.name ?? run.display_title,
      title: run.display_title,
      branch: run.head_branch ?? '',
      sha: run.head_sha,
      trigger: run.event,
      status: run.status === 'in_progress' || run.status === 'completed' ? run.status : 'queued',
      conclusion: run.conclusion,
      actor: run.actor?.login ?? null,
      startedAt: new Date(run.run_started_at ?? run.created_at),
      updatedAt: new Date(run.updated_at),
      url: run.html_url,
    }));
  }

  async pullRequestDetails(number: number): Promise<PullRequestDetails> {
    const pull = await this.apiJson(`${this.repositoryPath}/pulls/${number}`, PullRequestDetailsSchema, `pull request #${number}`);
    return { number: pull.number, title: pull.title, body: pull.body ?? '', authorLogin: pull.user?.login ?? null };
  }

  private async summariseCommit(commit: z.infer<typeof CommitSchema>): Promise<CommitSummary> {
    const pulls = await this.apiJson(
      `${this.repositoryPath}/commits/${commit.sha}/pulls`,
      CommitPullRequestsSchema,
      `pull requests of ${commit.sha}`,
    );
    const pullRequest = pulls.find((candidate) => candidate.merge_commit_sha === commit.sha) ?? pulls[0] ?? null;
    return {
      sha: commit.sha,
      authorLogin: commit.author?.login ?? null,
      message: commit.commit.message,
      committedAt: commit.commit.committer.date,
      pullRequestNumber: pullRequest?.number ?? null,
      pullRequestBranch: pullRequest?.head.ref ?? null,
      pullRequestLabels: pullRequest?.labels.map((label) => label.name) ?? [],
    };
  }

  private async blockedByOf(issueNumber: number): Promise<number[]> {
    const pages = await this.apiJson(
      `${this.repositoryPath}/issues/${issueNumber}/dependencies/blocked_by?per_page=${PAGE_SIZE}`,
      IssueListPagesSchema,
      `dependencies of issue #${issueNumber}`,
      { paginate: true },
    );
    return pages.flat().map((issue) => issue.number);
  }

  private async apiJson<S extends z.ZodType>(path: string, schema: S, what: string, request: ApiRequest = {}): Promise<z.infer<S>> {
    return parsePayload(await this.api(path, request), schema, what);
  }

  /** A read is tried again on a transient failure; a write runs once, and its caller decides how to try it again. */
  private api(path: string, request: ApiRequest = {}): Promise<string> {
    const method = request.method ?? READ_METHOD;
    const args = ['api', path, '--method', method];
    if (request.paginate === true) args.push('--paginate', '--slurp');
    for (const [name, value] of Object.entries(request.headers ?? {})) args.push('-H', `${name}: ${value}`);
    for (const [key, value] of Object.entries(request.fields ?? {})) args.push(...fieldArguments(key, value));
    return method === READ_METHOD ? this.gh(args) : this.ghOnce(args);
  }

  private async ghJson<S extends z.ZodType>(args: readonly string[], schema: S, what: string): Promise<z.infer<S>> {
    return parsePayload(await this.gh(args), schema, what);
  }

  private retrying<T>(call: () => Promise<T>, landed?: () => Promise<T | null>): Promise<T> {
    return withTransientRetries(call, this.settings.retry ?? DEFAULT_RETRY_SETTINGS, landed);
  }

  private async labelsOf(issueNumber: number): Promise<ReadonlySet<string>> {
    const pages = await this.apiJson(`${this.repositoryPath}/issues/${issueNumber}/labels?per_page=${PAGE_SIZE}`, LabelListPagesSchema, `labels of issue #${issueNumber}`, { paginate: true });
    return new Set(pages.flat().map((label) => label.name));
  }

  /** The issue a failed creation may have opened anyway: the newest open issue with the same title and body. */
  private async recentIssue(title: string, body: string): Promise<IssueRecord | null> {
    const recent = await this.apiJson(
      `${this.repositoryPath}/issues?state=open&sort=created&direction=desc&per_page=${RECENT_ITEMS}`,
      IssueListSchema,
      'recent issues',
    );
    const found = recent.find((issue) => issue.pull_request === undefined && issue.title === title && (issue.body ?? '') === body);
    return found === undefined ? null : toIssueRecord(found, []);
  }

  private async recentCommentBodies(issueNumber: number): Promise<readonly string[]> {
    const comments = await this.apiJson(
      `${this.repositoryPath}/issues/${issueNumber}/comments?sort=created&direction=desc&per_page=${RECENT_ITEMS}`,
      CommentListSchema,
      `comments of issue #${issueNumber}`,
    );
    return comments.map((comment) => comment.body ?? '');
  }

  private gh(args: readonly string[]): Promise<string> {
    return this.retrying(() => this.ghOnce(args));
  }

  private async ghOnce(args: readonly string[]): Promise<string> {
    const result = await this.runner.run(
      [this.settings.ghExecutable ?? GH_EXECUTABLE, ...args],
      this.settings.workingDirectory ?? process.cwd(),
      GH_COMMAND_TIMEOUT_MS,
      this.settings.environment,
    );
    if (result.exitCode !== EXIT_CODE_OK || result.timedOut) {
      throw new GitHubCommandError(args, result.exitCode, result.stderr, result.timedOut);
    }
    return result.stdout;
  }
}

function fieldArguments(key: string, value: FieldValue): string[] {
  if (typeof value === 'number') return ['-F', `${key}=${value}`];
  if (typeof value === 'string') return ['-f', `${key}=${value}`];
  return value.flatMap((item) => ['-f', `${key}[]=${item}`]);
}

function parsePayload<S extends z.ZodType>(raw: string, schema: S, what: string): z.infer<S> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new GitHubPayloadError(what, error);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new GitHubPayloadError(what, parsed.error);
  return parsed.data;
}

function toIssueRecord(issue: IssueResponse, blockedBy: readonly number[]): IssueRecord {
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? '',
    labels: issue.labels.map((label) => label.name),
    state: issue.state,
    blockedBy,
    createdAt: new Date(issue.created_at),
    updatedAt: new Date(issue.updated_at),
  };
}

function lastLine(output: string): string {
  return output.trim().split('\n').at(-1) ?? '';
}
