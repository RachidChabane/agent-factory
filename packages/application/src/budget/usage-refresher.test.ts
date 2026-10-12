import { describe, expect, it } from 'vitest';
import type { UsageReading } from '@agent-factory/domain';
import { InMemoryEventStore } from '../audit/testing/fakes.ts';
import type { UsageReportSource } from '../ports.ts';
import { SteppingClock } from '../runs/test-support.ts';
import { USAGE_READ_EVENT, USAGE_READ_FAILED_EVENT } from './budget-events.ts';
import { BudgetGovernor } from './budget-governor.ts';
import { UsageRefresher } from './usage-refresher.ts';

const START = new Date('2026-03-02T09:00:00.000Z');
const MINUTE_MS = 60_000;
const REFRESH_MS = 10 * MINUTE_MS;
const SIGNAL = new AbortController().signal;

class ScriptedSource implements UsageReportSource {
  readonly reads: string[] = [];
  percent = 0.2;
  failure: Error | null = null;
  private readonly clock: SteppingClock;

  constructor(clock: SteppingClock) {
    this.clock = clock;
  }

  read(account: string): Promise<UsageReading> {
    this.reads.push(account);
    if (this.failure !== null) return Promise.reject(this.failure);
    return Promise.resolve({
      account,
      source: 'usage-report',
      readAt: this.clock.now(),
      limits: [{ kind: 'weekly_all', scope: null, utilization: this.percent, resetsAt: new Date(START.getTime() + 72 * 60 * MINUTE_MS) }],
    });
  }
}

function setup(accounts: readonly string[] = ['primary', 'second']) {
  const events = new InMemoryEventStore();
  const clock = new SteppingClock(START);
  const governor = new BudgetGovernor(events, clock, {
    accounts,
    thresholds: { session: 0.9, weekly_all: 0.85, weekly_scoped: 0.85 },
    dailyCap: { kind: 'none' },
    perRunCapUsd: null,
    staleAfterMs: 30 * MINUTE_MS,
  });
  const source = new ScriptedSource(clock);
  const warnings: string[] = [];
  const refresher = new UsageRefresher(governor, source, events, clock, { info: () => undefined, warn: (line) => warnings.push(line) }, { refreshMs: REFRESH_MS });
  return { events, clock, governor, source, warnings, refresher };
}

describe('UsageRefresher', () => {
  it('reads every account that has never been read, and records the readings', async () => {
    const { events, source, refresher } = setup();
    await refresher.run(SIGNAL);
    expect(source.reads).toEqual(['primary', 'second']);
    expect(events.typesOf('usage/')).toEqual([USAGE_READ_EVENT, USAGE_READ_EVENT]);
  });

  it('waits for the refresh interval before reading a fresh account again', async () => {
    const { clock, source, refresher } = setup(['primary']);
    await refresher.run(SIGNAL);
    clock.set(new Date(START.getTime() + 5 * MINUTE_MS));
    await refresher.run(SIGNAL);
    expect(source.reads).toEqual(['primary']);
    clock.set(new Date(START.getTime() + REFRESH_MS));
    await refresher.run(SIGNAL);
    expect(source.reads).toEqual(['primary', 'primary']);
  });

  it('reads at once on demand and returns the usage it leads to', async () => {
    const { source, refresher } = setup(['primary']);
    source.percent = 0.42;
    const usage = await refresher.refreshNow(SIGNAL);
    expect(usage[0]?.limits.map((limit) => [limit.kind, limit.utilization, limit.source, limit.freshness])).toEqual([['weekly_all', 0.42, 'usage-report', 'fresh']]);
  });

  it('records a failed read with its reason and does not retry before the interval', async () => {
    const { events, source, warnings, refresher } = setup(['primary']);
    source.failure = new Error('claude is not logged in');
    await refresher.run(SIGNAL);
    await refresher.run(SIGNAL);
    expect(source.reads).toEqual(['primary']);
    expect(events.typesOf('usage/')).toEqual([USAGE_READ_FAILED_EVENT]);
    expect(warnings).toEqual(['reading the usage of primary failed: claude is not logged in']);
  });

  it('reads before an agent run only the accounts whose usage is unknown or stale, and not again right after a failed read', async () => {
    const { clock, source, refresher } = setup();
    await refresher.ensureFresh(SIGNAL);
    expect(source.reads).toEqual(['primary', 'second']);
    await refresher.ensureFresh(SIGNAL);
    expect(source.reads).toEqual(['primary', 'second']);
    clock.set(new Date(START.getTime() + 31 * MINUTE_MS));
    source.failure = new Error('not logged in');
    await refresher.ensureFresh(SIGNAL);
    expect(source.reads).toEqual(['primary', 'second', 'primary', 'second']);
    clock.set(new Date(START.getTime() + 32 * MINUTE_MS));
    await refresher.ensureFresh(SIGNAL);
    expect(source.reads).toHaveLength(4);
  });
});
