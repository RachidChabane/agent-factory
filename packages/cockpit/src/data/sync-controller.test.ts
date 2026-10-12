import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CockpitSnapshot, RunLogLine, TelemetrySample } from '../contract/index.ts';
import { CockpitSnapshotSchema } from '../contract/index.ts';
import { createCockpitServices } from '../app/services.ts';
import { fixedClock } from '../model/clock.ts';
import { FakeTransport } from '../test/fake-transport.ts';
import { emptySnapshot, eventAt, runAt } from '../test/minimal-snapshot.ts';
import { BACKOFF_BASE_MS, OFFLINE_AFTER_ATTEMPTS } from './backoff.ts';
import { RunLogStore } from './run-log-store.ts';
import { CockpitStore } from './store.ts';
import { applyTelemetry, browserTimers, READINGS_RESYNC_MS, RESYNC_DEBOUNCE_MS, RUN_LOG_FLUSH_MS, SyncController, upsertRuns } from './sync-controller.ts';

const NOW = Date.parse('2026-10-12T10:00:00.000Z');
const SEQUENCE = 40;
const FIXED_JITTER = 0;
const LIVE_RUN = 'run_live';
const HISTORY_RUN = 'run_done';

function snapshotWithRuns(): CockpitSnapshot {
  return CockpitSnapshotSchema.parse({
    ...emptySnapshot(NOW, SEQUENCE),
    runs: [runAt(NOW, LIVE_RUN), runAt(NOW, HISTORY_RUN, { status: 'succeeded', outcome: 'success', endedAt: new Date(NOW).toISOString() })],
    activity: [eventAt(NOW, SEQUENCE), eventAt(NOW, SEQUENCE - 1)],
  });
}

function setup(snapshot: unknown = snapshotWithRuns()) {
  const transport = new FakeTransport(snapshot);
  const store = new CockpitStore();
  const runLogs = new RunLogStore();
  const controller = new SyncController({ transport, store, runLogs, clock: fixedClock(NOW), random: () => FIXED_JITTER, timers: browserTimers });
  return { transport, store, runLogs, controller };
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

function telemetryOf(snapshot: CockpitSnapshot, overrides: Partial<TelemetrySample> = {}): TelemetrySample {
  return { resources: snapshot.resources, usage: snapshot.usage, runs: [], ...overrides };
}

describe('SyncController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the snapshot then follows the stream after the highest sequence it holds', async () => {
    const { transport, store, controller } = setup();
    controller.start();
    await flush();
    expect(store.getState().snapshot?.sequence).toBe(SEQUENCE);
    expect(transport.openedAfter).toEqual([SEQUENCE]);
    transport.handlers?.onOpen();
    expect(store.getState().connection.status).toBe('live');
    controller.stop();
  });

  it('adds an event to the activity feed and reloads the snapshot once for a burst of events', async () => {
    const { transport, store, controller } = setup();
    controller.start();
    await flush();
    transport.emitFactory(eventAt(NOW, SEQUENCE + 1));
    transport.emitFactory(eventAt(NOW, SEQUENCE + 2));
    transport.emitFactory(eventAt(NOW, SEQUENCE + 3));
    expect(store.getState().activity.slice(0, 3).map((event) => event.sequence)).toEqual([SEQUENCE + 3, SEQUENCE + 2, SEQUENCE + 1]);
    expect(store.getState().lastSequence).toBe(SEQUENCE + 3);
    expect(transport.snapshotLoads).toBe(1);
    await vi.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
    expect(transport.snapshotLoads).toBe(2);
    controller.stop();
  });

  it('shows the state the reload brings, not what the event announced', async () => {
    const { transport, store, controller } = setup();
    controller.start();
    await flush();
    transport.snapshot = { ...snapshotWithRuns(), sequence: SEQUENCE + 1, installation: { ...snapshotWithRuns().installation, runSlots: { limit: 3, running: 2, queued: 1 } } };
    transport.emitFactory(eventAt(NOW, SEQUENCE + 1));
    await vi.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
    expect(store.getState().snapshot?.installation.runSlots).toEqual({ limit: 3, running: 2, queued: 1 });
    controller.stop();
  });

  it('ignores an event the snapshot feed already holds, without reloading', async () => {
    const { transport, store, controller } = setup();
    controller.start();
    await flush();
    transport.emitFactory(eventAt(NOW, SEQUENCE));
    await vi.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
    expect(transport.snapshotLoads).toBe(1);
    expect(store.getState().activity.filter((event) => event.sequence === SEQUENCE)).toHaveLength(1);
    controller.stop();
  });

  it('rejects malformed messages without breaking the stream', async () => {
    const { transport, store, controller } = setup();
    controller.start();
    await flush();
    transport.handlers?.onFactoryEvent('{not json');
    transport.emitFactory({ sequence: 'twelve', type: 'issue.transitioned' });
    transport.handlers?.onRunLog('{"runId":"run_live"}');
    transport.handlers?.onTelemetry('[]');
    const state = store.getState();
    expect(state.rejectedCount).toBe(4);
    expect(state.recentRejections.map((rejection) => rejection.channel)).toEqual(['telemetry', 'run-log', 'factory', 'factory']);
    transport.emitFactory(eventAt(NOW, SEQUENCE + 1));
    expect(store.getState().lastSequence).toBe(SEQUENCE + 1);
    controller.stop();
  });

  it('rejects a snapshot that does not match the contract and retries with backoff', async () => {
    const { transport, store, controller } = setup({ sequence: -1, projects: 'nope' });
    controller.start();
    await flush();
    expect(store.getState().snapshot).toBeNull();
    expect(store.getState().loadError).not.toBeNull();
    expect(store.getState().connection.status).toBe('reconnecting');
    transport.snapshot = snapshotWithRuns();
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(store.getState().snapshot).not.toBeNull();
    expect(store.getState().loadError).toBeNull();
    controller.stop();
  });

  it('reconnects with exponential backoff, resumes after the last event and reloads once the stream is back', async () => {
    const { transport, store, controller } = setup();
    controller.start();
    await flush();
    transport.emitFactory(eventAt(NOW, SEQUENCE + 1));
    await vi.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
    transport.handlers?.onDisconnect();
    expect(store.getState().connection).toMatchObject({ status: 'reconnecting', attempt: 1 });
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS / 2);
    expect(transport.openedAfter).toEqual([SEQUENCE, SEQUENCE + 1]);
    const loads = transport.snapshotLoads;
    transport.handlers?.onOpen();
    await vi.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
    expect(transport.snapshotLoads).toBe(loads + 1);
    for (let attempt = 0; attempt <= OFFLINE_AFTER_ATTEMPTS; attempt += 1) transport.handlers?.onDisconnect();
    expect(store.getState().connection.status).toBe('offline');
    controller.stop();
  });

  describe('readings that change without an event', () => {
    it('reloads the snapshot at a steady pace while the stream is open, once per period', async () => {
      const { transport, controller } = setup();
      controller.start();
      await flush();
      transport.handlers?.onOpen();
      expect(transport.snapshotLoads).toBe(1);
      await vi.advanceTimersByTimeAsync(READINGS_RESYNC_MS - 1);
      expect(transport.snapshotLoads).toBe(1);
      await vi.advanceTimersByTimeAsync(1 + RESYNC_DEBOUNCE_MS);
      expect(transport.snapshotLoads).toBe(2);
      await vi.advanceTimersByTimeAsync(READINGS_RESYNC_MS);
      expect(transport.snapshotLoads).toBe(3);
      controller.stop();
    });

    it('makes one load of a period tick and an event that arrive together', async () => {
      const { transport, controller } = setup();
      controller.start();
      await flush();
      transport.handlers?.onOpen();
      await vi.advanceTimersByTimeAsync(READINGS_RESYNC_MS);
      transport.emitFactory(eventAt(NOW, SEQUENCE + 1));
      await vi.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
      expect(transport.snapshotLoads).toBe(2);
      controller.stop();
    });

    it('does not reload on a timer before the stream is open or once it is lost', async () => {
      const { transport, controller } = setup();
      controller.start();
      await flush();
      await vi.advanceTimersByTimeAsync(3 * READINGS_RESYNC_MS);
      expect(transport.snapshotLoads).toBe(1);
      transport.handlers?.onOpen();
      transport.handlers?.onDisconnect();
      const loads = transport.snapshotLoads;
      await vi.advanceTimersByTimeAsync(3 * READINGS_RESYNC_MS);
      expect(transport.snapshotLoads).toBe(loads);
      controller.stop();
    });

    it('starts the period again when the stream comes back, without doubling it', async () => {
      const { transport, controller } = setup();
      controller.start();
      await flush();
      transport.handlers?.onOpen();
      transport.handlers?.onDisconnect();
      await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS * 4);
      transport.handlers?.onOpen();
      await vi.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
      const afterReconnect = transport.snapshotLoads;
      await vi.advanceTimersByTimeAsync(READINGS_RESYNC_MS + RESYNC_DEBOUNCE_MS);
      expect(transport.snapshotLoads).toBe(afterReconnect + 1);
      controller.stop();
    });

    it('stops with the controller', async () => {
      const { transport, controller } = setup();
      controller.start();
      await flush();
      transport.handlers?.onOpen();
      controller.stop();
      await vi.advanceTimersByTimeAsync(3 * READINGS_RESYNC_MS);
      expect(transport.snapshotLoads).toBe(1);
    });
  });

  it('updates resources, usage and runs in place from a telemetry sample and keeps the history of runs', async () => {
    const { transport, store, controller } = setup();
    controller.start();
    await flush();
    const snapshot = store.getState().snapshot;
    if (snapshot === null) throw new Error('snapshot not loaded');
    const updated = runAt(NOW, LIVE_RUN, { currentTool: 'Bash', lastLine: 'Bash · pnpm test', turns: 9 });
    const started = runAt(NOW, 'run_started', { role: 'reviewer' });
    transport.emitTelemetry(
      telemetryOf(snapshot, {
        resources: { ...snapshot.resources, sample: { value: { freeMemoryPercent: 22, pressure: 'warn' }, readAt: new Date(NOW).toISOString(), error: null }, schedulingPaused: true },
        runs: [updated, started],
      }),
    );
    const next = store.getState().snapshot;
    expect(next?.resources.sample.value).toEqual({ freeMemoryPercent: 22, pressure: 'warn' });
    expect(next?.resources.schedulingPaused).toBe(true);
    expect(next?.runs.map((run) => run.id)).toEqual([LIVE_RUN, HISTORY_RUN, 'run_started']);
    expect(next?.runs.find((run) => run.id === LIVE_RUN)).toMatchObject({ currentTool: 'Bash', turns: 9 });
    expect(next?.runs.find((run) => run.id === HISTORY_RUN)?.status).toBe('succeeded');
    controller.stop();
  });

  it('folds run log lines into the run summary and the tracked run buffer', async () => {
    const { transport, store, runLogs, controller } = setup();
    controller.start();
    await flush();
    controller.ensureRunLog(LIVE_RUN);
    await flush();
    const before = runLogs.getView(LIVE_RUN).lineCount;
    const line: RunLogLine = {
      runId: LIVE_RUN,
      index: before,
      at: new Date(NOW).toISOString(),
      event: { kind: 'tool-call', toolUseId: 'live-1', toolName: 'Bash', input: { command: 'pnpm test' }, parentToolUseId: null },
    };
    transport.emitRunLog(line);
    await vi.advanceTimersByTimeAsync(RUN_LOG_FLUSH_MS);
    const run = store.getState().snapshot?.runs.find((entry) => entry.id === LIVE_RUN);
    expect(run?.currentTool).toBe('Bash');
    expect(run?.lastLine).toBe('Bash · pnpm test');
    expect(runLogs.getView(LIVE_RUN).lineCount).toBe(before + 1);
    controller.stop();
  });

  it('catches up a tracked run log when a line arrives out of order', async () => {
    const { transport, runLogs, controller } = setup();
    transport.runLogs.set(LIVE_RUN, {
      runId: LIVE_RUN,
      total: 2,
      lines: [0, 1].map((index) => ({ runId: LIVE_RUN, index, at: new Date(NOW).toISOString(), event: { kind: 'raw', line: `line ${index}` } })),
    });
    controller.start();
    await flush();
    controller.ensureRunLog(LIVE_RUN);
    await flush();
    const before = runLogs.getView(LIVE_RUN).lineCount;
    expect(before).toBe(2);
    const requestsBefore = transport.runLogRequests.length;
    transport.emitRunLog({ runId: LIVE_RUN, index: before + 5, at: new Date(NOW).toISOString(), event: { kind: 'raw', line: 'late' } });
    await vi.advanceTimersByTimeAsync(RUN_LOG_FLUSH_MS);
    expect(transport.runLogRequests.slice(requestsBefore)).toEqual([{ runId: LIVE_RUN, afterIndex: before - 1 }]);
    controller.stop();
  });

  it('reloads the snapshot after the factory accepted a command', async () => {
    const transport = new FakeTransport(snapshotWithRuns());
    const services = createCockpitServices({ transport, clock: fixedClock(NOW), random: () => FIXED_JITTER });
    services.start();
    await flush();
    await services.commands.send('usage.refresh', {});
    expect(transport.snapshotLoads).toBe(1);
    await vi.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
    expect(transport.snapshotLoads).toBe(2);
    services.stop();
  });
});

describe('telemetry folding', () => {
  it('replaces the runs a sample mentions and keeps every other run', () => {
    const runs = [runAt(NOW, 'a'), runAt(NOW, 'b')];
    const merged = upsertRuns(runs, [runAt(NOW, 'b', { turns: 3 }), runAt(NOW, 'c')]);
    expect(merged.map((run) => `${run.id}:${run.turns}`)).toEqual(['a:0', 'b:3', 'c:0']);
  });

  it('keeps the very same list when the sample mentions no run', () => {
    const runs = [runAt(NOW, 'a')];
    expect(upsertRuns(runs, [])).toBe(runs);
    const snapshot = emptySnapshot(NOW);
    expect(applyTelemetry(snapshot, telemetryOf(snapshot)).runs).toEqual([]);
  });
});
