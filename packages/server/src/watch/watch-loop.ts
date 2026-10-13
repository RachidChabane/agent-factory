import type { Clock, Sleeper } from '@agent-factory/application';
import type { Blocker } from './blocker.ts';
import { diffBlockers, type BlockerTransition } from './blocker-transitions.ts';
import type { BlockerMemory, ReportedBlocker } from './blocker-memory.ts';
import type { SnapshotSource } from './snapshot-source.ts';
import { blockersAfter, type Reading } from './watch-readings.ts';
import { DEFAULT_WATCH_SETTINGS, type WatchSettings } from './watch-settings.ts';

/** Where the transitions go: the report's lines, or its JSON objects. */
export interface TransitionSink {
  emit(at: Date, transition: BlockerTransition): void;
}

export interface WatchLoopDependencies {
  readonly source: SnapshotSource;
  readonly memory: BlockerMemory;
  readonly clock: Clock;
  readonly sleeper: Sleeper;
  readonly sink: TransitionSink;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Polls the factory and reports only what changed in what blocks work. The first reading is compared with what earlier
 * watches reported, which the memory holds, so a watch that restarts repeats nothing and one that finds no memory, or
 * ignores it, reports every blocker present. A watch records what it reported as it goes; a single reading does not.
 */
export class WatchLoop {
  private readonly dependencies: WatchLoopDependencies;
  private readonly settings: WatchSettings;
  private reported: readonly ReportedBlocker[] = [];

  constructor(dependencies: WatchLoopDependencies, settings: WatchSettings = DEFAULT_WATCH_SETTINGS) {
    this.dependencies = dependencies;
    this.settings = settings;
  }

  /** Reads once, reports what changed since the memory, leaves the memory as it was, and returns the blockers present. */
  async readOnce(signal: AbortSignal): Promise<readonly Blocker[]> {
    await this.recall();
    await this.poll(signal, false);
    return this.reported.map(({ blocker }) => blocker);
  }

  /** Reads until the signal aborts, one reading per interval, and records what it reported. */
  async run(signal: AbortSignal): Promise<void> {
    await this.recall();
    while (!signal.aborted) {
      await this.poll(signal, true);
      await this.dependencies.sleeper.sleep(this.settings.intervalMs, signal);
    }
  }

  private async recall(): Promise<void> {
    this.reported = this.settings.ignoresMemory ? [] : await this.dependencies.memory.recall();
  }

  private async poll(signal: AbortSignal, recording: boolean): Promise<void> {
    const reading = await this.read(signal);
    if (reading === null) return;
    const previous = this.reported.map(({ blocker }) => blocker);
    const next = blockersAfter(previous, reading, this.settings.thresholds);
    const transitions = diffBlockers(previous, next);
    for (const transition of transitions) this.dependencies.sink.emit(reading.at, transition);
    this.reported = this.reportedAfter(next, reading.at);
    if (recording && transitions.length > 0) await this.dependencies.memory.remember(this.reported);
  }

  /** The blockers present, each with the time of the reading that first reported it. */
  private reportedAfter(next: readonly Blocker[], at: Date): readonly ReportedBlocker[] {
    const since = new Map(this.reported.map(({ blocker, reportedAt }) => [blocker.key, reportedAt]));
    return next.map((blocker) => ({ blocker, reportedAt: since.get(blocker.key) ?? at }));
  }

  private async read(signal: AbortSignal): Promise<Reading | null> {
    try {
      const snapshot = await this.dependencies.source.read(signal);
      return { kind: 'snapshot', at: new Date(snapshot.generatedAt), snapshot };
    } catch (error) {
      if (signal.aborted) return null;
      return { kind: 'unreachable', at: this.dependencies.clock.now(), reason: reasonOf(error) };
    }
  }
}
