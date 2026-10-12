import { describe, expect, it } from 'vitest';
import type { AgentHarness, AgentRunEvent, AgentRunRequest, AgentRunResult } from '../ports.ts';
import { InMemoryEventStore, runResult } from '../audit/testing/fakes.ts';
import { BudgetExhaustedError, BudgetGovernor } from '../budget/budget-governor.ts';
import { USAGE_READ_EVENT } from '../budget/budget-events.ts';
import { UsageRefresher, type UsageFreshener } from '../budget/usage-refresher.ts';
import { AgentRunAdmission, ResourcesUnavailableError } from '../resources/agent-run-admission.ts';
import { GovernedHarness } from './governed-harness.ts';
import { closeOrphanRuns, ORPHAN_RUN_DETAIL } from './orphan-runs.ts';
import { RecordingHarness } from './recording-harness.ts';
import { RUN_FINISHED_EVENT, RUN_STARTED_EVENT, RunFinishedPayloadSchema, RunStartedPayloadSchema } from './run-events.ts';
import { agentRunRequest, InMemoryRunLogStore, SteppingClock } from './test-support.ts';

const START = new Date('2026-10-10T12:00:00.000Z');
const IN_ONE_HOUR = new Date('2026-10-10T13:00:00.000Z');
const IN_TWO_DAYS = new Date('2026-10-12T12:00:00.000Z');
const THRESHOLDS = { session: 0.9, weekly_all: 0.85, weekly_scoped: 0.85 };
const STALE_AFTER_MS = 30 * 60_000;
const NO_CAP = { kind: 'none' } as const;

class EventfulHarness implements AgentHarness {
  readonly requests: AgentRunRequest[] = [];
  events: readonly AgentRunEvent[] = [];
  result: AgentRunResult | Error = runResult({ runId: 'run-1', sessionId: 'session-1', costUsd: 0.4, turns: 5 });

  run(request: AgentRunRequest, onEvent: (event: AgentRunEvent) => void): Promise<AgentRunResult> {
    this.requests.push(request);
    for (const event of this.events) onEvent(event);
    return this.result instanceof Error ? Promise.reject(this.result) : Promise.resolve(this.result);
  }
}

class CountingFreshener implements UsageFreshener {
  calls = 0;

  ensureFresh(): Promise<void> {
    this.calls += 1;
    return Promise.resolve();
  }
}

function setup(accounts: readonly string[] = [], freeMemoryPercent = 80) {
  const events = new InMemoryEventStore();
  const clock = new SteppingClock(START);
  const logs = new InMemoryRunLogStore(clock);
  const base = new EventfulHarness();
  const governor = new BudgetGovernor(events, clock, { accounts, thresholds: THRESHOLDS, dailyCap: NO_CAP, perRunCapUsd: null, staleAfterMs: STALE_AFTER_MS });
  const admission = new AgentRunAdmission(
    { snapshot: () => Promise.resolve({ freeMemoryPercent, pressure: 'normal' }) },
    { minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal' },
  );
  const freshener = new CountingFreshener();
  const harness = new GovernedHarness(new RecordingHarness(base, events, clock, logs), admission, governor, freshener);
  return { events, clock, logs, base, governor, harness, freshener, admission };
}

const SIGNAL = new AbortController().signal;

describe('recording and governing agent runs', () => {
  it('reads the usage an account has before the run, and starts nothing when it is above a threshold', async () => {
    const { events, clock, logs, base, governor, admission } = setup(['primary']);
    const reads: string[] = [];
    const source = {
      read: (account: string) => {
        reads.push(account);
        return Promise.resolve({
          account,
          source: 'usage-report' as const,
          readAt: clock.now(),
          limits: [{ kind: 'weekly_all' as const, scope: null, utilization: 0.91, resetsAt: IN_TWO_DAYS }],
        });
      },
    };
    const silent = { info: () => undefined, warn: () => undefined };
    const refresher = new UsageRefresher(governor, source, events, clock, silent, { refreshMs: 10 * 60_000 });
    const harness = new GovernedHarness(new RecordingHarness(base, events, clock, logs), admission, governor, refresher);
    await expect(harness.run(agentRunRequest(), () => undefined, SIGNAL)).rejects.toThrow(BudgetExhaustedError);
    expect(reads).toEqual(['primary']);
    expect(base.requests).toEqual([]);
    expect(events.records.filter((record) => record.type === RUN_STARTED_EVENT)).toEqual([]);
  });

  it('asks for fresh usage before every run', async () => {
    const { harness, freshener } = setup();
    await harness.run(agentRunRequest(), () => undefined, SIGNAL);
    await harness.run(agentRunRequest(), () => undefined, SIGNAL);
    expect(freshener.calls).toBe(2);
  });

  it('records the run as started and finished around the harness and logs every event', async () => {
    const { events, logs, base, harness } = setup();
    base.events = [
      { kind: 'session-started', sessionId: 'session-1', model: 'sonnet' },
      { kind: 'assistant-text', text: 'working', parentToolUseId: null },
    ];
    const seen: AgentRunEvent[] = [];
    await harness.run(agentRunRequest(), (event) => seen.push(event), SIGNAL);
    expect(seen).toHaveLength(2);
    const started = RunStartedPayloadSchema.parse(events.records.find((record) => record.type === RUN_STARTED_EVENT)?.payload);
    expect(started).toMatchObject({
      id: 'run-1',
      status: 'running',
      subject: { kind: 'issue', id: '42' },
      branch: 'factory/42-link',
      account: 'default',
      startedAt: START.toISOString(),
      maxTurns: 80,
    });
    const finished = events.records.find((record) => record.type === RUN_FINISHED_EVENT);
    expect(finished?.subject).toBe('run/run-1');
    expect(RunFinishedPayloadSchema.parse(finished?.payload)).toMatchObject({
      status: 'succeeded',
      outcome: 'success',
      costUsd: 0.4,
      turns: 5,
      sessionId: 'session-1',
    });
    expect((await logs.read('run-1', null)).lines.map((line) => line.event.kind)).toEqual(['session-started', 'assistant-text', 'usage']);
    expect((await logs.read('run-1', 1)).lines.map((line) => line.index)).toEqual([2]);
  });

  it('stamps every run with the project it works for', async () => {
    const events = new InMemoryEventStore();
    const clock = new SteppingClock(START);
    const harness = new RecordingHarness(new EventfulHarness(), events, clock, new InMemoryRunLogStore(clock), 'storefront');
    await harness.run(agentRunRequest(), () => undefined, SIGNAL);
    const started = events.records.find((record) => record.type === RUN_STARTED_EVENT);
    expect(RunStartedPayloadSchema.parse(started?.payload).project).toBe('storefront');
  });

  it('records a crashed run as failed and rethrows', async () => {
    const { events, base, harness } = setup();
    base.result = new Error('spawn claude ENOENT');
    await expect(harness.run(agentRunRequest(), () => undefined, SIGNAL)).rejects.toThrow('spawn claude ENOENT');
    const finished = RunFinishedPayloadSchema.parse(events.records.find((record) => record.type === RUN_FINISHED_EVENT)?.payload);
    expect(finished).toMatchObject({ status: 'failed', outcome: 'error', detail: 'spawn claude ENOENT' });
  });

  it('records an aborted run as stopped', async () => {
    const { events, base, harness } = setup();
    base.result = runResult({ outcome: 'aborted' });
    await harness.run(agentRunRequest(), () => undefined, SIGNAL);
    expect(RunFinishedPayloadSchema.parse(events.records.at(-1)?.payload).status).toBe('stopped');
  });

  it('refuses to start without resources and records nothing', async () => {
    const { events, base, harness } = setup([], 10);
    await expect(harness.run(agentRunRequest(), () => undefined, SIGNAL)).rejects.toBeInstanceOf(ResourcesUnavailableError);
    expect(base.requests).toEqual([]);
    expect(events.records).toEqual([]);
  });

  it('runs under the default login without configured accounts and persists the rate limits it observes once', async () => {
    const { events, base, harness, governor } = setup();
    const snapshot = { window: 'five_hour' as const, utilization: 0.5, resetsAt: IN_ONE_HOUR };
    base.events = [
      { kind: 'rate-limit', snapshots: [snapshot] },
      { kind: 'rate-limit', snapshots: [snapshot] },
    ];
    await harness.run(agentRunRequest(), () => undefined, SIGNAL);
    expect(base.requests[0]?.account).toBeNull();
    expect(events.records.filter((record) => record.type === USAGE_READ_EVENT)).toHaveLength(1);
    expect(await governor.usage()).toEqual([
      {
        account: 'default',
        limits: [{ kind: 'session', scope: null, utilization: 0.5, resetsAt: IN_ONE_HOUR, source: 'agent-stream', readAt: START, freshness: 'fresh' }],
      },
    ]);
  });

  it('moves to the next account once the first crosses a threshold, then pauses when every account is spent', async () => {
    const { base, harness, governor } = setup(['primary', 'second']);
    await governor.observe('primary', [{ window: 'seven_day', utilization: 0.86, resetsAt: IN_TWO_DAYS }]);
    await harness.run(agentRunRequest(), () => undefined, SIGNAL);
    expect(base.requests[0]?.account).toBe('second');
    await governor.observe('second', [{ window: 'five_hour', utilization: 0.95, resetsAt: IN_ONE_HOUR }]);
    const refused = harness.run(agentRunRequest({ runId: 'run-2' }), () => undefined, SIGNAL);
    await expect(refused).rejects.toBeInstanceOf(BudgetExhaustedError);
    await expect(refused).rejects.toMatchObject({ resumesAt: IN_ONE_HOUR });
  });

  it('pauses every run once the daily spend reaches the configured cap', async () => {
    const events = new InMemoryEventStore();
    const clock = new SteppingClock(START);
    const capped = new BudgetGovernor(events, clock, { accounts: [], thresholds: THRESHOLDS, dailyCap: { kind: 'usd', amount: 0.5 }, perRunCapUsd: null, staleAfterMs: STALE_AFTER_MS });
    const base = new EventfulHarness();
    const harness = new GovernedHarness(new RecordingHarness(base, events, clock, new InMemoryRunLogStore(clock)), new AgentRunAdmission({ snapshot: () => Promise.resolve({ freeMemoryPercent: 80, pressure: 'normal' }) }, { minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal' }), capped, new CountingFreshener());
    base.result = runResult({ runId: 'run-1', costUsd: 0.6 });
    await harness.run(agentRunRequest(), () => undefined, SIGNAL);
    expect(await capped.spentToday()).toBeCloseTo(0.6);
    expect(await capped.check()).toMatchObject({ kind: 'exhausted', resumesAt: new Date('2026-10-11T00:00:00.000Z') });
    await expect(harness.run(agentRunRequest({ runId: 'run-2' }), () => undefined, SIGNAL)).rejects.toBeInstanceOf(BudgetExhaustedError);
  });

  it('keeps a resumed session on the account that created it', async () => {
    const { base, harness, governor } = setup(['primary', 'second']);
    await governor.observe('primary', [{ window: 'five_hour', utilization: 0.95, resetsAt: IN_ONE_HOUR }]);
    await harness.run(agentRunRequest(), () => undefined, SIGNAL);
    expect(base.requests[0]?.account).toBe('second');
    await governor.observe('primary', [{ window: 'five_hour', utilization: 0.1, resetsAt: IN_ONE_HOUR }]);
    await harness.run(agentRunRequest({ runId: 'run-2', resumeSessionId: 'session-1' }), () => undefined, SIGNAL);
    expect(base.requests[1]?.account).toBe('second');
    await harness.run(agentRunRequest({ runId: 'run-3' }), () => undefined, SIGNAL);
    expect(base.requests[2]?.account).toBe('primary');
  });

  it('caps every run at the per-run budget, and applies a changed cap to the next run', async () => {
    const { base, harness, governor } = setup();
    await harness.run(agentRunRequest({ maxBudgetUsd: 8 }), () => undefined, SIGNAL);
    expect(base.requests[0]?.maxBudgetUsd).toBe(8);
    governor.updateLimits({ thresholds: THRESHOLDS, dailyCap: NO_CAP, perRunCapUsd: 2.5 });
    await harness.run(agentRunRequest({ runId: 'run-2', maxBudgetUsd: 8 }), () => undefined, SIGNAL);
    expect(base.requests[1]?.maxBudgetUsd).toBe(2.5);
    await harness.run(agentRunRequest({ runId: 'run-3', maxBudgetUsd: 1 }), () => undefined, SIGNAL);
    expect(base.requests[2]?.maxBudgetUsd).toBe(1);
  });

  it('applies a changed daily cap and pause threshold without a new governor', async () => {
    const { harness, governor, base } = setup();
    base.result = runResult({ runId: 'run-1', costUsd: 0.6 });
    await harness.run(agentRunRequest(), () => undefined, SIGNAL);
    expect(await governor.check()).toMatchObject({ kind: 'selected' });
    governor.updateLimits({ thresholds: { ...THRESHOLDS, weekly_all: 0.5 }, dailyCap: { kind: 'usd', amount: 0.5 }, perRunCapUsd: null });
    expect(governor.thresholds.weekly_all).toBe(0.5);
    expect(await governor.check()).toMatchObject({ kind: 'exhausted' });
  });

  it('admits runs under the pause pressure level the operator set last', async () => {
    const admission = new AgentRunAdmission(
      { snapshot: () => Promise.resolve({ freeMemoryPercent: 80, pressure: 'warn' }) },
      { minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal' },
    );
    expect((await admission.check()).admitted).toBe(false);
    admission.updatePolicy({ minimumFreeMemoryPercent: 40, pauseAbovePressure: 'warn' });
    expect((await admission.check()).admitted).toBe(true);
  });

  it('closes the runs a stopped factory left open', async () => {
    const { events, clock } = setup();
    const recording = new RecordingHarness(
      { run: () => new Promise<AgentRunResult>(() => undefined) },
      events,
      clock,
      new InMemoryRunLogStore(clock),
    );
    void recording.run(agentRunRequest({ runId: 'run-9' }), () => undefined, SIGNAL);
    await Promise.resolve();
    expect(await closeOrphanRuns(events, clock)).toEqual(['run-9']);
    expect(RunFinishedPayloadSchema.parse(events.records.at(-1)?.payload)).toMatchObject({ status: 'stopped', detail: ORPHAN_RUN_DETAIL });
    expect(await closeOrphanRuns(events, clock)).toEqual([]);
  });
});
