import type { Clock, EventStore, FactoryEventRecord, OperationLog, Sleeper } from '../ports.ts';
import type { InstallationFilms } from './film-lane.ts';
import { SLOTS_FREE, type SchedulingHold } from './scheduling-hold.ts';
import { closeOrphanRuns } from '../runs/orphan-runs.ts';
import { DAEMON_STARTED_EVENT, DAEMON_STOPPED_EVENT, DAEMON_SUBJECT } from './daemon-events.ts';
import {
  CONFIGURATION_CHANGE_EVENTS,
  CONFIGURATION_RELOAD_FAILED_EVENT,
  CONFIGURATION_RELOADED_EVENT,
  ConfigurationReloadedPayloadSchema,
  ConfigurationReloadFailedPayloadSchema,
  SETTINGS_SUBJECT,
} from '../settings/settings-events.ts';
import { activePauses, pauseScheduling, resumeScheduling } from './pause-state.ts';
import type { PauseSet, SchedulingPauses } from './scheduling-pauses.ts';

const FIRST_SEQUENCE = 0;
const NO_PAUSES: PauseSet = new Map();
const STOP_REASON = 'the installation stopped';
export const DRAINED_REASON = 'the installation stopped once its running work finished, as the operator asked';
const DRAIN_CAUSE = 'drain';

/** What an installation needs from the daemon of one project. */
export interface ProjectScheduler {
  readonly projectId: string;
  start(): Promise<void>;
  /** One round of the project's work; `hold` says whether a film holds its slots. */
  tick(signal: AbortSignal, hold: SchedulingHold): Promise<void>;
  stop(): Promise<void>;
  updateConcurrency(concurrency: number): void;
  /** Whether no issue, challenge or audit of the project is running. */
  isIdle(): boolean;
}

export interface InstallationReload {
  readonly restartRequired: readonly string[];
  readonly concurrencyByProject: ReadonlyMap<string, number>;
}

export interface InstallationConfigurationSource {
  reload(): Promise<InstallationReload>;
}

/** Periodic work that belongs to the whole installation, such as refreshing subscription usage. */
export interface InstallationTask {
  readonly name: string;
  run(signal: AbortSignal): Promise<void>;
}

export interface InstallationDaemonDependencies {
  /** The installation's log: runs, settings and the machine pauses live here. */
  readonly events: EventStore;
  readonly clock: Clock;
  readonly sleeper: Sleeper;
  readonly log: OperationLog;
  readonly pauses: SchedulingPauses;
  readonly configuration: InstallationConfigurationSource | null;
  readonly tasks: readonly InstallationTask[];
  readonly projects: readonly ProjectScheduler[];
  /** The films of the projects that film, in one queue; null when no project films. */
  readonly films: InstallationFilms | null;
}

export interface InstallationDaemonSettings {
  readonly pollIntervalMs: number;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}


/** The last change a reload applied or refused; a newer change triggers the next reload. */
function handledThrough(settings: readonly FactoryEventRecord[]): number {
  let handled = -1;
  for (const record of settings) {
    if (record.type === CONFIGURATION_RELOADED_EVENT) handled = Math.max(handled, ConfigurationReloadedPayloadSchema.parse(record.payload).appliedThrough);
    if (record.type === CONFIGURATION_RELOAD_FAILED_EVENT) handled = Math.max(handled, ConfigurationReloadFailedPayloadSchema.parse(record.payload).failedThrough);
  }
  return handled;
}

/**
 * Drives every project of an installation from one loop: closes runs a previous stop left
 * open, starts each project, then at each tick runs the installation's own tasks, applies
 * settings changes, decides the machine pauses once, lets the films take their turn and then
 * lets every project schedule its work, unless a film holds its slots.
 */
export class InstallationDaemon {
  private readonly dependencies: InstallationDaemonDependencies;
  private readonly settings: InstallationDaemonSettings;
  private pausesNow: PauseSet = NO_PAUSES;
  /** Each task's run still going on: a slow read never holds up scheduling, and a task never runs twice at once. */
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(dependencies: InstallationDaemonDependencies, settings: InstallationDaemonSettings) {
    this.dependencies = dependencies;
    this.settings = settings;
  }

  /** The machine pauses decided at the last tick, read by every project's own pause policy. */
  currentPauses(): PauseSet {
    return this.pausesNow;
  }

  project(projectId: string): ProjectScheduler | null {
    return this.dependencies.projects.find((project) => project.projectId === projectId) ?? null;
  }

  async run(signal: AbortSignal): Promise<void> {
    const { events, clock, log, projects, sleeper } = this.dependencies;
    const closed = await closeOrphanRuns(events, clock);
    if (closed.length > 0) log.info(`closed ${closed.length} agent run(s) left open by an earlier stop`);
    if ((await activePauses(events)).has(DRAIN_CAUSE)) await resumeScheduling(events, DRAIN_CAUSE);
    await events.append(DAEMON_STARTED_EVENT, DAEMON_SUBJECT, { projects: projects.map((project) => project.projectId) });
    for (const project of projects) await project.start();
    let drained = false;
    try {
      while (!signal.aborted && !drained) {
        await this.tick(signal);
        drained = this.pausesNow.has(DRAIN_CAUSE) && this.isCalm();
        if (!drained) await sleeper.sleep(this.settings.pollIntervalMs, signal);
      }
    } finally {
      await Promise.allSettled([...projects.map((project) => project.stop()), ...this.inFlight.values(), this.dependencies.films?.settle()]);
      if (drained) await resumeScheduling(events, DRAIN_CAUSE);
      await events.append(DAEMON_STOPPED_EVENT, DAEMON_SUBJECT, { reason: drained ? DRAINED_REASON : STOP_REASON });
    }
  }

  async tick(signal: AbortSignal): Promise<void> {
    const { pauses, projects } = this.dependencies;
    if (!this.pausesNow.has(DRAIN_CAUSE)) this.startTasks(signal);
    await this.guard('reloading the configuration', () => this.applyPendingSettings());
    const refreshed = (await this.guard('deciding the machine pauses', () => pauses.refresh())) ?? this.pausesNow;
    const drain = (await activePauses(this.dependencies.events)).get(DRAIN_CAUSE);
    this.pausesNow = drain === undefined ? refreshed : new Map([...refreshed, [DRAIN_CAUSE, drain]]);
    const hold = await this.filmHold(signal);
    await Promise.all(projects.map((project) => this.guard(`ticking project ${project.projectId}`, () => project.tick(signal, hold))));
  }

  private filmRecording(): boolean {
    return this.dependencies.films?.isRecording() ?? false;
  }

  /** Whether a restart would cut nothing short: no project works, no film records and no task of the installation runs. */
  isCalm(): boolean {
    return this.dependencies.projects.every((project) => project.isIdle()) && this.inFlight.size === 0 && !this.filmRecording();
  }

  /** Lets the films take their turn; the slots they hold are kept from every project. */
  private async filmHold(signal: AbortSignal): Promise<SchedulingHold> {
    const { films, projects } = this.dependencies;
    if (films === null) return SLOTS_FREE;
    const workRunning = projects.some((project) => !project.isIdle());
    return (await this.guard('running the films', () => films.tick({ pauses: this.pausesNow, workRunning }, signal))) ?? SLOTS_FREE;
  }

  /** Starts every task whose previous run has finished, without waiting for it. */
  private startTasks(signal: AbortSignal): void {
    for (const task of this.dependencies.tasks) {
      if (this.inFlight.has(task.name)) continue;
      const running = this.guard(task.name, () => task.run(signal)).then(() => {
        this.inFlight.delete(task.name);
      });
      this.inFlight.set(task.name, running);
    }
  }

  /** Settles once every task started so far has finished its run. */
  async settled(): Promise<void> {
    await Promise.allSettled([...this.inFlight.values()]);
  }

  private async applyPendingSettings(): Promise<void> {
    const { configuration, events, projects, log } = this.dependencies;
    if (configuration === null) return;
    const records = await events.read(SETTINGS_SUBJECT, FIRST_SEQUENCE);
    const settings = records.filter((record) => record.subject === SETTINGS_SUBJECT);
    const changedThrough = settings.findLast((record) => CONFIGURATION_CHANGE_EVENTS.includes(record.type))?.sequence ?? null;
    if (changedThrough === null || handledThrough(settings) >= changedThrough) return;
    let reload: InstallationReload;
    try {
      reload = await configuration.reload();
    } catch (error) {
      await events.append(CONFIGURATION_RELOAD_FAILED_EVENT, SETTINGS_SUBJECT, { failedThrough: changedThrough, reason: message(error) });
      log.warn(`the configuration did not reload: ${message(error)}`);
      return;
    }
    for (const project of projects) {
      const concurrency = reload.concurrencyByProject.get(project.projectId);
      if (concurrency !== undefined) project.updateConcurrency(concurrency);
    }
    const total = [...reload.concurrencyByProject.values()].reduce((sum, value) => sum + value, 0);
    await events.append(CONFIGURATION_RELOADED_EVENT, SETTINGS_SUBJECT, { appliedThrough: changedThrough, concurrency: total, restartRequired: [...reload.restartRequired] });
    log.info(`configuration reloaded through settings change ${changedThrough}`);
  }

  private async guard<T>(what: string, action: () => Promise<T>): Promise<T | null> {
    try {
      return await action();
    } catch (error) {
      this.dependencies.log.warn(`${what} failed: ${message(error)}`);
      return null;
    }
  }
}

/** Asks the running installation to take no new work and to stop once its running work finishes, for a restart. */
export async function requestDrain(events: EventStore, operator: string): Promise<number> {
  return pauseScheduling(events, DRAIN_CAUSE, `${operator} asked the factory to stop once its running work finishes`, null);
}
