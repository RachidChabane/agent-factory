import type { Clock, EventStore, OperationLog, Sleeper } from '../ports.ts';
import { closeOrphanRuns } from '../runs/orphan-runs.ts';
import { CONFIGURATION_RELOADED_EVENT, ConfigurationReloadedPayloadSchema, SETTINGS_CHANGED_EVENT, SETTINGS_SUBJECT } from '../settings/settings-events.ts';
import type { PauseSet, SchedulingPauses } from './scheduling-pauses.ts';

const FIRST_SEQUENCE = 0;
const NO_PAUSES: PauseSet = new Map();

/** What an installation needs from the daemon of one project. */
export interface ProjectScheduler {
  readonly projectId: string;
  start(): Promise<void>;
  tick(signal: AbortSignal): Promise<void>;
  stop(): Promise<void>;
  updateConcurrency(concurrency: number): void;
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
}

export interface InstallationDaemonSettings {
  readonly pollIntervalMs: number;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Drives every project of an installation from one loop: closes runs a previous stop left
 * open, starts each project, then at each tick runs the installation's own tasks, applies
 * settings changes, decides the machine pauses once and lets every project schedule its work.
 */
export class InstallationDaemon {
  private readonly dependencies: InstallationDaemonDependencies;
  private readonly settings: InstallationDaemonSettings;
  private pausesNow: PauseSet = NO_PAUSES;

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
    for (const project of projects) await project.start();
    try {
      while (!signal.aborted) {
        await this.tick(signal);
        await sleeper.sleep(this.settings.pollIntervalMs, signal);
      }
    } finally {
      await Promise.allSettled(projects.map((project) => project.stop()));
    }
  }

  async tick(signal: AbortSignal): Promise<void> {
    const { tasks, pauses, projects } = this.dependencies;
    for (const task of tasks) await this.guard(task.name, () => task.run(signal));
    await this.guard('reloading the configuration', () => this.applyPendingSettings());
    this.pausesNow = (await this.guard('deciding the machine pauses', () => pauses.refresh())) ?? this.pausesNow;
    await Promise.all(projects.map((project) => this.guard(`ticking project ${project.projectId}`, () => project.tick(signal))));
  }

  private async applyPendingSettings(): Promise<void> {
    const { configuration, events, projects, log } = this.dependencies;
    if (configuration === null) return;
    const records = await events.read(SETTINGS_SUBJECT, FIRST_SEQUENCE);
    const changedThrough = records.findLast((record) => record.subject === SETTINGS_SUBJECT && record.type === SETTINGS_CHANGED_EVENT)?.sequence ?? null;
    const reloaded = records.findLast((record) => record.subject === SETTINGS_SUBJECT && record.type === CONFIGURATION_RELOADED_EVENT);
    const appliedThrough = reloaded === undefined ? null : ConfigurationReloadedPayloadSchema.parse(reloaded.payload).appliedThrough;
    if (changedThrough === null || (appliedThrough !== null && appliedThrough >= changedThrough)) return;
    const reload = await configuration.reload();
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
