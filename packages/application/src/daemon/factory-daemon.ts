import { OPEN_AUDIT_STATES, UNRESOLVED_VERDICT_STATES } from '@agent-factory/domain';
import type { IssueState } from '@agent-factory/domain';
import { loadAudit, loadAudits } from '../audit/audit-projection.ts';
import type { AuditOutcome } from '../audit/audit-merge.ts';
import { attributionRules, type ProjectConventions } from '../conventions/project-conventions.ts';
import { scanNewMerges, seedMergeCursor } from '../audit/watch-merges.ts';
import { BudgetExhaustedError } from '../budget/budget-governor.ts';
import { NOTICES, type OperatorNotifications } from '../notifications/operator-notifications.ts';
import { issueStates } from '../pipeline/pipeline-capacity.ts';
import { PipelineAbortedError } from '../pipeline/pipeline-errors.ts';
import { loadJournal } from '../pipeline/pipeline-journal.ts';
import { FilmRefusedError } from '../film/film-errors.ts';
import type { FilmOrder } from '../film/film-order.ts';
import type { FilmRunner } from '../film/film-runner.ts';
import { closeOrphanFilms } from '../film/orphan-films.ts';
import { recordExternalMerge } from '../pipeline/record-external-merge.ts';
import type { RunIssueOutcome } from '../pipeline/run-issue-outcome.ts';
import type { Clock, EventStore, GitHubGateway, IssueRecord, IssueStateStore, OperationLog, Sleeper, WorktreePool } from '../ports.ts';
import type { ReleaseDescriptor, ReleaseEvaluation } from '../release/evaluate-release.ts';
import { watchReleases, type ReleaseModel } from '../release/release-watch.ts';
import { ResourcesUnavailableError } from '../resources/agent-run-admission.ts';
import { closeOrphanRuns } from '../runs/orphan-runs.ts';
import { pendingChallenges } from '../requests/challenge-queue.ts';
import {
  CONFIGURATION_RELOADED_EVENT,
  ConfigurationReloadedPayloadSchema,
  SETTINGS_CHANGED_EVENT,
  SETTINGS_SUBJECT,
  type ConfigurationReloadedPayload,
} from '../settings/settings-events.ts';
import type { ChallengeOutcome } from '../requests/challenge-request.ts';
import { DAEMON_STARTED_EVENT, DAEMON_STOPPED_EVENT, DAEMON_SUBJECT } from './daemon-events.ts';
import { heldWorktrees } from './held-worktrees.ts';
import { pausedIssues } from './issue-pause.ts';
import { decideScheduling, type SchedulingDecision } from './issue-scheduling.ts';
import { SLOTS_FREE, type SchedulingHold } from './scheduling-hold.ts';
import type { PauseSet, SchedulingPauses } from './scheduling-pauses.ts';

export const MAX_AUDIT_ATTEMPTS = 3;
export const DEFAULT_RETRY_DELAY_MS = 5 * 60_000;
const CLOSED_ISSUE_STATE = 'closed';
const FIRST_SEQUENCE = 0;
const CLOSED: IssueState = 'closed';
const UNKNOWN_OPEN: IssueState = 'spec-draft';
const STOP_REASON = 'the operator stopped the factory';

export interface IssueDriver {
  runIssue(issueNumber: number): Promise<RunIssueOutcome>;
}

export interface AuditRunner {
  audit(auditId: string, signal: AbortSignal): Promise<AuditOutcome>;
}

export interface RequestChallenger {
  challenge(requestId: string, signal: AbortSignal): Promise<ChallengeOutcome>;
}

export interface ReleaseEvaluator {
  evaluate(release: ReleaseDescriptor): Promise<ReleaseEvaluation>;
}

export interface ReloadedConfiguration {
  readonly concurrency: number;
  readonly restartRequired: readonly string[];
}

export interface ConfigurationSource {
  reload(): Promise<ReloadedConfiguration>;
}

export interface DaemonDependencies {
  readonly events: EventStore;
  readonly states: IssueStateStore;
  readonly github: GitHubGateway;
  readonly pool: WorktreePool;
  readonly clock: Clock;
  readonly sleeper: Sleeper;
  readonly pauses: SchedulingPauses;
  readonly notifications: OperatorNotifications;
  readonly log: OperationLog;
  readonly pipelines: (signal: AbortSignal) => IssueDriver;
  readonly audits: AuditRunner | null;
  readonly challenges: RequestChallenger | null;
  /** The films of the project; their queue is the installation's. Null when the project films nothing. */
  readonly films: FilmRunner | null;
  readonly releases: ReleaseEvaluator;
  readonly configuration: ConfigurationSource | null;
  /** Stops the stacks an earlier factory left running; says how many it stopped. */
  readonly reclaimStacks: () => Promise<number>;
}

export interface DaemonSettings {
  readonly concurrency: number;
  readonly poolSize: number;
  readonly baseBranch: string;
  /** The project's labels, branch prefix and other automations. */
  readonly conventions: ProjectConventions;
  readonly releaseModel: ReleaseModel;
  readonly pollIntervalMs: number;
  readonly mergeWatchIntervalMs: number;
  readonly issueRefreshMs: number;
  readonly retryDelayMs: number;
}

interface Drive {
  readonly task: Promise<void>;
  readonly controller: AbortController;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class FactoryDaemon {
  private readonly dependencies: DaemonDependencies;
  private readonly settings: DaemonSettings;
  private readonly running = new Map<number, Drive>();
  private readonly deferredUntil = new Map<number, number>();
  private backgroundTask: Promise<void> | null = null;
  private backgroundController: AbortController | null = null;
  private lastWatchAt: number | null = null;
  private validated: { readonly at: number; readonly issues: readonly IssueRecord[] } | null = null;
  private concurrency: number;
  private reloading: Promise<void> = Promise.resolve();

  constructor(dependencies: DaemonDependencies, settings: DaemonSettings) {
    this.dependencies = dependencies;
    this.settings = settings;
    this.concurrency = settings.concurrency;
  }

  get concurrentIssues(): number {
    return this.concurrency;
  }

  /** Applies a concurrency reloaded by the installation; running issues keep running. */
  updateConcurrency(concurrency: number): void {
    this.concurrency = concurrency;
  }

  reloadConfiguration(): Promise<void> {
    const next = this.reloading.then(() => this.applyPendingSettings());
    this.reloading = next.catch(() => undefined);
    return next;
  }

  private async applyPendingSettings(): Promise<void> {
    const { configuration, events } = this.dependencies;
    if (configuration === null) return;
    const records = await events.read(SETTINGS_SUBJECT, FIRST_SEQUENCE);
    const changedThrough = records.findLast((record) => record.subject === SETTINGS_SUBJECT && record.type === SETTINGS_CHANGED_EVENT)?.sequence ?? null;
    const reloaded = records.findLast((record) => record.subject === SETTINGS_SUBJECT && record.type === CONFIGURATION_RELOADED_EVENT);
    const appliedThrough = reloaded === undefined ? null : ConfigurationReloadedPayloadSchema.parse(reloaded.payload).appliedThrough;
    if (changedThrough === null || (appliedThrough !== null && appliedThrough >= changedThrough)) return;
    const configurationNow = await configuration.reload();
    this.concurrency = configurationNow.concurrency;
    const payload: ConfigurationReloadedPayload = {
      appliedThrough: changedThrough,
      concurrency: configurationNow.concurrency,
      restartRequired: [...configurationNow.restartRequired],
    };
    await events.append(CONFIGURATION_RELOADED_EVENT, SETTINGS_SUBJECT, payload);
    this.dependencies.log.info(`configuration reloaded through settings change ${changedThrough}`);
  }

  /** Whether nothing of the project runs: no issue, and no challenge or audit in the background. */
  isIdle(): boolean {
    return this.running.size === 0 && this.backgroundTask === null;
  }

  runningIssues(): readonly number[] {
    return [...this.running.keys()].sort((a, b) => a - b);
  }

  stopIssue(issueNumber: number): boolean {
    const drive = this.running.get(issueNumber);
    drive?.controller.abort();
    return drive !== undefined;
  }

  stopBackground(): boolean {
    const controller = this.backgroundController;
    controller?.abort();
    return controller !== null;
  }

  private startBackground(work: (signal: AbortSignal) => Promise<void>, daemonSignal: AbortSignal): void {
    const controller = new AbortController();
    this.backgroundController = controller;
    this.backgroundTask = work(AbortSignal.any([daemonSignal, controller.signal])).finally(() => {
      this.backgroundTask = null;
      this.backgroundController = null;
    });
  }

  /** Runs this daemon alone: closes orphan runs, starts, ticks until the signal aborts, then stops. */
  async run(signal: AbortSignal): Promise<void> {
    const { events, clock, log } = this.dependencies;
    const closed = await closeOrphanRuns(events, clock);
    if (closed.length > 0) log.info(`closed ${closed.length} agent run(s) left open by an earlier stop`);
    await this.start();
    try {
      while (!signal.aborted) {
        await this.tick(signal);
        await this.dependencies.sleeper.sleep(this.settings.pollIntervalMs, signal);
      }
    } finally {
      await this.stop();
    }
  }

  /** Orders a film of a pull request of the project; the installation's queue records it. */
  async orderFilm(order: FilmOrder): Promise<void> {
    const { films } = this.dependencies;
    if (films === null) throw new FilmRefusedError(order.issueNumber, 'films are not configured; add evidence.films to the project');
    await films.order(order);
  }

  /** Fails the films a stopped factory left recording and renders the placeholders of the queued ones again. */
  private async recoverFilms(): Promise<void> {
    const { events, films, log } = this.dependencies;
    const closed = await closeOrphanFilms(events);
    if (closed.length > 0) log.info(`closed the film of ${closed.map((number) => `issue #${number}`).join(', ')} left open by an earlier stop`);
    if (films === null) return;
    const refresh = await films.refreshBodies();
    for (const failure of refresh.failed) log.warn(`the film placeholder of issue #${failure.issueNumber} could not be refreshed: ${failure.reason}`);
  }

  /** Seeds the merge watcher and records the start; an installation calls it once per project. */
  async start(): Promise<void> {
    const { events, github, log } = this.dependencies;
    const reclaimed = await this.dependencies.reclaimStacks();
    if (reclaimed > 0) log.warn(`stopped ${reclaimed} stack(s) an earlier factory left running`);
    await this.guard('recovering the films', () => this.recoverFilms());
    await seedMergeCursor({ events, github }, this.settings.baseBranch);
    await events.append(DAEMON_STARTED_EVENT, DAEMON_SUBJECT, { concurrency: this.concurrency, poolSize: this.settings.poolSize });
  }

  /** Waits for the running work to settle and records the stop. */
  async stop(): Promise<void> {
    await this.settle();
    await this.dependencies.events.append(DAEMON_STOPPED_EVENT, DAEMON_SUBJECT, { reason: STOP_REASON });
  }

  /** One round of the project's work; `hold` says whether a film of the installation holds its slots. */
  async tick(signal: AbortSignal, hold: SchedulingHold = SLOTS_FREE): Promise<void> {
    await this.guard('reloading the configuration', () => this.reloadConfiguration());
    await this.guard('watching merges and releases', () => this.watch());
    const pauses = await this.refreshPauses();
    await this.guard('pausing issues', () => this.stopPausedIssues());
    if (pauses.size > 0 || signal.aborted) return;
    const decision = await this.guard('scheduling issues', () => this.schedule(signal, hold));
    if (decision === null || hold.slotsHeld) return;
    const idle = decision.resume.length + decision.start.length + decision.waiting.length === 0;
    if (!idle) return;
    const challenging = await this.guard('starting a request challenge', () => this.maybeChallenge(signal));
    if (challenging === false) await this.guard('starting an audit', () => this.maybeAudit(signal));
  }

  async settle(): Promise<void> {
    await Promise.allSettled([...[...this.running.values()].map((drive) => drive.task), this.backgroundTask ?? Promise.resolve()]);
  }

  private async guard<T>(what: string, action: () => Promise<T>): Promise<T | null> {
    try {
      return await action();
    } catch (error) {
      this.dependencies.log.warn(`${what} failed: ${message(error)}`);
      await this.dependencies.notifications.send(NOTICES.failed(what, message(error)));
      return null;
    }
  }

  private async watch(): Promise<void> {
    const { events, github, clock, log, releases, notifications } = this.dependencies;
    const now = clock.now().getTime();
    if (this.lastWatchAt !== null && now - this.lastWatchAt < this.settings.mergeWatchIntervalMs) return;
    this.lastWatchAt = now;
    const scan = await scanNewMerges({ events, github }, { branch: this.settings.baseBranch, startSha: null, rules: attributionRules(this.settings.conventions) });
    for (const merge of scan.factoryMerges) {
      const recorded = await recordExternalMerge(this.dependencies, merge.pullRequestNumber, merge.sha);
      if (recorded !== null) log.info(`issue #${recorded.issueNumber} merged through pull request #${recorded.pullRequestNumber}`);
    }
    for (const auditId of scan.detectedAuditIds) log.info(`change ${auditId} reached ${this.settings.baseBranch} outside the factory; audit queued`);
    for (const detected of await watchReleases({ events, github }, this.settings.baseBranch, this.settings.releaseModel)) {
      if (detected.detection.supersededBy !== null) {
        log.info(`release ${detected.descriptor.releaseId} is superseded by ${detected.detection.supersededBy}; it is not evaluated`);
        continue;
      }
      const evaluation = await releases.evaluate(detected.descriptor);
      await notifications.send(NOTICES.releaseGate(detected.descriptor.releaseId, evaluation.promotable, evaluation.blockingReasons));
    }
  }

  private refreshPauses(): Promise<PauseSet> {
    return this.dependencies.pauses.refresh();
  }

  private async stopPausedIssues(): Promise<void> {
    const paused = await pausedIssues(this.dependencies.events);
    for (const [issueNumber, drive] of this.running) {
      if (paused.has(issueNumber)) drive.controller.abort();
    }
  }

  private async schedule(signal: AbortSignal, hold: SchedulingHold): Promise<SchedulingDecision> {
    const { events, clock, log } = this.dependencies;
    const now = clock.now().getTime();
    for (const [issueNumber, until] of this.deferredUntil) {
      if (until <= now) this.deferredUntil.delete(issueNumber);
    }
    const states = await issueStates(events);
    const validated = await this.validatedIssues(now);
    const paused = await pausedIssues(events);
    const decision = decideScheduling(
      {
        validated: validated.map((issue) => ({ number: issue.number, blockedBy: issue.blockedBy })),
        states,
        dependencyStates: await this.dependencyStates(validated, states),
        inProcess: new Set(this.running.keys()),
        deferred: new Set([...this.deferredUntil.keys(), ...paused]),
        heldWorktrees: await heldWorktrees(events),
        busySlots: hold.slotsHeld ? this.concurrency : this.running.size + (this.backgroundTask === null ? 0 : 1),
      },
      { concurrency: this.concurrency, poolSize: this.settings.poolSize },
    );
    for (const cycle of decision.cycles) log.warn(`issues ${cycle.map((number) => `#${number}`).join(', ')} depend on each other`);
    for (const issueNumber of [...decision.resume, ...decision.start]) this.launch(issueNumber, signal);
    return decision;
  }

  private async validatedIssues(now: number): Promise<readonly IssueRecord[]> {
    if (this.validated !== null && now - this.validated.at < this.settings.issueRefreshMs) return this.validated.issues;
    const issues = await this.dependencies.github.listIssues(this.settings.conventions.labels.validated);
    this.validated = { at: now, issues };
    return issues;
  }

  private async dependencyStates(validated: readonly IssueRecord[], states: ReadonlyMap<number, IssueState>): Promise<ReadonlyMap<number, IssueState>> {
    const listed = new Set(validated.map((issue) => issue.number));
    const unknown = [...new Set(validated.flatMap((issue) => issue.blockedBy))].filter((number) => !listed.has(number) && !states.has(number));
    const found = await Promise.all(unknown.map((number) => this.dependencies.github.getIssue(number)));
    return new Map(found.map((issue) => [issue.number, issue.state === CLOSED_ISSUE_STATE ? CLOSED : UNKNOWN_OPEN]));
  }

  private launch(issueNumber: number, daemonSignal: AbortSignal): void {
    const controller = new AbortController();
    const signal = AbortSignal.any([daemonSignal, controller.signal]);
    const driver = this.dependencies.pipelines(signal);
    const task = this.drive(issueNumber, driver, signal).finally(() => {
      this.running.delete(issueNumber);
      this.validated = null;
    });
    this.running.set(issueNumber, { task, controller });
  }

  private async drive(issueNumber: number, driver: IssueDriver, signal: AbortSignal): Promise<void> {
    try {
      await this.report(await driver.runIssue(issueNumber));
    } catch (error) {
      await this.recover(issueNumber, error, signal);
    }
  }

  private async report(outcome: RunIssueOutcome): Promise<void> {
    const { notifications, events } = this.dependencies;
    switch (outcome.kind) {
      case 'pr-open': {
        const journal = await loadJournal(events, outcome.issueNumber);
        const evidenceComplete = journal.evidence?.bundle.missing.length === 0;
        await notifications.send(
          journal.feedback.length > 0
            ? NOTICES.pullRequestUpdated(outcome.issueNumber, outcome.pullRequest.number)
            : NOTICES.pullRequestOpened(outcome.issueNumber, outcome.pullRequest, evidenceComplete),
        );
        return;
      }
      case 'needs-human':
        await notifications.send(NOTICES.needsHuman(outcome.issueNumber, outcome.reason));
        return;
      case 'blocked':
        this.defer(outcome.issueNumber, this.settings.retryDelayMs);
        return;
      case 'beyond-pipeline':
        return;
    }
  }

  private async recover(issueNumber: number, error: unknown, signal: AbortSignal): Promise<void> {
    const { log, notifications, clock } = this.dependencies;
    if (signal.aborted || error instanceof PipelineAbortedError) {
      log.info(`issue #${issueNumber} stopped; it resumes from its last recorded step`);
      return;
    }
    if (error instanceof ResourcesUnavailableError) {
      log.info(`issue #${issueNumber} waits for resources: ${error.reason}`);
      return;
    }
    if (error instanceof BudgetExhaustedError) {
      this.defer(issueNumber, Math.max(0, error.resumesAt.getTime() - clock.now().getTime()));
      log.info(`issue #${issueNumber} waits for its subscription account: ${error.reason}`);
      return;
    }
    this.defer(issueNumber, this.settings.retryDelayMs);
    log.warn(`issue #${issueNumber} failed: ${message(error)}`);
    await notifications.send(NOTICES.failed(`issue #${issueNumber}`, message(error)));
  }

  private defer(issueNumber: number, delayMs: number): void {
    this.deferredUntil.set(issueNumber, this.dependencies.clock.now().getTime() + delayMs);
  }

  private async maybeChallenge(signal: AbortSignal): Promise<boolean> {
    const { challenges, events } = this.dependencies;
    if (challenges === null || this.backgroundTask !== null || this.running.size >= this.concurrency) return this.backgroundTask !== null;
    const next = (await pendingChallenges(events))[0];
    if (next === undefined) return false;
    this.startBackground((background) => this.challenge(challenges, next, background), signal);
    return true;
  }

  private async challenge(challenges: RequestChallenger, requestId: string, signal: AbortSignal): Promise<void> {
    const { notifications, log } = this.dependencies;
    try {
      const outcome = await challenges.challenge(requestId, signal);
      await notifications.send(
        outcome.status === 'challenged'
          ? NOTICES.requestChallenged(requestId, outcome.specPaths.length)
          : NOTICES.failed(`challenge of ${requestId}`, outcome.reason),
      );
    } catch (error) {
      if (!signal.aborted) log.warn(`challenge of ${requestId} failed: ${message(error)}`);
    }
  }

  private async maybeAudit(signal: AbortSignal): Promise<void> {
    const { audits, events } = this.dependencies;
    if (audits === null || this.backgroundTask !== null || this.running.size >= this.concurrency) return;
    const pending = (await loadAudits(events)).filter(
      (audit) => OPEN_AUDIT_STATES.includes(audit.state) && audit.failureCount < MAX_AUDIT_ATTEMPTS,
    );
    const next = pending[0];
    if (next === undefined) return;
    this.startBackground((background) => this.audit(audits, next.id, background), signal);
  }

  private async audit(audits: AuditRunner, auditId: string, signal: AbortSignal): Promise<void> {
    const { events, notifications, log } = this.dependencies;
    try {
      const outcome = await audits.audit(auditId, signal);
      const audit = await loadAudit(events, auditId);
      if (outcome.status === 'concluded' && audit !== null && UNRESOLVED_VERDICT_STATES.includes(audit.state)) {
        await notifications.send(NOTICES.auditConcluded(auditId, outcome.verdict, audit.conclusion?.summary ?? ''));
      }
      if (outcome.status === 'failed') {
        log.warn(`audit of ${auditId} failed: ${outcome.reason}`);
        if ((audit?.failureCount ?? 0) >= MAX_AUDIT_ATTEMPTS) await notifications.send(NOTICES.failed(`audit of ${auditId}`, outcome.reason));
      }
    } catch (error) {
      if (!signal.aborted) log.warn(`audit of ${auditId} failed: ${message(error)}`);
    }
  }
}

