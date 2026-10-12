import type {
  AgentRole,
  EffortLevel,
  FrozenCheck,
  GateResult,
  IssueSpec,
  IssueState,
  KnownSecret,
  RateLimitSnapshot,
  ResourceSnapshot,
  TokenUsage,
  UsageReading,
} from '@agent-factory/domain';

export const RUN_SUBJECT_KINDS = ['issue', 'request', 'audit', 'release'] as const;
export type RunSubjectKind = (typeof RUN_SUBJECT_KINDS)[number];

export interface AgentRunSubject {
  readonly kind: RunSubjectKind;
  readonly id: string;
}

export interface AgentRunContext {
  readonly subject: AgentRunSubject;
  readonly attempt: number;
  readonly branch: string | null;
}

export interface AgentRunRequest {
  readonly runId: string;
  readonly context: AgentRunContext;
  readonly account: string | null;
  readonly role: AgentRole;
  readonly model: string;
  readonly effort: EffortLevel;
  readonly workingDirectory: string;
  readonly prompt: string;
  readonly appendSystemPrompt: string;
  readonly allowedTools: readonly string[];
  readonly mcpServers: Readonly<Record<string, unknown>>;
  readonly resumeSessionId: string | null;
  readonly maxBudgetUsd: number;
  readonly maxTurns: number;
  readonly frozenChecks: readonly FrozenCheck[];
  readonly gateCommand: string | null;
  readonly decisionRequestPath: string | null;
  readonly timeoutMs: number;
}

export type AgentRunEvent =
  | { readonly kind: 'session-started'; readonly sessionId: string; readonly model: string }
  | { readonly kind: 'assistant-text'; readonly text: string; readonly parentToolUseId: string | null }
  | {
      readonly kind: 'tool-call';
      readonly toolUseId: string;
      readonly toolName: string;
      readonly input: unknown;
      readonly parentToolUseId: string | null;
    }
  | { readonly kind: 'tool-result'; readonly toolUseId: string; readonly isError: boolean; readonly content: string }
  | { readonly kind: 'permission-denied'; readonly toolName: string; readonly message: string }
  | { readonly kind: 'hook'; readonly hookEvent: string; readonly exitCode: number | null; readonly output: string }
  | { readonly kind: 'rate-limit'; readonly snapshots: readonly RateLimitSnapshot[] }
  | { readonly kind: 'progress'; readonly usage: TokenUsage; readonly turns: number }
  | { readonly kind: 'raw'; readonly line: string };

export const AGENT_RUN_OUTCOMES = ['success', 'decision-requested', 'max-turns', 'budget-exceeded', 'error', 'timeout', 'aborted'] as const;
export type AgentRunOutcome = (typeof AGENT_RUN_OUTCOMES)[number];

export interface AgentRunResult {
  readonly runId: string;
  readonly sessionId: string | null;
  readonly outcome: AgentRunOutcome;
  readonly finalText: string;
  readonly costUsd: number;
  readonly usage: TokenUsage;
  readonly durationMs: number;
  readonly turns: number;
  readonly gateBlocks: number;
  readonly rawLogPath: string;
}

export interface AgentHarness {
  run(request: AgentRunRequest, onEvent: (event: AgentRunEvent) => void, signal: AbortSignal): Promise<AgentRunResult>;
}

export interface Worktree {
  readonly path: string;
  readonly branch: string;
  readonly baseSha: string;
}

export interface WorktreePool {
  acquire(issueNumber: number, branch: string): Promise<Worktree>;
  reattach(issueNumber: number, recorded: Worktree, knownCommit: string): Promise<Worktree | null>;
  release(worktree: Worktree): Promise<void>;
}

export interface SourceControl {
  headSha(worktree: Worktree): Promise<string>;
  changedFiles(worktree: Worktree): Promise<readonly string[]>;
  diff(worktree: Worktree): Promise<string>;
  isClean(worktree: Worktree): Promise<boolean>;
  commitAll(worktree: Worktree, message: string): Promise<string>;
  commitPaths(worktree: Worktree, paths: readonly string[], message: string): Promise<string>;
  hashFiles(worktree: Worktree, paths: readonly string[]): Promise<readonly FrozenCheck[]>;
  push(worktree: Worktree): Promise<void>;
  checkoutBaseCopy(worktree: Worktree, paths: readonly string[]): Promise<string>;
}

export interface PullRequestDraft {
  readonly branch: string;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
  readonly closes: readonly number[];
}

export interface PullRequestRef {
  readonly number: number;
  readonly url: string;
  readonly headSha: string;
}

export const CHECK_CONCLUSIONS = ['success', 'failure', 'pending', 'neutral', 'skipped', 'cancelled'] as const;
export type CheckConclusion = (typeof CHECK_CONCLUSIONS)[number];

export interface CheckRunSummary {
  readonly name: string;
  readonly conclusion: CheckConclusion;
  readonly url: string;
  /** How long the check ran, once the forge says when it started and when it ended; null otherwise. */
  readonly durationMs: number | null;
}

export interface CommitSummary {
  readonly sha: string;
  readonly authorLogin: string | null;
  readonly message: string;
  readonly committedAt: Date;
  readonly pullRequestNumber: number | null;
  readonly pullRequestBranch: string | null;
  readonly pullRequestLabels: readonly string[];
}

export interface IssueRecord {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
  readonly state: 'open' | 'closed';
  readonly blockedBy: readonly number[];
  /** When the forge says the issue was opened and last changed. */
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CommitDiff {
  readonly diff: string;
  readonly changedFiles: readonly string[];
}

export interface OpenPullRequestSummary {
  readonly number: number;
  readonly title: string;
  readonly branch: string;
  readonly headSha: string;
  readonly url: string;
  readonly labels: readonly string[];
  /** When the forge created the pull request; null when the forge does not say. */
  readonly createdAt: Date | null;
}

export interface TagRef {
  readonly name: string;
  readonly sha: string;
}

export const FORGE_PULL_REQUEST_STATES = ['open', 'closed', 'merged'] as const;
export type ForgePullRequestState = (typeof FORGE_PULL_REQUEST_STATES)[number];

export interface PullRequestDetails {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly authorLogin: string | null;
  /** Closed means closed without a merge. */
  readonly state: ForgePullRequestState;
}

export const DEPLOYMENT_STATES = ['success', 'failure', 'in-progress', 'inactive'] as const;
export type DeploymentState = (typeof DEPLOYMENT_STATES)[number];

export interface DeploymentRecord {
  readonly id: string;
  readonly environment: string;
  readonly ref: string;
  readonly sha: string;
  readonly createdAt: Date;
  readonly creator: string | null;
  readonly state: DeploymentState;
  readonly logUrl: string | null;
  readonly environmentUrl: string | null;
}

export const WORKFLOW_RUN_STATUSES = ['queued', 'in_progress', 'completed'] as const;
export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];

/** One run of a CI workflow of the repository, as the forge reports it. */
export interface WorkflowRunRecord {
  readonly id: string;
  readonly workflow: string;
  readonly title: string;
  readonly branch: string;
  readonly sha: string;
  readonly trigger: string;
  readonly status: WorkflowRunStatus;
  readonly conclusion: string | null;
  readonly actor: string | null;
  readonly startedAt: Date;
  readonly updatedAt: Date;
  readonly url: string;
}

export interface WorkflowDispatch {
  readonly workflow: string;
  readonly ref: string;
  readonly inputs: Readonly<Record<string, string>>;
}

export interface WorkflowDispatchReceipt {
  readonly simulated: boolean;
  readonly url: string;
}

export interface GitHubGateway {
  getIssue(number: number): Promise<IssueRecord>;
  listIssues(label: string): Promise<readonly IssueRecord[]>;
  createIssue(title: string, body: string, labels: readonly string[]): Promise<IssueRecord>;
  addBlockedBy(issueNumber: number, blockingIssueNumber: number): Promise<void>;
  setLabels(issueNumber: number, add: readonly string[], remove: readonly string[]): Promise<void>;
  comment(issueNumber: number, body: string): Promise<void>;
  openPullRequest(draft: PullRequestDraft): Promise<PullRequestRef>;
  findOpenPullRequest(branch: string): Promise<PullRequestRef | null>;
  updatePullRequestBody(number: number, body: string): Promise<void>;
  checks(ref: string): Promise<readonly CheckRunSummary[]>;
  /** The checks of the head of the base branch, against which a pull request's failing checks are told apart from failures it did not cause. */
  baseBranchChecks(): Promise<readonly CheckRunSummary[]>;
  squashMerge(number: number, expectedHeadSha: string): Promise<string>;
  commitsSince(branch: string, sinceSha: string | null): Promise<readonly CommitSummary[]>;
  commit(sha: string): Promise<CommitSummary>;
  commitDiff(sha: string): Promise<CommitDiff>;
  pullRequestDetails(number: number): Promise<PullRequestDetails>;
  branchHead(branch: string): Promise<string | null>;
  listOpenPullRequests(): Promise<readonly OpenPullRequestSummary[]>;
  listTags(): Promise<readonly TagRef[]>;
  deployments(environment: string, limit: number): Promise<readonly DeploymentRecord[]>;
  dispatchWorkflow(dispatch: WorkflowDispatch): Promise<WorkflowDispatchReceipt>;
  /** The latest runs of the repository's workflows, newest first; null when the forge runs no workflows. */
  workflowRuns(limit: number): Promise<readonly WorkflowRunRecord[] | null>;
}

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
}

export interface CommandRunner {
  run(command: readonly string[], cwd: string, timeoutMs: number, env: Readonly<Record<string, string>>): Promise<CommandResult>;
}

export interface SandboxScope {
  readonly workingDirectory: string;
  readonly network: boolean;
}

export interface CommandSandbox {
  confine(command: readonly string[], scope: SandboxScope): readonly string[];
}

export interface KnownSecretSource {
  knownSecrets(): Promise<readonly KnownSecret[]>;
}

export interface FactoryEventRecord {
  readonly sequence: number;
  readonly occurredAt: Date;
  readonly type: string;
  readonly subject: string;
  readonly payload: unknown;
}

export interface EventStore {
  append(type: string, subject: string, payload: unknown): Promise<FactoryEventRecord>;
  read(subjectPrefix: string, afterSequence: number): Promise<readonly FactoryEventRecord[]>;
  subscribe(listener: (event: FactoryEventRecord) => void): () => void;
}

export interface IssueStateStore {
  get(issueNumber: number): Promise<IssueState | null>;
  transition(issueNumber: number, to: IssueState, reason: string): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface Notifier {
  notify(title: string, body: string, link: string): Promise<void>;
}

export interface SpecReader {
  read(issue: IssueRecord): IssueSpec;
}

export interface RolePromptCatalog {
  render(role: AgentRole, values: Record<string, string>): string;
}

export interface ResourceGuard {
  snapshot(): Promise<ResourceSnapshot>;
}

export interface WorkspaceFiles {
  readText(root: string, relativePath: string): Promise<string | null>;
  writeText(root: string, relativePath: string, content: string): Promise<void>;
  exists(root: string, relativePath: string): Promise<boolean>;
  copyFile(fromRoot: string, fromRelativePath: string, toRoot: string, toRelativePath: string): Promise<boolean>;
  remove(root: string, relativePath: string): Promise<void>;
  /** Creates the directory and its parents inside the root, for a tool that writes into it without creating it. */
  makeDirectory(root: string, relativePath: string): Promise<void>;
}

export interface LogArchive {
  write(issueNumber: number, name: string, content: string): Promise<string>;
  read(issueNumber: number, name: string): Promise<string | null>;
}

export interface IdGenerator {
  next(): string;
}

export interface UsageReport {
  readonly usage: TokenUsage;
  readonly costUsd: number;
  readonly turns: number;
}

export type RunLogEvent =
  | AgentRunEvent
  | ({ readonly kind: 'gate' } & GateResult)
  | ({ readonly kind: 'usage' } & UsageReport);

export interface RunLogLine {
  readonly runId: string;
  readonly index: number;
  readonly at: Date;
  readonly event: RunLogEvent;
}

export interface RunLogPage {
  readonly runId: string;
  readonly total: number;
  readonly lines: readonly RunLogLine[];
}

export interface RunLogStore {
  append(runId: string, event: RunLogEvent): Promise<RunLogLine>;
  read(runId: string, afterIndex: number | null): Promise<RunLogPage>;
  subscribe(listener: (line: RunLogLine) => void): () => void;
}

export interface BaseCheckout {
  readonly path: string;
  readonly sha: string;
}

export interface BaseCheckouts {
  checkout(name: string, revision?: string): Promise<BaseCheckout>;
  remove(checkout: BaseCheckout): Promise<void>;
}

export interface KnowledgePack {
  read(): Promise<string>;
}

export interface OperationLog {
  info(message: string): void;
  warn(message: string): void;
}

export interface Sleeper {
  sleep(milliseconds: number, signal: AbortSignal): Promise<void>;
}

/** Reads the subscription usage of one Claude account without calling a model. */
export interface UsageReportSource {
  read(account: string, signal: AbortSignal): Promise<UsageReading>;
}
