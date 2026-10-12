import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CockpitSnapshot, FactoryEventRecord, RunLogLine } from '../contract/index.ts';
import { fixedClock } from '../model/clock.ts';
import { FakeTransport } from '../test/fake-transport.ts';
import { fixtureRunLogs, fixtureSnapshot, TEST_NOW } from '../test/render.tsx';
import { BACKOFF_BASE_MS, OFFLINE_AFTER_ATTEMPTS } from './backoff.ts';
import { RunLogStore } from './run-log-store.ts';
import { CockpitStore } from './store.ts';
import { browserTimers, RESYNC_DEBOUNCE_MS, RUN_LOG_FLUSH_MS, SyncController } from './sync-controller.ts';

const FIXED_JITTER = 0;

function setup(snapshot: CockpitSnapshot | unknown = fixtureSnapshot()) {
  const transport = new FakeTransport(snapshot);
  for (const [runId, page] of fixtureRunLogs()) transport.runLogs.set(runId, page);
  const store = new CockpitStore();
  const runLogs = new RunLogStore();
  const controller = new SyncController({ transport, store, runLogs, clock: fixedClock(TEST_NOW), random: () => FIXED_JITTER, timers: browserTimers });
  return { transport, store, runLogs, controller };
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

function transition(sequence: number, issue: number, from: string, to: string): FactoryEventRecord {
  return {
    sequence,
    occurredAt: new Date(TEST_NOW).toISOString(),
    type: 'issue.transitioned',
    subject: `issue/${issue}`,
    payload: { from, to, reason: 'test' },
  };
}

describe('SyncController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the snapshot then follows the stream after its sequence', async () => {
    const { transport, store, controller } = setup();
    controller.start();
    await flush();
    const snapshot = store.getState().snapshot;
    expect(snapshot?.issues.length).toBeGreaterThan(0);
    expect(transport.openedAfter).toEqual([snapshot?.sequence]);
    transport.handlers?.onOpen();
    expect(store.getState().connection.status).toBe('live');
    controller.stop();
  });

  it('applies a known event and records it in the activity feed', async () => {
    const { transport, store, controller } = setup();
    controller.start();
    await flush();
    const sequence = store.getState().lastSequence;
    transport.emitFactory(transition(sequence + 1, 228, 'spec-validated', 'authoring-checks'));
    const state = store.getState();
    expect(state.lastSequence).toBe(sequence + 1);
    expect(state.snapshot?.issues.find((issue) => issue.number === 228)?.state).toBe('authoring-checks');
    expect(state.activity[0]).toMatchObject({ type: 'issue.transitioned', applied: true });
    controller.stop();
  });

  it('ignores events already contained in the snapshot', async () => {
    const { transport, store, controller } = setup();
    controller.start();
    await flush();
    const sequence = store.getState().lastSequence;
    transport.emitFactory(transition(sequence, 228, 'spec-validated', 'authoring-checks'));
    expect(store.getState().snapshot?.issues.find((issue) => issue.number === 228)?.state).toBe('spec-validated');
    controller.stop();
  });

  it('resynchronises from the snapshot when a sequence gap appears, then replays newer events', async () => {
    const { transport, store, controller } = setup();
    controller.start();
    await flush();
    const sequence = store.getState().lastSequence;
    const advanced = { ...fixtureSnapshot(), sequence: sequence + 2 };
    transport.snapshot = advanced;
    transport.emitFactory(transition(sequence + 3, 228, 'spec-validated', 'authoring-checks'));
    expect(store.getState().lastSequence).toBe(sequence);
    await vi.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
    expect(transport.snapshotLoads).toBe(2);
    expect(store.getState().lastSequence).toBe(sequence + 3);
    expect(store.getState().snapshot?.issues.find((issue) => issue.number === 228)?.state).toBe('authoring-checks');
    controller.stop();
  });

  it('resynchronises when an unknown event type arrives', async () => {
    const { transport, store, controller } = setup();
    controller.start();
    await flush();
    const sequence = store.getState().lastSequence;
    transport.emitFactory({ sequence: sequence + 1, occurredAt: new Date(TEST_NOW).toISOString(), type: 'pipeline.something-new', subject: 'issue/228', payload: {} });
    expect(store.getState().lastSequence).toBe(sequence + 1);
    expect(store.getState().activity[0]).toMatchObject({ applied: false });
    await vi.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
    expect(transport.snapshotLoads).toBe(2);
    controller.stop();
  });

  it('rejects malformed messages without breaking the stream', async () => {
    const { transport, store, controller } = setup();
    controller.start();
    await flush();
    const sequence = store.getState().lastSequence;
    transport.handlers?.onFactoryEvent('{not json');
    transport.emitFactory({ sequence: 'twelve', type: 'issue.transitioned' });
    transport.emitFactory(transition(sequence + 1, 228, 'spec-validated', 'not-a-state'));
    transport.handlers?.onRunLog('{"runId":"run_7f3a2c"}');
    transport.handlers?.onTelemetry('[]');
    const state = store.getState();
    expect(state.rejectedCount).toBe(5);
    expect(state.recentRejections.map((rejection) => rejection.channel)).toEqual(['telemetry', 'run-log', 'factory', 'factory', 'factory']);
    expect(state.snapshot?.issues.find((issue) => issue.number === 228)?.state).toBe('spec-validated');
    const serverSide = fixtureSnapshot();
    transport.snapshot = {
      ...serverSide,
      sequence: sequence + 2,
      issues: serverSide.issues.map((issue) => (issue.number === 228 ? { ...issue, state: 'authoring-checks' } : issue)),
    };
    transport.emitFactory(transition(sequence + 2, 228, 'spec-validated', 'authoring-checks'));
    await vi.advanceTimersByTimeAsync(RESYNC_DEBOUNCE_MS);
    expect(store.getState().lastSequence).toBe(sequence + 2);
    expect(store.getState().snapshot?.issues.find((issue) => issue.number === 228)?.state).toBe('authoring-checks');
    controller.stop();
  });

  it('rejects a snapshot that does not match the contract and retries with backoff', async () => {
    const { transport, store, controller } = setup({ sequence: -1, issues: 'nope' });
    controller.start();
    await flush();
    expect(store.getState().snapshot).toBeNull();
    expect(store.getState().loadError).not.toBeNull();
    expect(store.getState().connection.status).toBe('reconnecting');
    transport.snapshot = fixtureSnapshot();
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(store.getState().snapshot).not.toBeNull();
    expect(store.getState().loadError).toBeNull();
    controller.stop();
  });

  it('reconnects with exponential backoff and resumes after the last applied sequence', async () => {
    const { transport, store, controller } = setup();
    controller.start();
    await flush();
    const sequence = store.getState().lastSequence;
    transport.emitFactory(transition(sequence + 1, 228, 'spec-validated', 'authoring-checks'));
    transport.handlers?.onDisconnect();
    expect(store.getState().connection).toMatchObject({ status: 'reconnecting', attempt: 1 });
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS / 2);
    expect(transport.openedAfter).toEqual([sequence, sequence + 1]);
    for (let attempt = 0; attempt < OFFLINE_AFTER_ATTEMPTS; attempt += 1) transport.handlers?.onDisconnect();
    expect(store.getState().connection.status).toBe('offline');
    controller.stop();
  });

  it('folds run log lines into the run summary and the tracked run buffer', async () => {
    const { transport, store, runLogs, controller } = setup();
    controller.start();
    await flush();
    controller.ensureRunLog('run_7f3a2c');
    await flush();
    const before = runLogs.getView('run_7f3a2c').lineCount;
    const line: RunLogLine = {
      runId: 'run_7f3a2c',
      index: before,
      at: new Date(TEST_NOW).toISOString(),
      event: { kind: 'tool-call', toolUseId: 'live-1', toolName: 'Bash', input: { command: 'pnpm test' }, parentToolUseId: null },
    };
    transport.emitRunLog(line);
    await vi.advanceTimersByTimeAsync(RUN_LOG_FLUSH_MS);
    const run = store.getState().snapshot?.runs.find((entry) => entry.id === 'run_7f3a2c');
    expect(run?.currentTool).toBe('Bash');
    expect(run?.lastLine).toBe('Bash · pnpm test');
    expect(runLogs.getView('run_7f3a2c').lineCount).toBe(before + 1);
    controller.stop();
  });

  it('catches up a tracked run log when a line arrives out of order', async () => {
    const { transport, runLogs, controller } = setup();
    controller.start();
    await flush();
    controller.ensureRunLog('run_7f3a2c');
    await flush();
    const before = runLogs.getView('run_7f3a2c').lineCount;
    const requestsBefore = transport.runLogRequests.length;
    transport.emitRunLog({
      runId: 'run_7f3a2c',
      index: before + 5,
      at: new Date(TEST_NOW).toISOString(),
      event: { kind: 'raw', line: 'late' },
    });
    await vi.advanceTimersByTimeAsync(RUN_LOG_FLUSH_MS);
    expect(before).toBeGreaterThan(0);
    expect(transport.runLogRequests.slice(requestsBefore)).toEqual([{ runId: 'run_7f3a2c', afterIndex: before - 1 }]);
    controller.stop();
  });

  it('applies telemetry samples to the resource and subscription gauges', async () => {
    const { transport, store, controller } = setup();
    controller.start();
    await flush();
    const resetsAt = new Date(TEST_NOW + 3_600_000).toISOString();
    transport.emitTelemetry({
      resources: { freeMemoryPercent: 22, pressure: 'warn', thresholdPercent: 40, schedulingPaused: true, sampledAt: new Date(TEST_NOW).toISOString() },
      subscription: [{ window: 'five_hour', utilization: 0.93, resetsAt }],
    });
    const snapshot = store.getState().snapshot;
    expect(snapshot?.resources).toMatchObject({ freeMemoryPercent: 22, pressure: 'warn', schedulingPaused: true });
    expect(snapshot?.costs.subscription).toEqual([{ window: 'five_hour', utilization: 0.93, resetsAt }]);
    controller.stop();
  });
});
