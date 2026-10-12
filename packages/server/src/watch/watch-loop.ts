import type { Clock, Sleeper } from '@agent-factory/application';
import type { Blocker } from './blocker.ts';
import { diffBlockers, type BlockerTransition } from './blocker-transitions.ts';
import type { SnapshotSource } from './snapshot-source.ts';
import { blockersAfter, type Reading } from './watch-readings.ts';
import { DEFAULT_WATCH_SETTINGS, type WatchSettings } from './watch-settings.ts';

/** Where the transitions go: the report's lines, or its JSON objects. */
export interface TransitionSink {
  emit(at: Date, transition: BlockerTransition): void;
}

export interface WatchLoopDependencies {
  readonly source: SnapshotSource;
  readonly clock: Clock;
  readonly sleeper: Sleeper;
  readonly sink: TransitionSink;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Polls the factory and reports only what changed in what blocks work. The first reading is
 * compared with nothing, so every blocker present when the watch starts is reported.
 */
export class WatchLoop {
  private readonly dependencies: WatchLoopDependencies;
  private readonly settings: WatchSettings;
  private blockers: readonly Blocker[] = [];

  constructor(dependencies: WatchLoopDependencies, settings: WatchSettings = DEFAULT_WATCH_SETTINGS) {
    this.dependencies = dependencies;
    this.settings = settings;
  }

  /** Reads once, reports the blockers present, and returns them. */
  async readOnce(signal: AbortSignal): Promise<readonly Blocker[]> {
    await this.poll(signal);
    return this.blockers;
  }

  /** Reads until the signal aborts, one reading per interval. */
  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.poll(signal);
      await this.dependencies.sleeper.sleep(this.settings.intervalMs, signal);
    }
  }

  private async poll(signal: AbortSignal): Promise<void> {
    const reading = await this.read(signal);
    if (reading === null) return;
    const next = blockersAfter(this.blockers, reading, this.settings.thresholds);
    for (const transition of diffBlockers(this.blockers, next)) this.dependencies.sink.emit(reading.at, transition);
    this.blockers = next;
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
