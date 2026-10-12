import { pathToFileURL } from 'node:url';
import type {
  CheckRunSummary,
  Clock,
  CommandRunner,
  CommitDiff,
  CommitSummary,
  DeploymentRecord,
  GitHubGateway,
  IssueRecord,
  OpenPullRequestSummary,
  PullRequestDetails,
  PullRequestDraft,
  PullRequestRef,
  TagRef,
  WorkflowDispatch,
  WorkflowDispatchReceipt,
} from '@agent-factory/application';
import type { GitIdentity } from '../git/gitSourceControl.ts';
import { PullRequestHeadMovedError } from '../github/errors.ts';
import { withClosingLines } from '../github/pullRequestConventions.ts';
import type { LocalCheckMode } from './constants.ts';
import type { LocalGateChecks } from './localGateChecks.ts';
import { LocalMergeConflictError, LocalPullRequestRefusedError, LocalRecordNotFoundError } from './errors.ts';
import { LocalBareRepository, type LocalCommit } from './localBareRepository.ts';
import { LocalGitHubFiles, type IssueDraft, type LocalIssue } from './localGitHubFiles.ts';
import type { IssueFrontMatter, PullRequestFile } from './schemas.ts';

const ISSUE_KIND = 'issue';
const PULL_REQUEST_KIND = 'pull request';
const ISSUE_OR_PULL_REQUEST_KIND = 'issue or pull request';
const OPEN_STATE = 'open';
const CLOSED_STATE = 'closed';
const MERGED_STATE = 'merged';
const PARAGRAPH = '\n\n';
const SQUASH_LIST_MARKER = '* ';

export interface LocalGitHubGatewaySettings {
  readonly directory: string;
  readonly bareRepositoryPath: string;
  readonly baseBranch: string;
  readonly checks: LocalCheckMode;
  /** Runs the gate a `gate` check mode reports; without one, pull requests carry no check. */
  readonly gateChecks?: LocalGateChecks | null;
  readonly identity: GitIdentity;
  readonly environment: Readonly<Record<string, string>>;
}

function toIssueRecord(issue: LocalIssue): IssueRecord {
  return {
    number: issue.number,
    title: issue.frontMatter.title,
    body: issue.body,
    labels: issue.frontMatter.labels,
    state: issue.frontMatter.state,
    blockedBy: issue.frontMatter.blockedBy,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}

function withoutDuplicates(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function squashMessage(pullRequest: PullRequestFile, subjects: readonly string[]): string {
  const title = `${pullRequest.title} (#${pullRequest.number})`;
  return subjects.length === 0 ? title : `${title}${PARAGRAPH}${subjects.map((subject) => `${SQUASH_LIST_MARKER}${subject}`).join('\n')}`;
}

function summariseCommit(commit: LocalCommit, merged: readonly PullRequestFile[]): CommitSummary {
  const pullRequest = merged.find((candidate) => candidate.mergeSha === commit.sha) ?? null;
  return {
    sha: commit.sha,
    authorLogin: commit.authorName,
    message: commit.message,
    committedAt: commit.committedAt,
    pullRequestNumber: pullRequest?.number ?? null,
    pullRequestBranch: pullRequest?.head ?? null,
    pullRequestLabels: pullRequest?.labels ?? [],
  };
}

export class LocalGitHubGateway implements GitHubGateway {
  private readonly files: LocalGitHubFiles;
  private readonly repository: LocalBareRepository;
  private readonly settings: LocalGitHubGatewaySettings;
  private readonly clock: Clock;

  constructor(runner: CommandRunner, settings: LocalGitHubGatewaySettings, clock: Clock) {
    this.files = new LocalGitHubFiles(settings.directory);
    this.repository = new LocalBareRepository(runner, {
      path: settings.bareRepositoryPath,
      environment: settings.environment,
      identity: settings.identity,
    });
    this.settings = settings;
    this.clock = clock;
  }

  async deployments(environment: string, limit: number): Promise<readonly DeploymentRecord[]> {
    const recorded = await this.files.readDeployments(environment);
    return [...recorded]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((deployment) => ({ ...deployment, environment, createdAt: new Date(deployment.createdAt) }));
  }

  async dispatchWorkflow(dispatch: WorkflowDispatch): Promise<WorkflowDispatchReceipt> {
    const record = await this.files.recordWorkflowDispatch({ ...dispatch, inputs: { ...dispatch.inputs }, recordedAt: this.clock.now().toISOString() });
    return { simulated: true, url: pathToFileURL(this.files.workflowDispatchPath(record.number)).href };
  }

  async getIssue(number: number): Promise<IssueRecord> {
    return toIssueRecord(await this.requireIssue(number));
  }

  async listIssues(label: string): Promise<readonly IssueRecord[]> {
    return (await this.files.issues())
      .filter((issue) => issue.frontMatter.state === OPEN_STATE && issue.frontMatter.labels.includes(label))
      .map(toIssueRecord);
  }

  async createIssue(title: string, body: string, labels: readonly string[]): Promise<IssueRecord> {
    const openedAt = this.clock.now().toISOString();
    const draft: IssueDraft = {
      number: await this.files.nextNumber(),
      frontMatter: { title, labels: withoutDuplicates(labels), state: OPEN_STATE, blockedBy: [], createdAt: openedAt, updatedAt: openedAt },
      body,
    };
    await this.files.writeIssue(draft);
    return toIssueRecord(await this.requireIssue(draft.number));
  }

  async addBlockedBy(issueNumber: number, blockingIssueNumber: number): Promise<void> {
    const issue = await this.requireIssue(issueNumber);
    await this.requireIssue(blockingIssueNumber);
    if (issue.frontMatter.blockedBy.includes(blockingIssueNumber)) return;
    await this.updateIssue(issue, { blockedBy: [...issue.frontMatter.blockedBy, blockingIssueNumber] });
  }

  async setLabels(issueNumber: number, add: readonly string[], remove: readonly string[]): Promise<void> {
    const relabel = (labels: readonly string[]): string[] =>
      withoutDuplicates([...labels, ...add]).filter((label) => !remove.includes(label));
    const issue = await this.files.readIssue(issueNumber);
    if (issue !== null) {
      await this.updateIssue(issue, { labels: relabel(issue.frontMatter.labels) });
      return;
    }
    const pullRequest = await this.files.readPullRequest(issueNumber);
    if (pullRequest === null) throw new LocalRecordNotFoundError(ISSUE_OR_PULL_REQUEST_KIND, issueNumber);
    await this.files.writePullRequest({ ...pullRequest, labels: relabel(pullRequest.labels) });
  }

  async comment(issueNumber: number, body: string): Promise<void> {
    const exists = (await this.files.readIssue(issueNumber)) !== null || (await this.files.readPullRequest(issueNumber)) !== null;
    if (!exists) throw new LocalRecordNotFoundError(ISSUE_OR_PULL_REQUEST_KIND, issueNumber);
    const comments = await this.files.readComments(issueNumber);
    await this.files.writeComments(issueNumber, [...comments, { body, createdAt: this.clock.now().toISOString() }]);
  }

  async openPullRequest(draft: PullRequestDraft): Promise<PullRequestRef> {
    const headSha = await this.repository.branchHead(draft.branch);
    if (headSha === null) throw new LocalPullRequestRefusedError(draft.branch, 'the branch does not exist on the local remote');
    if ((await this.openPullRequestOf(draft.branch)) !== null) {
      throw new LocalPullRequestRefusedError(draft.branch, 'a pull request is already open for this branch');
    }
    const pullRequest: PullRequestFile = {
      number: await this.files.nextNumber(),
      title: draft.title,
      head: draft.branch,
      base: this.settings.baseBranch,
      labels: [...new Set(draft.labels)],
      closes: [...draft.closes],
      state: OPEN_STATE,
      author: this.settings.identity.name,
      createdAt: this.clock.now().toISOString(),
      mergeSha: null,
      mergedAt: null,
    };
    await this.files.writePullRequestBody(pullRequest.number, withClosingLines(draft.body, draft.closes));
    await this.files.writePullRequest(pullRequest);
    return this.refOf(pullRequest, headSha);
  }

  async findOpenPullRequest(branch: string): Promise<PullRequestRef | null> {
    const pullRequest = await this.openPullRequestOf(branch);
    if (pullRequest === null) return null;
    const headSha = await this.repository.branchHead(branch);
    if (headSha === null) throw new LocalPullRequestRefusedError(`#${pullRequest.number}`, `its branch ${branch} no longer exists`);
    return this.refOf(pullRequest, headSha);
  }

  branchHead(branch: string): Promise<string | null> {
    return this.repository.branchHead(branch);
  }

  async listOpenPullRequests(): Promise<readonly OpenPullRequestSummary[]> {
    const open = (await this.files.pullRequests()).filter((pullRequest) => pullRequest.state === OPEN_STATE);
    const summaries = await Promise.all(
      open.map(async (pullRequest): Promise<OpenPullRequestSummary | null> => {
        const headSha = await this.repository.branchHead(pullRequest.head);
        if (headSha === null) return null;
        return {
          number: pullRequest.number,
          title: pullRequest.title,
          branch: pullRequest.head,
          headSha,
          url: this.refOf(pullRequest, headSha).url,
          labels: pullRequest.labels,
          createdAt: new Date(pullRequest.createdAt),
        };
      }),
    );
    return summaries.filter((summary) => summary !== null).sort((left, right) => left.number - right.number);
  }

  async listTags(): Promise<readonly TagRef[]> {
    return (await this.repository.tags()).map((tag) => ({ name: tag.name, sha: tag.sha }));
  }

  /** A local forge runs no workflows. */
  workflowRuns(): Promise<null> {
    return Promise.resolve(null);
  }

  async updatePullRequestBody(number: number, body: string): Promise<void> {
    await this.requirePullRequest(number);
    await this.files.writePullRequestBody(number, body);
  }

  async checks(ref: string): Promise<readonly CheckRunSummary[]> {
    const gate = this.settings.gateChecks ?? null;
    if (this.settings.checks !== 'gate' || gate === null) return [];
    return gate.of((await this.repository.commit(ref)).sha);
  }

  baseBranchChecks(): Promise<readonly CheckRunSummary[]> {
    return this.checks(this.settings.baseBranch);
  }

  async squashMerge(number: number, expectedHeadSha: string): Promise<string> {
    const pullRequest = await this.requirePullRequest(number);
    if (pullRequest.state !== OPEN_STATE) throw new LocalPullRequestRefusedError(`#${number}`, `it is ${pullRequest.state}`);
    const headSha = await this.repository.branchHead(pullRequest.head);
    if (headSha === null) throw new LocalPullRequestRefusedError(`#${number}`, `its branch ${pullRequest.head} no longer exists`);
    if (headSha !== expectedHeadSha) throw new PullRequestHeadMovedError(number, expectedHeadSha, headSha);
    const baseSha = await this.repository.branchHead(pullRequest.base);
    if (baseSha === null) throw new LocalPullRequestRefusedError(`#${number}`, `the base branch ${pullRequest.base} does not exist`);
    const subjects = await this.repository.subjectsBetween(baseSha, headSha);
    const result = await this.repository.squash(pullRequest.base, baseSha, headSha, squashMessage(pullRequest, subjects));
    if (result.kind === 'conflict') throw new LocalMergeConflictError(number, result.detail);
    await this.files.writePullRequest({ ...pullRequest, state: MERGED_STATE, mergeSha: result.sha, mergedAt: this.clock.now().toISOString() });
    await this.closeIssues(pullRequest.closes);
    return result.sha;
  }

  async commitsSince(branch: string, sinceSha: string | null): Promise<readonly CommitSummary[]> {
    const commits = await this.repository.commitsSince(branch, sinceSha);
    const merged = await this.mergedPullRequests();
    return commits.map((commit) => summariseCommit(commit, merged));
  }

  async commit(sha: string): Promise<CommitSummary> {
    return summariseCommit(await this.repository.commit(sha), await this.mergedPullRequests());
  }

  commitDiff(sha: string): Promise<CommitDiff> {
    return this.repository.commitDiff(sha);
  }

  async pullRequestDetails(number: number): Promise<PullRequestDetails> {
    const pullRequest = await this.requirePullRequest(number);
    return { number, title: pullRequest.title, body: await this.files.readPullRequestBody(number), authorLogin: pullRequest.author };
  }

  private refOf(pullRequest: PullRequestFile, headSha: string): PullRequestRef {
    return { number: pullRequest.number, url: pathToFileURL(this.files.pullRequestBodyPath(pullRequest.number)).href, headSha };
  }

  private async mergedPullRequests(): Promise<readonly PullRequestFile[]> {
    return (await this.files.pullRequests()).filter((pullRequest) => pullRequest.mergeSha !== null);
  }

  private async openPullRequestOf(branch: string): Promise<PullRequestFile | null> {
    return (await this.files.pullRequests()).find((pullRequest) => pullRequest.head === branch && pullRequest.state === OPEN_STATE) ?? null;
  }

  private async closeIssues(numbers: readonly number[]): Promise<void> {
    for (const number of numbers) {
      const issue = await this.files.readIssue(number);
      if (issue !== null && issue.frontMatter.state !== CLOSED_STATE) {
        await this.updateIssue(issue, { state: CLOSED_STATE });
      }
    }
  }

  /** Writes a change to an issue, keeping the time it was opened and stamping the time of the change. */
  private async updateIssue(issue: LocalIssue, change: Partial<IssueFrontMatter>): Promise<void> {
    await this.files.writeIssue({
      number: issue.number,
      body: issue.body,
      frontMatter: { ...issue.frontMatter, ...change, createdAt: issue.createdAt.toISOString(), updatedAt: this.clock.now().toISOString() },
    });
  }

  private async requireIssue(number: number): Promise<LocalIssue> {
    const issue = await this.files.readIssue(number);
    if (issue === null) throw new LocalRecordNotFoundError(ISSUE_KIND, number);
    return issue;
  }

  private async requirePullRequest(number: number): Promise<PullRequestFile> {
    const pullRequest = await this.files.readPullRequest(number);
    if (pullRequest === null) throw new LocalRecordNotFoundError(PULL_REQUEST_KIND, number);
    return pullRequest;
  }
}
