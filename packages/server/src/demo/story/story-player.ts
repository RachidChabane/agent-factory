import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildGitEnvironment, localOnlyGitEnvironment } from '@agent-factory/adapters';
import {
  acceptProposedSpecs,
  AddRequest,
  createIssueFromPlan,
  headVisibilityPolicy,
  loadJournal,
  loadRequest,
  MergeOnOrder,
  planIssueCreation,
  renderSpecFile,
  requestChallenge,
  validateSpec,
  type CommandRunner,
  type OperationLog,
  type RequestRecord,
  type Sleeper,
} from '@agent-factory/application';
import type { IssueState } from '@agent-factory/domain';
import type { InstallationRuntime } from '../../composition/installation/installation-runtime.ts';
import type { ProjectRuntime } from '../../composition/project/project-runtime.ts';
import { requestDecisionSettings } from '../../composition/project/project-use-cases.ts';
import type { ProjectStory, StoryIssue, StoryOutsideChange, StoryRequest } from './story-types.ts';

export const STORY_POLL_MS = 1_000;
export const STORY_STEP_TIMEOUT_MS = 10 * 60_000;
const REQUEST_CHANNEL = 'email';
const CHALLENGED_STATE = 'challenged';
const PULL_REQUEST_OPEN_STATE: IssueState = 'pr-open';
const CHECK_PENDING = 'pending';
const GIT_TIMEOUT_MS = 60_000;
const EXIT_CODE_OK = 0;
const PEOPLE_DIRECTORY = 'people';

export interface StorySettings {
  readonly runner: CommandRunner;
  readonly sleeper: Sleeper;
  readonly log: OperationLog;
  /** Where the people of the story keep their own clones of the projects. */
  readonly workDirectory: string;
  readonly pollMs?: number;
  readonly stepTimeoutMs?: number;
}

export class StoryStepTimedOutError extends Error {
  constructor(what: string) {
    super(`gave up waiting for ${what}`);
    this.name = 'StoryStepTimedOutError';
  }
}

/** Plays one project's story against the running factory, through the same use cases as the command line and the cockpit. */
export class StoryPlayer {
  private readonly installation: InstallationRuntime;
  private readonly project: ProjectRuntime;
  private readonly story: ProjectStory;
  private readonly settings: StorySettings;
  private readonly numbers = new Map<string, number>();

  constructor(installation: InstallationRuntime, project: ProjectRuntime, story: ProjectStory, settings: StorySettings) {
    this.installation = installation;
    this.project = project;
    this.story = story;
    this.settings = settings;
  }

  async play(signal: AbortSignal): Promise<void> {
    const requests = await this.addRequests();
    await this.openIssues();
    await this.challengeRequests(requests, signal);
    for (const key of this.story.merges) await this.mergeWhenOpen(key, signal);
    for (const change of this.story.outsideChanges) await this.landOutsideChange(change);
    if (this.story.release !== null) await this.publish(this.story.release);
  }

  private get events() {
    return this.project.dependencies.events;
  }

  private async addRequests(): Promise<ReadonlyMap<StoryRequest, string>> {
    const { dependencies, config } = this.project;
    const adder = new AddRequest({ events: dependencies.events, files: dependencies.files, clock: this.installation.clock }, { requestsDirectory: config.directories.requests });
    const ids = new Map<StoryRequest, string>();
    for (const request of this.story.requests) {
      const added = await adder.add({ title: request.title, requester: request.requester, channel: REQUEST_CHANNEL, body: request.body, images: [] });
      ids.set(request, added.id);
    }
    return ids;
  }

  private async challengeRequests(ids: ReadonlyMap<StoryRequest, string>, signal: AbortSignal): Promise<void> {
    const challenged = [...ids].filter(([request]) => request.challenge !== null);
    for (const [, id] of challenged) await requestChallenge(this.events, id, this.installation.operator);
    for (const [request, id] of challenged) {
      const record = await this.waitFor(`the challenge of ${id}`, signal, async () => {
        const current = await loadRequest(this.events, id);
        return current?.state === CHALLENGED_STATE ? current : null;
      });
      await this.accept(request, record);
    }
  }

  private async accept(request: StoryRequest, record: RequestRecord): Promise<void> {
    const specIds = request.accept.flatMap((position) => {
      const spec = record.challenge?.specs[position];
      return spec === undefined ? [] : [spec.id];
    });
    if (specIds.length === 0) return;
    await acceptProposedSpecs(this.project.dependencies, requestDecisionSettings(this.project), record.id, specIds);
  }

  private async openIssues(): Promise<void> {
    const { dependencies, conventions } = this.project;
    for (const issue of this.story.issues) {
      const rendered = renderSpecFile({ ...issue.spec, acceptanceCriteria: [...issue.spec.acceptanceCriteria], outOfScope: [...issue.spec.outOfScope] }, conventions);
      const created = await createIssueFromPlan(dependencies, planIssueCreation(rendered.content, null, conventions));
      this.numbers.set(issue.key, created.number);
    }
    for (const issue of this.story.issues) {
      for (const blocker of issue.dependsOn) await dependencies.github.addBlockedBy(this.numberOf(issue.key), this.numberOf(blocker));
    }
    for (const issue of this.story.issues.filter((candidate: StoryIssue) => candidate.validate)) {
      await validateSpec(dependencies, this.numberOf(issue.key), this.installation.operator, conventions);
    }
  }

  private numberOf(key: string): number {
    const number = this.numbers.get(key);
    if (number === undefined) throw new Error(`no issue ${key} in the story of ${this.project.id}`);
    return number;
  }

  private async mergeWhenOpen(key: string, signal: AbortSignal): Promise<void> {
    const number = this.numberOf(key);
    const journal = await this.waitFor(`the pull request of ${this.project.id}#${number}`, signal, async () => {
      const current = await loadJournal(this.events, number);
      return current.state === PULL_REQUEST_OPEN_STATE && current.pullRequest !== null && current.pushedHead !== null ? current : null;
    });
    const { pullRequest, pushedHead } = journal;
    if (pullRequest === null || pushedHead === null) return;
    const { github } = this.project.dependencies;
    await this.waitFor(`the checks of pull request #${pullRequest.number}`, signal, async () =>
      (await github.checks(pushedHead)).some((check) => check.conclusion === CHECK_PENDING) ? null : true,
    );
    await new MergeOnOrder(this.project.dependencies, headVisibilityPolicy(this.settings.sleeper, signal)).merge({
      pullRequestNumber: pullRequest.number,
      expectedHeadSha: pushedHead,
    });
  }

  private async landOutsideChange(change: StoryOutsideChange): Promise<void> {
    const { forge } = this.project.config;
    if (forge.kind !== 'local') return;
    const clone = join(this.settings.workDirectory, PEOPLE_DIRECTORY, `${this.project.id}-${change.key}`);
    const plain = localOnlyGitEnvironment(buildGitEnvironment(this.installation.environment));
    const author = {
      ...plain,
      GIT_AUTHOR_NAME: change.author.name,
      GIT_AUTHOR_EMAIL: change.author.email,
      GIT_COMMITTER_NAME: change.author.name,
      GIT_COMMITTER_EMAIL: change.author.email,
    };
    const base = this.project.config.baseBranch;
    await this.git(dirname(clone), ['clone', '--quiet', '--branch', base, forge.bareRepositoryPath, clone], plain);
    if (change.branch !== null) await this.git(clone, ['checkout', '--quiet', '-b', change.branch], plain);
    for (const file of change.files) {
      await mkdir(dirname(join(clone, file.path)), { recursive: true });
      await writeFile(join(clone, file.path), file.content);
    }
    await this.git(clone, ['add', '--all'], author);
    await this.git(clone, ['commit', '--quiet', '--message', change.message], author);
    if (change.branch !== null) {
      await this.git(clone, ['checkout', '--quiet', base], plain);
      await this.git(clone, ['merge', '--quiet', '--no-ff', '--message', `Merge branch '${change.branch}'`, change.branch], author);
    }
    await this.git(clone, ['push', '--quiet', 'origin', `${base}:${base}`], plain);
  }

  private async publish(tag: string): Promise<void> {
    const { forge, baseBranch } = this.project.config;
    if (forge.kind !== 'local') return;
    const plain = localOnlyGitEnvironment(buildGitEnvironment(this.installation.environment));
    await this.git(forge.bareRepositoryPath, ['tag', tag, `refs/heads/${baseBranch}`], plain);
    this.settings.log.info(`[${this.project.id}] published ${tag} at the head of ${baseBranch}`);
  }

  private async git(cwd: string, args: readonly string[], environment: Readonly<Record<string, string>>): Promise<void> {
    await mkdir(cwd, { recursive: true });
    const result = await this.settings.runner.run(['git', ...args], cwd, GIT_TIMEOUT_MS, environment);
    if (result.exitCode !== EXIT_CODE_OK || result.timedOut) throw new Error(`git ${args.join(' ')} failed: ${`${result.stdout}${result.stderr}`.trim()}`);
  }

  private async waitFor<T>(what: string, signal: AbortSignal, probe: () => Promise<T | null>): Promise<T> {
    const deadline = Date.now() + (this.settings.stepTimeoutMs ?? STORY_STEP_TIMEOUT_MS);
    for (;;) {
      if (signal.aborted) throw new StoryStepTimedOutError(what);
      const value = await probe();
      if (value !== null) return value;
      if (Date.now() > deadline) throw new StoryStepTimedOutError(what);
      await this.settings.sleeper.sleep(this.settings.pollMs ?? STORY_POLL_MS, signal);
    }
  }
}
