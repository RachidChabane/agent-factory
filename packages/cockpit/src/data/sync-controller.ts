import type { CockpitSnapshot, RunLogLine, RunView, TelemetrySample } from '../contract/index.ts';
import { CockpitSnapshotSchema, RunLogLineSchema, RunLogPageSchema, StreamEventSchema, TelemetrySampleSchema } from '../contract/index.ts';
import type { Clock } from '../model/clock.ts';
import { OFFLINE_AFTER_ATTEMPTS, reconnectDelay } from './backoff.ts';
import { describeZodError, parseJsonMessage } from './parse.ts';
import type { RunLogStore } from './run-log-store.ts';
import { applyRunLogLines } from './run-summary.ts';
import type { MessageChannel } from './state.ts';
import type { CockpitStore } from './store.ts';
import type { CockpitTransport, StreamSubscription } from './transport.ts';

export const RESYNC_DEBOUNCE_MS = 250;
/** How often the snapshot is reloaded while the stream is open, for what the forge changes without telling the factory: checks, deployments, health. */
export const READINGS_RESYNC_MS = 30_000;
export const RUN_LOG_FLUSH_MS = 100;

export interface Timers {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export const browserTimers: Timers = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

export interface SyncDependencies {
  readonly transport: CockpitTransport;
  readonly store: CockpitStore;
  readonly runLogs: RunLogStore;
  readonly clock: Clock;
  readonly random: () => number;
  readonly timers: Timers;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Replaces the runs a telemetry sample reports and keeps the history it does not mention. */
export function upsertRuns(runs: readonly RunView[], sampled: readonly RunView[]): readonly RunView[] {
  if (sampled.length === 0) return runs;
  const sampledById = new Map(sampled.map((run) => [run.id, run]));
  const known = new Set(runs.map((run) => run.id));
  const updated = runs.map((run) => sampledById.get(run.id) ?? run);
  return [...updated, ...sampled.filter((run) => !known.has(run.id))];
}

export function applyTelemetry(snapshot: CockpitSnapshot, sample: TelemetrySample): CockpitSnapshot {
  return { ...snapshot, resources: sample.resources, usage: sample.usage, runs: [...upsertRuns(snapshot.runs, sample.runs)] };
}

/**
 * Keeps the store in step with the factory: the snapshot is loaded once and again after every
 * event or accepted command and at a steady pace while the stream is open, telemetry and run logs
 * are folded in as they stream.
 */
export class SyncController {
  private readonly deps: SyncDependencies;
  private stream: StreamSubscription | null = null;
  private stopped = false;
  private attempt = 0;
  private retryHandle: ReturnType<typeof setTimeout> | null = null;
  private resyncHandle: ReturnType<typeof setTimeout> | null = null;
  private flushHandle: ReturnType<typeof setTimeout> | null = null;
  private readingsHandle: ReturnType<typeof setTimeout> | null = null;
  private loadingSnapshot = false;
  private resyncRequested = false;
  private reconnecting = false;
  private runLogQueue: RunLogLine[] = [];
  private readonly catchUpsInFlight = new Set<string>();
  private readonly catchUpsRequested = new Set<string>();

  constructor(deps: SyncDependencies) {
    this.deps = deps;
  }

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.stream?.close();
    this.stream = null;
    this.stopReadingsClock();
    for (const handle of [this.retryHandle, this.resyncHandle, this.flushHandle]) {
      if (handle !== null) this.deps.timers.clearTimeout(handle);
    }
    this.retryHandle = null;
    this.resyncHandle = null;
    this.flushHandle = null;
  }

  ensureRunLog(runId: string): void {
    if (this.deps.runLogs.isTracked(runId)) return;
    this.deps.runLogs.markLoading(runId);
    void this.catchUpRunLog(runId);
  }

  /** Reloads the snapshot soon; many requests in a burst make one load. */
  requestResync(): void {
    if (this.stopped || this.resyncHandle !== null) return;
    this.resyncHandle = this.deps.timers.setTimeout(() => {
      this.resyncHandle = null;
      void this.resync();
    }, RESYNC_DEBOUNCE_MS);
  }

  /** Reloads the snapshot every `READINGS_RESYNC_MS` while the stream is open. */
  private startReadingsClock(): void {
    this.stopReadingsClock();
    this.readingsHandle = this.deps.timers.setTimeout(() => {
      this.readingsHandle = null;
      this.requestResync();
      this.startReadingsClock();
    }, READINGS_RESYNC_MS);
  }

  private stopReadingsClock(): void {
    if (this.readingsHandle === null) return;
    this.deps.timers.clearTimeout(this.readingsHandle);
    this.readingsHandle = null;
  }

  private async connect(): Promise<void> {
    const loaded = await this.loadSnapshot();
    if (this.stopped) return;
    if (loaded) {
      this.reconnecting = false;
      this.openStream();
    } else {
      this.scheduleReconnect();
    }
  }

  private async resync(): Promise<void> {
    if (this.loadingSnapshot) {
      this.resyncRequested = true;
      return;
    }
    await this.loadSnapshot();
    if (this.resyncRequested) {
      this.resyncRequested = false;
      this.requestResync();
    }
  }

  private async loadSnapshot(): Promise<boolean> {
    this.loadingSnapshot = true;
    try {
      const raw = await this.deps.transport.loadSnapshot();
      const parsed = CockpitSnapshotSchema.safeParse(raw);
      if (!parsed.success) {
        const reason = describeZodError(parsed.error);
        this.reject('snapshot', reason);
        this.deps.store.setLoadError(reason);
        return false;
      }
      this.deps.store.replaceSnapshot(parsed.data);
      return true;
    } catch (error) {
      const reason = describeError(error);
      this.reject('snapshot', reason);
      this.deps.store.setLoadError(reason);
      return false;
    } finally {
      this.loadingSnapshot = false;
    }
  }

  private openStream(): void {
    this.stream?.close();
    const after = this.deps.store.getState().lastSequence;
    this.stream = this.deps.transport.openStream(after, {
      onOpen: () => {
        this.attempt = 0;
        this.deps.store.setConnection({ status: 'live', attempt: 0, nextRetryAt: null, lastMessageAt: this.deps.clock.now() });
        this.startReadingsClock();
        if (this.reconnecting) {
          this.reconnecting = false;
          this.requestResync();
        }
      },
      onFactoryEvent: (data) => this.receiveFactoryEvent(data),
      onRunLog: (data) => this.receiveRunLog(data),
      onTelemetry: (data) => this.receiveTelemetry(data),
      onDisconnect: () => {
        this.stream = null;
        this.stopReadingsClock();
        this.scheduleReconnect();
      },
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = reconnectDelay(this.attempt, this.deps.random);
    this.attempt += 1;
    this.reconnecting = true;
    this.deps.store.setConnection({
      status: this.attempt > OFFLINE_AFTER_ATTEMPTS ? 'offline' : 'reconnecting',
      attempt: this.attempt,
      nextRetryAt: this.deps.clock.now() + delay,
    });
    if (this.retryHandle !== null) this.deps.timers.clearTimeout(this.retryHandle);
    this.retryHandle = this.deps.timers.setTimeout(() => {
      this.retryHandle = null;
      if (this.deps.store.getState().snapshot === null) void this.connect();
      else this.openStream();
    }, delay);
  }

  private receiveFactoryEvent(data: string): void {
    const parsed = parseJsonMessage(data, StreamEventSchema);
    if (!parsed.ok) {
      this.reject('factory', parsed.reason);
      this.requestResync();
      return;
    }
    if (this.deps.store.recordEvent(parsed.value)) this.requestResync();
  }

  private receiveRunLog(data: string): void {
    const parsed = parseJsonMessage(data, RunLogLineSchema);
    if (!parsed.ok) {
      this.reject('run-log', parsed.reason);
      return;
    }
    this.runLogQueue.push(parsed.value);
    if (this.flushHandle === null) {
      this.flushHandle = this.deps.timers.setTimeout(() => {
        this.flushHandle = null;
        this.flushRunLogs();
      }, RUN_LOG_FLUSH_MS);
    }
  }

  flushRunLogs(): void {
    const lines = this.runLogQueue;
    this.runLogQueue = [];
    if (lines.length === 0) return;
    this.deps.store.patchSnapshot((snapshot) => applyRunLogLines(snapshot, lines));
    const byRun = new Map<string, RunLogLine[]>();
    for (const line of lines) {
      if (!this.deps.runLogs.isTracked(line.runId)) continue;
      byRun.set(line.runId, [...(byRun.get(line.runId) ?? []), line]);
    }
    for (const [runId, runLines] of byRun) {
      const result = this.deps.runLogs.append(runId, runLines);
      if (result.gapFrom !== null) void this.catchUpRunLog(runId);
    }
  }

  private receiveTelemetry(data: string): void {
    const parsed = parseJsonMessage(data, TelemetrySampleSchema);
    if (!parsed.ok) {
      this.reject('telemetry', parsed.reason);
      return;
    }
    this.deps.store.patchSnapshot((snapshot) => applyTelemetry(snapshot, parsed.value));
  }

  private async catchUpRunLog(runId: string): Promise<void> {
    if (this.catchUpsInFlight.has(runId)) {
      this.catchUpsRequested.add(runId);
      return;
    }
    this.catchUpsInFlight.add(runId);
    try {
      await this.fetchRunLogPages(runId);
      this.deps.runLogs.markReady(runId);
    } catch (error) {
      const reason = describeError(error);
      this.reject('run-log-page', reason);
      this.deps.runLogs.markError(runId, reason);
    } finally {
      this.catchUpsInFlight.delete(runId);
      if (this.catchUpsRequested.delete(runId)) void this.catchUpRunLog(runId);
    }
  }

  private async fetchRunLogPages(runId: string): Promise<void> {
    for (;;) {
      const nextIndex = this.deps.runLogs.nextIndex(runId);
      const raw = await this.deps.transport.loadRunLog(runId, nextIndex === 0 ? null : nextIndex - 1);
      const parsed = RunLogPageSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`run log page: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
      const lines = parsed.data.lines.toSorted((left, right) => left.index - right.index);
      const result = this.deps.runLogs.append(runId, lines);
      const caughtUp = this.deps.runLogs.nextIndex(runId) >= parsed.data.total;
      if (caughtUp || result.appended === 0) return;
    }
  }

  private reject(channel: MessageChannel, reason: string): void {
    this.deps.store.reject(channel, reason, this.deps.clock.now());
  }
}
