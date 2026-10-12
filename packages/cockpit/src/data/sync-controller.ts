import type { FactoryEventRecord, RunLogLine } from '../contract/index.ts';
import {
  CockpitSnapshotSchema,
  FactoryEventRecordSchema,
  RunLogLineSchema,
  RunLogPageSchema,
  TelemetrySampleSchema,
} from '../contract/index.ts';
import type { Clock } from '../model/clock.ts';
import { OFFLINE_AFTER_ATTEMPTS, reconnectDelay } from './backoff.ts';
import { applyFactoryEvent } from './event-appliers.ts';
import { describeZodError, parseJsonMessage } from './parse.ts';
import { applyRunLogLines } from './run-summary.ts';
import type { RunLogStore } from './run-log-store.ts';
import type { ActivityEntry, MessageChannel } from './state.ts';
import type { CockpitStore } from './store.ts';
import type { CockpitTransport, StreamSubscription } from './transport.ts';

export const RESYNC_DEBOUNCE_MS = 250;
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

function bySequence(left: FactoryEventRecord, right: FactoryEventRecord): number {
  return left.sequence - right.sequence;
}

export class SyncController {
  private readonly deps: SyncDependencies;
  private stream: StreamSubscription | null = null;
  private stopped = false;
  private attempt = 0;
  private retryHandle: ReturnType<typeof setTimeout> | null = null;
  private resyncHandle: ReturnType<typeof setTimeout> | null = null;
  private flushHandle: ReturnType<typeof setTimeout> | null = null;
  private loadingSnapshot = false;
  private resyncRequested = false;
  private pendingEvents: FactoryEventRecord[] = [];
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

  requestResync(): void {
    if (this.stopped || this.resyncHandle !== null) return;
    this.resyncHandle = this.deps.timers.setTimeout(() => {
      this.resyncHandle = null;
      void this.resync();
    }, RESYNC_DEBOUNCE_MS);
  }

  private async connect(): Promise<void> {
    const loaded = await this.loadSnapshot();
    if (this.stopped) return;
    if (loaded) this.openStream();
    else this.scheduleReconnect();
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
      this.replayPendingEvents();
    }
  }

  private openStream(): void {
    this.stream?.close();
    const after = this.deps.store.getState().lastSequence;
    this.stream = this.deps.transport.openStream(after, {
      onOpen: () => {
        this.attempt = 0;
        this.deps.store.setConnection({ status: 'live', attempt: 0, nextRetryAt: null, lastMessageAt: this.deps.clock.now() });
      },
      onFactoryEvent: (data) => this.receiveFactoryEvent(data),
      onRunLog: (data) => this.receiveRunLog(data),
      onTelemetry: (data) => this.receiveTelemetry(data),
      onDisconnect: () => {
        this.stream = null;
        this.scheduleReconnect();
      },
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = reconnectDelay(this.attempt, this.deps.random);
    this.attempt += 1;
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
    const parsed = parseJsonMessage(data, FactoryEventRecordSchema);
    if (!parsed.ok) {
      this.reject('factory', parsed.reason);
      this.requestResync();
      return;
    }
    this.handleRecord(parsed.value);
  }

  private handleRecord(record: FactoryEventRecord): void {
    const state = this.deps.store.getState();
    if (this.loadingSnapshot || state.snapshot === null) {
      this.pendingEvents.push(record);
      return;
    }
    if (record.sequence <= state.lastSequence) return;
    if (record.sequence > state.lastSequence + 1) {
      this.pendingEvents.push(record);
      this.requestResync();
      return;
    }
    const outcome = applyFactoryEvent(state.snapshot, record);
    const entry = (applied: boolean): ActivityEntry => ({
      sequence: record.sequence,
      type: record.type,
      subject: record.subject,
      occurredAt: record.occurredAt,
      applied,
    });
    switch (outcome.kind) {
      case 'applied':
        this.deps.store.updateSnapshot(outcome.snapshot, record.sequence, [entry(true)]);
        return;
      case 'ignored':
        this.deps.store.updateSnapshot(state.snapshot, record.sequence, [entry(true)]);
        return;
      case 'malformed':
        this.reject('factory', outcome.reason);
        this.deps.store.updateSnapshot(state.snapshot, record.sequence, [entry(false)]);
        this.requestResync();
        return;
      case 'resync':
      case 'unknown':
        this.deps.store.updateSnapshot(state.snapshot, record.sequence, [entry(false)]);
        this.requestResync();
        return;
    }
  }

  private replayPendingEvents(): void {
    if (this.pendingEvents.length === 0) return;
    const pending = this.pendingEvents.sort(bySequence);
    this.pendingEvents = [];
    for (const record of pending) this.handleRecord(record);
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
    const state = this.deps.store.getState();
    if (state.snapshot !== null) {
      this.deps.store.updateSnapshot(applyRunLogLines(state.snapshot, lines), state.lastSequence, []);
    }
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
    const state = this.deps.store.getState();
    if (state.snapshot === null) return;
    const snapshot = {
      ...state.snapshot,
      resources: parsed.value.resources,
      costs: { ...state.snapshot.costs, subscription: parsed.value.subscription },
    };
    this.deps.store.updateSnapshot(snapshot, state.lastSequence, []);
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
