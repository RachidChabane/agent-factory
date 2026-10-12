import { createHash } from 'node:crypto';
import { assertTransition, InvalidTransitionError, ISSUE_INITIAL_STATE, ISSUE_TRANSITIONED_EVENT, issueSubject } from '@agent-factory/domain';
import type { AgentRole, FrozenCheck, IssueState, KnownSecret, ResourceSnapshot } from '@agent-factory/domain';
import { InMemoryEventStore } from '../../audit/testing/fakes.ts';
import type {
  AgentHarness,
  BaseCheckout,
  BaseCheckouts,
  AgentRunRequest,
  AgentRunResult,
  CheckRunSummary,
  CommandResult,
  CommandRunner,
  CommandSandbox,
  CommitDiff,
  CommitSummary,
  GitHubGateway,
  IdGenerator,
  IssueRecord,
  IssueStateStore,
  KnownSecretSource,
  LogArchive,
  OpenPullRequestSummary,
  TagRef,
  DeploymentRecord,
  WorkflowDispatchReceipt,
  PullRequestDetails,
  PullRequestDraft,
  PullRequestRef,
  ResourceGuard,
  RunningProcess,
  SandboxScope,
  ServiceProcesses,
  Sleeper,
  SourceControl,
  WorkspaceFiles,
  Worktree,
  WorktreePool,
} from '../../ports.ts';
import { IssueTransitionedPayloadSchema } from '../journal-events.ts';

export { InMemoryEventStore };

const PATH_SEPARATOR = '/';
const BASE_SHA = 'base0000';
const POOL_ROOT = '/pool/slot-';
const NEWLINE = '\n';

type Tree = Map<string, string>;

export class InMemoryWorkspace implements WorkspaceFiles {
  readonly trees = new Map<string, Tree>();
  readonly directories = new Map<string, Set<string>>();

  tree(root: string): Tree {
    const existing = this.trees.get(root);
    if (existing !== undefined) return existing;
    const created: Tree = new Map();
    this.trees.set(root, created);
    return created;
  }

  write(root: string, path: string, content: string): void {
    this.tree(root).set(path, content);
  }

  read(root: string, path: string): string | undefined {
    return this.tree(root).get(path);
  }

  readText(root: string, relativePath: string): Promise<string | null> {
    return Promise.resolve(this.tree(root).get(relativePath) ?? null);
  }

  writeText(root: string, relativePath: string, content: string): Promise<void> {
    this.write(root, relativePath, content);
    return Promise.resolve();
  }

  exists(root: string, relativePath: string): Promise<boolean> {
    const tree = this.tree(root);
    const prefix = `${relativePath}${PATH_SEPARATOR}`;
    const directory = this.directories.get(root)?.has(relativePath) ?? false;
    return Promise.resolve(directory || tree.has(relativePath) || [...tree.keys()].some((path) => path.startsWith(prefix)));
  }

  copyFile(fromRoot: string, fromRelativePath: string, toRoot: string, toRelativePath: string): Promise<boolean> {
    const content = this.tree(fromRoot).get(fromRelativePath);
    if (content === undefined) return Promise.resolve(false);
    this.write(toRoot, toRelativePath, content);
    return Promise.resolve(true);
  }

  remove(root: string, relativePath: string): Promise<void> {
    const tree = this.tree(root);
    const prefix = `${relativePath}${PATH_SEPARATOR}`;
    for (const path of [...tree.keys()]) {
      if (path === relativePath || path.startsWith(prefix)) tree.delete(path);
    }
    const directories = this.directories.get(root);
    for (const directory of [...(directories ?? [])]) {
      if (directory === relativePath || directory.startsWith(prefix)) directories?.delete(directory);
    }
    return Promise.resolve();
  }

  makeDirectory(root: string, relativePath: string): Promise<void> {
    const directories = this.directories.get(root) ?? new Set<string>();
    directories.add(relativePath);
    this.directories.set(root, directories);
    return Promise.resolve();
  }
}

interface Commit {
  readonly sha: string;
  readonly message: string;
  readonly snapshot: ReadonlyMap<string, string>;
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function sameTree(left: ReadonlyMap<string, string>, right: ReadonlyMap<string, string>): boolean {
  return left.size === right.size && [...left].every(([path, content]) => right.get(path) === content);
}

export type IgnoreRule = (path: string) => boolean;

export class InMemorySourceControl implements SourceControl {
  readonly commits = new Map<string, Commit[]>();
  readonly pushes: { branch: string; headSha: string }[] = [];
  ignored: IgnoreRule;
  private readonly workspace: InMemoryWorkspace;
  private readonly baseFiles: ReadonlyMap<string, string>;
  private commitCounter = 0;

  constructor(workspace: InMemoryWorkspace, baseFiles: ReadonlyMap<string, string>, ignored: IgnoreRule) {
    this.workspace = workspace;
    this.baseFiles = baseFiles;
    this.ignored = ignored;
  }

  private tracked(worktree: Worktree): ReadonlyMap<string, string> {
    return new Map([...this.workspace.tree(worktree.path)].filter(([path]) => !this.ignored(path)));
  }

  checkout(worktree: Worktree): void {
    this.workspace.trees.set(worktree.path, new Map(this.baseFiles));
    this.commits.set(worktree.path, [{ sha: worktree.baseSha, message: 'base', snapshot: new Map(this.baseFiles) }]);
  }

  history(worktree: Worktree): readonly Commit[] {
    return this.commits.get(worktree.path) ?? [];
  }

  agentCommit(worktree: Worktree, message: string): string {
    return this.commit(worktree, message);
  }

  headSha(worktree: Worktree): Promise<string> {
    return Promise.resolve(this.head(worktree).sha);
  }

  changedFiles(worktree: Worktree): Promise<readonly string[]> {
    const tree = this.tracked(worktree);
    const paths = new Set([...tree.keys(), ...this.baseFiles.keys()]);
    return Promise.resolve([...paths].filter((path) => tree.get(path) !== this.baseFiles.get(path)).sort());
  }

  untrackedFiles(worktree: Worktree): Promise<readonly string[]> {
    const committed = this.head(worktree).snapshot;
    return Promise.resolve([...this.tracked(worktree).keys()].filter((path) => !committed.has(path)).sort());
  }

  async diff(worktree: Worktree): Promise<string> {
    const tree = this.tracked(worktree);
    const changed = await this.changedFiles(worktree);
    return changed
      .map((path) => {
        const before = this.baseFiles.get(path);
        const after = tree.get(path);
        const removed = before === undefined ? [] : before.split(NEWLINE).map((line) => `-${line}`);
        const added = after === undefined ? [] : after.split(NEWLINE).map((line) => `+${line}`);
        return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, '@@ -1 +1 @@', ...removed, ...added].join(NEWLINE);
      })
      .join(NEWLINE);
  }

  isClean(worktree: Worktree): Promise<boolean> {
    return Promise.resolve(sameTree(this.tracked(worktree), this.head(worktree).snapshot));
  }

  commitAll(worktree: Worktree, message: string): Promise<string> {
    if (sameTree(this.tracked(worktree), this.head(worktree).snapshot)) {
      return Promise.reject(new Error('nothing to commit'));
    }
    return Promise.resolve(this.commit(worktree, message));
  }

  commitPaths(worktree: Worktree, paths: readonly string[], message: string): Promise<string> {
    const head = this.head(worktree).snapshot;
    const tree = this.tracked(worktree);
    const snapshot = new Map(head);
    for (const path of paths) {
      const content = tree.get(path);
      if (content === undefined) snapshot.delete(path);
      else snapshot.set(path, content);
    }
    if (sameTree(snapshot, head)) return Promise.reject(new Error('nothing to commit'));
    this.commitCounter += 1;
    const sha = `commit${String(this.commitCounter).padStart(4, '0')}`;
    this.commits.set(worktree.path, [...this.history(worktree), { sha, message, snapshot }]);
    return Promise.resolve(sha);
  }

  discardPaths(worktree: Worktree, paths: readonly string[]): Promise<void> {
    const head = this.head(worktree).snapshot;
    const tree = this.workspace.tree(worktree.path);
    for (const path of paths) {
      const committed = head.get(path);
      if (committed === undefined) tree.delete(path);
      else tree.set(path, committed);
    }
    return Promise.resolve();
  }

  hashFiles(worktree: Worktree, paths: readonly string[]): Promise<readonly FrozenCheck[]> {
    const tree = this.workspace.tree(worktree.path);
    try {
      return Promise.resolve(
        paths.map((path) => {
          const content = tree.get(path);
          if (content === undefined) throw new Error(`ENOENT: ${path}`);
          return { path, sha256: sha256(content) };
        }),
      );
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  push(worktree: Worktree): Promise<void> {
    this.pushes.push({ branch: worktree.branch, headSha: this.head(worktree).sha });
    return Promise.resolve();
  }

  checkoutBaseCopy(): Promise<string> {
    return Promise.reject(new Error('not used'));
  }

  pushedHead(branch: string): string | null {
    return this.pushes.findLast((push) => push.branch === branch)?.headSha ?? null;
  }

  private head(worktree: Worktree): Commit {
    const history = this.history(worktree);
    const head = history.at(-1);
    if (head === undefined) throw new Error(`no checkout at ${worktree.path}`);
    return head;
  }

  private commit(worktree: Worktree, message: string): string {
    this.commitCounter += 1;
    const sha = `commit${String(this.commitCounter).padStart(4, '0')}`;
    const history = this.commits.get(worktree.path) ?? [];
    history.push({ sha, message, snapshot: this.tracked(worktree) });
    this.commits.set(worktree.path, history);
    return sha;
  }
}

export const BASE_WORKSPACES_ROOT = '/pool/base-workspaces';

export class InMemoryBaseWorkspaces implements BaseCheckouts {
  readonly opened: string[] = [];
  readonly removed: string[] = [];
  private readonly sourceControl: InMemorySourceControl;
  private readonly workspace: InMemoryWorkspace;

  constructor(sourceControl: InMemorySourceControl, workspace: InMemoryWorkspace) {
    this.sourceControl = sourceControl;
    this.workspace = workspace;
  }

  checkout(name: string, revision?: string): Promise<BaseCheckout> {
    const path = `${BASE_WORKSPACES_ROOT}/${name}`;
    const sha = revision ?? 'base';
    this.sourceControl.checkout({ path, branch: name, baseSha: sha });
    this.opened.push(path);
    return Promise.resolve({ path, sha });
  }

  remove(checkout: BaseCheckout): Promise<void> {
    this.workspace.trees.delete(checkout.path);
    this.removed.push(checkout.path);
    return Promise.resolve();
  }
}

export class InMemoryWorktreePool implements WorktreePool {
  readonly leases = new Map<number, Worktree>();
  readonly released: Worktree[] = [];
  private readonly sourceControl: InMemorySourceControl;

  constructor(sourceControl: InMemorySourceControl) {
    this.sourceControl = sourceControl;
  }

  acquire(issueNumber: number, branch: string): Promise<Worktree> {
    const path = this.leases.get(issueNumber)?.path ?? `${POOL_ROOT}${this.leases.size}`;
    const worktree: Worktree = { path, branch, baseSha: BASE_SHA };
    this.sourceControl.checkout(worktree);
    this.leases.set(issueNumber, worktree);
    return Promise.resolve(worktree);
  }

  reattach(issueNumber: number, recorded: Worktree, knownCommit: string): Promise<Worktree | null> {
    const leased = this.leases.get(issueNumber);
    const known = this.sourceControl.history(recorded).some((commit) => commit.sha === knownCommit);
    const matches = leased !== undefined && leased.path === recorded.path && leased.branch === recorded.branch;
    return Promise.resolve(matches && known ? recorded : null);
  }

  release(worktree: Worktree): Promise<void> {
    for (const [issueNumber, leased] of this.leases) {
      if (leased.path === worktree.path) this.leases.delete(issueNumber);
    }
    this.released.push(worktree);
    return Promise.resolve();
  }
}

export class EventSourcedIssueStates implements IssueStateStore {
  private readonly events: InMemoryEventStore;

  constructor(events: InMemoryEventStore) {
    this.events = events;
  }

  async get(issueNumber: number): Promise<IssueState | null> {
    const subject = issueSubject(issueNumber);
    const transitions = (await this.events.read(subject, 0)).filter(
      (event) => event.subject === subject && event.type === ISSUE_TRANSITIONED_EVENT,
    );
    const last = transitions.at(-1);
    return last === undefined ? null : IssueTransitionedPayloadSchema.parse(last.payload).to;
  }

  async transition(issueNumber: number, to: IssueState, reason: string): Promise<void> {
    const from = await this.get(issueNumber);
    if (from === null && to !== ISSUE_INITIAL_STATE) throw new InvalidTransitionError('issue', 'none', to);
    if (from !== null) assertTransition(from, to);
    await this.events.append(ISSUE_TRANSITIONED_EVENT, issueSubject(issueNumber), { from, to, reason });
  }

  async path(issueNumber: number): Promise<readonly IssueState[]> {
    const subject = issueSubject(issueNumber);
    return (await this.events.read(subject, 0))
      .filter((event) => event.subject === subject && event.type === ISSUE_TRANSITIONED_EVENT)
      .map((event) => IssueTransitionedPayloadSchema.parse(event.payload).to);
  }
}

export interface OpenedPullRequest {
  readonly draft: PullRequestDraft;
  readonly ref: PullRequestRef;
}

export class InMemoryGitHub implements GitHubGateway {
  readonly issues = new Map<number, IssueRecord>();
  readonly opened: OpenedPullRequest[] = [];
  readonly merges: { number: number; headSha: string }[] = [];
  readonly bodyUpdates: { number: number; body: string }[] = [];
  checkRuns: readonly CheckRunSummary[] = [];
  baseCheckRuns: readonly CheckRunSummary[] = [];
  failNextOpenAfterCreation = false;
  private readonly sourceControl: InMemorySourceControl;
  private nextPullRequestNumber = 100;

  constructor(sourceControl: InMemorySourceControl) {
    this.sourceControl = sourceControl;
  }

  getIssue(number: number): Promise<IssueRecord> {
    const issue = this.issues.get(number);
    return issue === undefined ? Promise.reject(new Error(`no issue #${number}`)) : Promise.resolve(issue);
  }

  openPullRequest(draft: PullRequestDraft): Promise<PullRequestRef> {
    const ref: PullRequestRef = {
      number: this.nextPullRequestNumber,
      url: `https://github.com/acme/widgets/pull/${this.nextPullRequestNumber}`,
      headSha: this.sourceControl.pushedHead(draft.branch) ?? '',
    };
    this.nextPullRequestNumber += 1;
    this.opened.push({ draft, ref });
    if (this.failNextOpenAfterCreation) {
      this.failNextOpenAfterCreation = false;
      return Promise.reject(new Error('connection reset after the pull request was created'));
    }
    return Promise.resolve(ref);
  }

  findOpenPullRequest(branch: string): Promise<PullRequestRef | null> {
    const found = this.opened.find((entry) => entry.draft.branch === branch && !this.merges.some((merge) => merge.number === entry.ref.number));
    if (found === undefined) return Promise.resolve(null);
    return Promise.resolve({ ...found.ref, headSha: this.sourceControl.pushedHead(branch) ?? found.ref.headSha });
  }

  checks(): Promise<readonly CheckRunSummary[]> {
    return Promise.resolve(this.checkRuns);
  }

  /** The checks of the base branch's head; empty unless a test says what fails there. */
  baseBranchChecks(): Promise<readonly CheckRunSummary[]> {
    return Promise.resolve(this.baseCheckRuns);
  }

  squashMerge(number: number, expectedHeadSha: string): Promise<string> {
    const entry = this.opened.find((candidate) => candidate.ref.number === number);
    const head = entry === undefined ? null : this.sourceControl.pushedHead(entry.draft.branch);
    if (head !== expectedHeadSha) return Promise.reject(new Error(`head is ${head ?? 'unknown'}, expected ${expectedHeadSha}`));
    this.merges.push({ number, headSha: expectedHeadSha });
    return Promise.resolve(`merge-of-${expectedHeadSha}`);
  }

  listIssues(label: string): Promise<readonly IssueRecord[]> {
    return Promise.resolve([...this.issues.values()].filter((issue) => issue.state === 'open' && issue.labels.includes(label)));
  }
  createIssue(): never {
    throw new Error('not used');
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
  updatePullRequestBody(number: number, body: string): Promise<void> {
    this.bodyUpdates.push({ number, body });
    return Promise.resolve();
  }
  branchHead(): Promise<string | null> {
    return Promise.resolve(null);
  }
  listOpenPullRequests(): Promise<readonly OpenPullRequestSummary[]> {
    return Promise.resolve(
      this.opened
        .filter((entry) => !this.merges.some((merge) => merge.number === entry.ref.number))
        .map((entry) => ({
          number: entry.ref.number,
          title: entry.draft.title,
          branch: entry.draft.branch,
          headSha: this.sourceControl.pushedHead(entry.draft.branch) ?? entry.ref.headSha,
          url: entry.ref.url,
          labels: entry.draft.labels,
          createdAt: null,
        })),
    );
  }
  workflowRuns(): Promise<null> {
    return Promise.resolve(null);
  }

  listTags(): Promise<readonly TagRef[]> {
    return Promise.resolve([]);
  }
  deployments(): Promise<readonly DeploymentRecord[]> {
    return Promise.resolve([]);
  }
  dispatchWorkflow(): Promise<WorkflowDispatchReceipt> {
    throw new Error('not used');
  }
  commitsSince(): Promise<readonly CommitSummary[]> {
    throw new Error('not used');
  }
  commit(): Promise<CommitSummary> {
    throw new Error('not used');
  }
  commitDiff(): Promise<CommitDiff> {
    throw new Error('not used');
  }
  pullRequestDetails(number: number): Promise<PullRequestDetails> {
    const entry = this.opened.find((candidate) => candidate.ref.number === number);
    if (entry === undefined) return Promise.reject(new Error(`no pull request #${number}`));
    const body = this.bodyUpdates.findLast((update) => update.number === number)?.body ?? entry.draft.body;
    const merged = this.merges.some((merge) => merge.number === number);
    return Promise.resolve({ number, title: entry.draft.title, body, authorLogin: null, state: merged ? 'merged' : 'open' });
  }
}

export interface ScriptedRun {
  readonly outcome?: AgentRunResult['outcome'];
  readonly sessionId?: string | null;
  readonly finalText?: string;
  readonly gateBlocks?: number;
  readonly costUsd?: number;
  readonly effect?: (request: AgentRunRequest) => void;
  readonly crash?: Error;
}

export class ScriptedRoleHarness implements AgentHarness {
  readonly requests: AgentRunRequest[] = [];
  private readonly scripts = new Map<AgentRole, ScriptedRun[]>();
  private readonly fallbacks = new Map<AgentRole, ScriptedRun>();

  script(role: AgentRole, ...runs: readonly ScriptedRun[]): this {
    this.scripts.set(role, [...(this.scripts.get(role) ?? []), ...runs]);
    return this;
  }

  fallback(role: AgentRole, run: ScriptedRun): this {
    this.fallbacks.set(role, run);
    return this;
  }

  requestsOf(role: AgentRole): readonly AgentRunRequest[] {
    return this.requests.filter((request) => request.role === role);
  }

  run(request: AgentRunRequest): Promise<AgentRunResult> {
    this.requests.push(request);
    const run = this.scripts.get(request.role)?.shift() ?? this.fallbacks.get(request.role);
    if (run === undefined) return Promise.reject(new Error(`no scripted ${request.role} run left`));
    if (run.crash !== undefined) return Promise.reject(run.crash);
    run.effect?.(request);
    return Promise.resolve({
      runId: request.runId,
      sessionId: run.sessionId === undefined ? `session-${request.runId}` : run.sessionId,
      outcome: run.outcome ?? 'success',
      finalText: run.finalText ?? 'Done.',
      costUsd: run.costUsd ?? 0.5,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      durationMs: 1000,
      turns: 3,
      gateBlocks: run.gateBlocks ?? 0,
      rawLogPath: `/runs/${request.runId}/stream.jsonl`,
    });
  }
}

export type CommandBehaviour = (cwd: string) => { readonly exitCode: number; readonly output?: string; readonly timedOut?: boolean };

export class ScriptedCommandRunner implements CommandRunner {
  readonly executed: { command: string; argv: readonly string[]; cwd: string; env: Readonly<Record<string, string>> }[] = [];
  private readonly behaviours = new Map<string, CommandBehaviour>();
  private readonly matchers: { readonly matches: (command: string) => boolean; readonly behaviour: CommandBehaviour }[] = [];

  on(command: string, behaviour: CommandBehaviour): this {
    this.behaviours.set(command, behaviour);
    return this;
  }

  onMatching(matches: (command: string) => boolean, behaviour: CommandBehaviour): this {
    this.matchers.push({ matches, behaviour });
    return this;
  }

  run(command: readonly string[], cwd: string, _timeoutMs: number, env: Readonly<Record<string, string>>): Promise<CommandResult> {
    const shellCommand = command.at(-1) ?? '';
    this.executed.push({ command: shellCommand, argv: command, cwd, env });
    const behaviour = this.behaviours.get(shellCommand) ?? this.matchers.findLast((matcher) => matcher.matches(shellCommand))?.behaviour;
    if (behaviour === undefined) return Promise.reject(new Error(`unexpected command ${shellCommand}`));
    const result = behaviour(cwd);
    return Promise.resolve({
      exitCode: result.exitCode,
      stdout: result.output ?? '',
      stderr: '',
      durationMs: 10,
      timedOut: result.timedOut ?? false,
    });
  }

  count(command: string): number {
    return this.executed.filter((entry) => entry.command === command).length;
  }

  countMatching(matches: (command: string) => boolean): number {
    return this.executed.filter((entry) => matches(entry.command)).length;
  }
}

export class InMemoryLogArchive implements LogArchive {
  readonly logs = new Map<string, string>();

  write(issueNumber: number, name: string, content: string): Promise<string> {
    const path = `/logs/issue-${issueNumber}/${name}`;
    this.logs.set(path, content);
    return Promise.resolve(path);
  }

  read(issueNumber: number, name: string): Promise<string | null> {
    return Promise.resolve(this.logs.get(`/logs/issue-${issueNumber}/${name}`) ?? null);
  }
}

export class AdjustableResources implements ResourceGuard {
  current: ResourceSnapshot = { freeMemoryPercent: 70, pressure: 'normal' };

  snapshot(): Promise<ResourceSnapshot> {
    return Promise.resolve(this.current);
  }
}

export class SequentialIds implements IdGenerator {
  private counter = 0;

  next(): string {
    this.counter += 1;
    return `run-${this.counter}`;
  }
}

export const SANDBOX_MARKER = 'sandbox';
export const ONLINE_SCOPE = 'online';
export const OFFLINE_SCOPE = 'offline';

export class RecordingSandbox implements CommandSandbox {
  readonly scopes: SandboxScope[] = [];

  confine(command: readonly string[], scope: SandboxScope): readonly string[] {
    this.scopes.push(scope);
    return [SANDBOX_MARKER, scope.network ? ONLINE_SCOPE : OFFLINE_SCOPE, ...command];
  }
}

export class StaticSecrets implements KnownSecretSource {
  secrets: KnownSecret[] = [];

  knownSecrets(): Promise<readonly KnownSecret[]> {
    return Promise.resolve(this.secrets);
  }
}

/** One process a scripted stack started: what it ran, whether it still runs, and what it printed. */
export class ScriptedProcess implements RunningProcess {
  readonly name: string;
  readonly command: readonly string[];
  readonly pid: number;
  readonly startedAt: string;
  alive = true;
  printed: string;

  constructor(name: string, command: readonly string[], pid: number, printed: string) {
    this.name = name;
    this.command = command;
    this.pid = pid;
    this.startedAt = `started ${pid}`;
    this.printed = printed;
  }

  running(): Promise<boolean> {
    return Promise.resolve(this.alive);
  }

  output(): Promise<string> {
    return Promise.resolve(this.printed);
  }

  stop(): Promise<void> {
    this.alive = false;
    return Promise.resolve();
  }
}

/** Services that start at once and print one line, with what was started, stopped and reclaimed. */
export class ScriptedServiceProcesses implements ServiceProcesses {
  readonly started: ScriptedProcess[] = [];
  readonly reclaimed: { readonly pid: number; readonly startedAt: string }[] = [];
  private nextPid = 4_100;

  start(name: string, command: readonly string[]): Promise<RunningProcess> {
    const process = new ScriptedProcess(name, command, this.nextPid, `${name} listening`);
    this.nextPid += 1;
    this.started.push(process);
    return Promise.resolve(process);
  }

  reclaim(pid: number, startedAt: string): Promise<boolean> {
    this.reclaimed.push({ pid, startedAt });
    return Promise.resolve(true);
  }
}


/** A sleeper that returns at once and remembers how long it was asked to wait. */
export class RecordingSleeper implements Sleeper {
  readonly naps: number[] = [];

  sleep(milliseconds: number): Promise<void> {
    this.naps.push(milliseconds);
    return Promise.resolve();
  }
}
