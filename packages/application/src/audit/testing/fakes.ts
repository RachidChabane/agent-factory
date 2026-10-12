import type {
  AgentHarness,
  AgentRunRequest,
  AgentRunResult,
  CheckRunSummary,
  CommitDiff,
  DeploymentRecord,
  CommitSummary,
  EventStore,
  FactoryEventRecord,
  GitHubGateway,
  IssueRecord,
  OpenPullRequestSummary,
  PullRequestDetails,
  TagRef,
  RolePromptCatalog,
  WorkflowDispatch,
  WorkflowDispatchReceipt,
} from '../../ports.ts';
import type { AgentRole } from '@agent-factory/domain';

export const ISSUE_OPENED_AT = new Date('2026-03-02T08:00:00.000Z');

const EPOCH = new Date(0);

export class InMemoryEventStore implements EventStore {
  readonly records: FactoryEventRecord[] = [];
  private readonly clock: { now(): Date } | null;

  /** Records every event at the clock's time, or at the epoch without a clock. */
  constructor(clock: { now(): Date } | null = null) {
    this.clock = clock;
  }

  append(type: string, subject: string, payload: unknown): Promise<FactoryEventRecord> {
    const record = { sequence: this.records.length + 1, occurredAt: this.clock?.now() ?? EPOCH, type, subject, payload };
    this.records.push(record);
    return Promise.resolve(record);
  }

  read(subjectPrefix: string, afterSequence: number): Promise<readonly FactoryEventRecord[]> {
    return Promise.resolve(this.records.filter((record) => record.sequence > afterSequence && record.subject.startsWith(subjectPrefix)));
  }

  subscribe(): () => void {
    return () => undefined;
  }

  typesOf(subjectPrefix: string): string[] {
    return this.records.filter((record) => record.subject.startsWith(subjectPrefix)).map((record) => record.type);
  }
}

export function commit(overrides: Partial<CommitSummary> & { readonly sha: string }): CommitSummary {
  return {
    authorLogin: 'alice',
    message: `change ${overrides.sha}`,
    committedAt: new Date(0),
    pullRequestNumber: null,
    pullRequestBranch: null,
    pullRequestLabels: [],
    ...overrides,
  };
}

export function factoryCommit(sha: string, pullRequestNumber: number): CommitSummary {
  return commit({ sha, pullRequestNumber, pullRequestBranch: 'factory/12-thing', pullRequestLabels: ['factory'] });
}

export class FakeGitHubGateway implements GitHubGateway {
  readonly history: CommitSummary[] = [];
  readonly createdIssues: { title: string; body: string; labels: readonly string[] }[] = [];
  readonly issues = new Map<number, IssueRecord>();
  readonly diffs = new Map<string, CommitDiff>();
  readonly pullRequests = new Map<number, PullRequestDetails>();
  openPullRequests: readonly OpenPullRequestSummary[] = [];
  tags: readonly TagRef[] = [];
  readonly deploymentsByEnvironment = new Map<string, readonly DeploymentRecord[]>();
  readonly dispatches: WorkflowDispatch[] = [];
  readonly branchHeads = new Map<string, string>();
  readonly merges: { readonly number: number; readonly headSha: string }[] = [];
  checkRuns: readonly CheckRunSummary[] = [];
  baseCheckRuns: readonly CheckRunSummary[] = [];
  simulatedDispatches = false;
  private nextIssueNumber = 500;

  commitsSince(_branch: string, sinceSha: string | null): Promise<readonly CommitSummary[]> {
    const index = this.history.findIndex((entry) => entry.sha === sinceSha);
    return Promise.resolve(index === -1 ? [...this.history] : this.history.slice(index + 1));
  }

  commit(sha: string): Promise<CommitSummary> {
    const found = this.history.find((entry) => entry.sha === sha || entry.sha.startsWith(sha));
    return found === undefined ? Promise.reject(new Error(`no commit ${sha}`)) : Promise.resolve(found);
  }

  commitDiff(sha: string): Promise<CommitDiff> {
    return Promise.resolve(this.diffs.get(sha) ?? { diff: `diff of ${sha}`, changedFiles: ['src/app.ts'] });
  }

  pullRequestDetails(number: number): Promise<PullRequestDetails> {
    return Promise.resolve(this.pullRequests.get(number) ?? { number, title: `pull request ${number}`, body: '', authorLogin: 'alice', state: 'merged' });
  }

  createIssue(title: string, body: string, labels: readonly string[]): Promise<IssueRecord> {
    this.createdIssues.push({ title, body, labels });
    const issue: IssueRecord = { number: this.nextIssueNumber, title, body, labels, state: 'open', blockedBy: [], createdAt: ISSUE_OPENED_AT, updatedAt: ISSUE_OPENED_AT };
    this.nextIssueNumber += 1;
    this.issues.set(issue.number, issue);
    return Promise.resolve(issue);
  }

  getIssue(number: number): Promise<IssueRecord> {
    const issue = this.issues.get(number);
    return issue === undefined ? Promise.reject(new Error(`no issue ${number}`)) : Promise.resolve(issue);
  }

  branchHead(branch: string): Promise<string | null> {
    if (this.branchHeads.size > 0) return Promise.resolve(this.branchHeads.get(branch) ?? null);
    return Promise.resolve(this.history.at(-1)?.sha ?? null);
  }

  deployments(environment: string, limit: number): Promise<readonly DeploymentRecord[]> {
    return Promise.resolve((this.deploymentsByEnvironment.get(environment) ?? []).slice(0, limit));
  }

  dispatchWorkflow(dispatch: WorkflowDispatch): Promise<WorkflowDispatchReceipt> {
    this.dispatches.push(dispatch);
    return Promise.resolve({ simulated: this.simulatedDispatches, url: `https://github.example.invalid/actions/workflows/${dispatch.workflow}` });
  }

  listOpenPullRequests(): Promise<readonly OpenPullRequestSummary[]> {
    return Promise.resolve(this.openPullRequests);
  }

  listTags(): Promise<readonly TagRef[]> {
    return Promise.resolve(this.tags);
  }

  close(number: number): void {
    const issue = this.issues.get(number);
    if (issue !== undefined) this.issues.set(number, { ...issue, state: 'closed' });
  }

  listIssues(label: string): Promise<readonly IssueRecord[]> {
    return Promise.resolve([...this.issues.values()].filter((issue) => issue.state === 'open' && issue.labels.includes(label)));
  }
  addBlockedBy(): never {
    throw new Error('not used');
  }
  setLabels(): never {
    throw new Error('not used');
  }
  comment(): never {
    throw new Error('not used');
  }
  workflowRuns(): Promise<null> {
    return Promise.resolve(null);
  }

  openPullRequest(): never {
    throw new Error('not used');
  }
  findOpenPullRequest(): never {
    throw new Error('not used');
  }
  updatePullRequestBody(): never {
    throw new Error('not used');
  }
  checks(): Promise<readonly CheckRunSummary[]> {
    return Promise.resolve(this.checkRuns);
  }

  /** The checks of the base branch's head; empty unless a test says what fails there. */
  baseBranchChecks(): Promise<readonly CheckRunSummary[]> {
    return Promise.resolve(this.baseCheckRuns);
  }
  squashMerge(number: number, expectedHeadSha: string): Promise<string> {
    const open = this.openPullRequests.find((pullRequest) => pullRequest.number === number);
    if (open === undefined) return Promise.reject(new Error(`pull request #${number} is not open`));
    if (open.headSha !== expectedHeadSha) return Promise.reject(new Error(`pull request #${number} head moved to ${open.headSha}`));
    this.merges.push({ number, headSha: expectedHeadSha });
    this.openPullRequests = this.openPullRequests.filter((pullRequest) => pullRequest.number !== number);
    return Promise.resolve(`merge-of-${number}`);
  }
}

export class StubPromptCatalog implements RolePromptCatalog {
  render(role: AgentRole, values: Record<string, string>): string {
    return `${role}\n${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}`;
  }
}

export function runResult(overrides: Partial<AgentRunResult>): AgentRunResult {
  return {
    runId: 'run',
    sessionId: null,
    outcome: 'success',
    finalText: '',
    costUsd: 0,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    durationMs: 0,
    turns: 1,
    gateBlocks: 0,
    rawLogPath: '',
    ...overrides,
  };
}

export class ScriptedHarness implements AgentHarness {
  readonly requests: AgentRunRequest[] = [];
  private readonly script: (AgentRunResult | Error)[];

  constructor(script: readonly (AgentRunResult | Error)[]) {
    this.script = [...script];
  }

  run(request: AgentRunRequest): Promise<AgentRunResult> {
    this.requests.push(request);
    const next = this.script.shift();
    if (next === undefined) return Promise.reject(new Error('no scripted result left'));
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  }
}

export function verdictAnswer(verdict: string, overrides: Record<string, unknown> = {}): string {
  const block = {
    verdict,
    summary: 'one sentence',
    findings: [{ level: 'method', statement: 'no test covers the change', evidence: 'src/app.ts:3' }],
    proposedFix: verdict === 'keep' ? null : 'add a test',
    ...overrides,
  };
  return `Analysis done.\n\n\`\`\`json\n${JSON.stringify(block, null, 2)}\n\`\`\`\n`;
}
