import { describe, expect, it } from 'vitest';
import { InMemoryEventStore } from '../audit/testing/fakes.ts';
import type { AgentRunResult } from '../ports.ts';
import { RecordingHarness } from '../runs/recording-harness.ts';
import { RUN_FINISHED_EVENT, RUN_STARTED_EVENT, runSubject } from '../runs/run-events.ts';
import { agentRunRequest, InMemoryRunLogStore, SteppingClock } from '../runs/test-support.ts';
import { CONFIGURATION_RELOADED_EVENT, SETTINGS_CHANGED_EVENT, SETTINGS_SUBJECT } from '../settings/settings-events.ts';
import { InstallationDaemon, type InstallationReload, type ProjectScheduler } from './installation-daemon.ts';
import type { PauseSet, SchedulingPauses } from './scheduling-pauses.ts';

const START = new Date('2026-03-02T09:00:00.000Z');

class RecordingProject implements ProjectScheduler {
  readonly projectId: string;
  readonly calls: string[] = [];
  concurrency = 1;
  failTick = false;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  start(): Promise<void> {
    this.calls.push('start');
    return Promise.resolve();
  }

  tick(): Promise<void> {
    this.calls.push('tick');
    return this.failTick ? Promise.reject(new Error('forge unreachable')) : Promise.resolve();
  }

  stop(): Promise<void> {
    this.calls.push('stop');
    return Promise.resolve();
  }

  updateConcurrency(concurrency: number): void {
    this.concurrency = concurrency;
  }
}

class FixedPauses implements SchedulingPauses {
  pauses: PauseSet = new Map();

  refresh(): Promise<PauseSet> {
    return Promise.resolve(this.pauses);
  }
}

function setup() {
  const events = new InMemoryEventStore();
  const clock = new SteppingClock(START);
  const shop = new RecordingProject('shop');
  const docs = new RecordingProject('docs');
  const pauses = new FixedPauses();
  const reloads: InstallationReload[] = [];
  const warnings: string[] = [];
  const tasksRun: string[] = [];
  const daemon = new InstallationDaemon(
    {
      events,
      clock,
      sleeper: { sleep: (_milliseconds, signal) => new Promise((resolve) => setTimeout(resolve, signal.aborted ? 0 : 1)) },
      log: { info: () => undefined, warn: (line) => warnings.push(line) },
      pauses,
      configuration: {
        reload: () => {
          const reload = { restartRequired: [], concurrencyByProject: new Map([['shop', 2], ['docs', 1]]) };
          reloads.push(reload);
          return Promise.resolve(reload);
        },
      },
      tasks: [{ name: 'refreshing usage', run: () => Promise.resolve(void tasksRun.push('usage')) }],
      projects: [shop, docs],
    },
    { pollIntervalMs: 1 },
  );
  return { events, clock, shop, docs, pauses, reloads, warnings, tasksRun, daemon };
}

describe('InstallationDaemon', () => {
  it('starts every project, ticks them all, and stops them all when the signal aborts', async () => {
    const { shop, docs, daemon } = setup();
    const controller = new AbortController();
    const running = daemon.run(controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    await running;
    for (const project of [shop, docs]) {
      expect(project.calls[0]).toBe('start');
      expect(project.calls).toContain('tick');
      expect(project.calls.at(-1)).toBe('stop');
    }
  });

  it('closes the runs an earlier stop left open, once for the installation', async () => {
    const { events, clock, daemon } = setup();
    const harness = new RecordingHarness({ run: () => new Promise<AgentRunResult>(() => undefined) }, events, clock, new InMemoryRunLogStore(clock));
    void harness.run(agentRunRequest({ runId: 'r1' }), () => undefined, new AbortController().signal);
    await Promise.resolve();
    const controller = new AbortController();
    controller.abort();
    await daemon.run(controller.signal);
    expect(events.typesOf(runSubject('r1'))).toEqual([RUN_STARTED_EVENT, RUN_FINISHED_EVENT]);
  });

  it('runs its own tasks and decides the machine pauses before the projects tick', async () => {
    const { pauses, tasksRun, daemon } = setup();
    pauses.pauses = new Map([['resources', { reason: 'memory pressure is warn' }]]);
    await daemon.tick(new AbortController().signal);
    expect(tasksRun).toEqual(['usage']);
    expect([...daemon.currentPauses().keys()]).toEqual(['resources']);
  });

  it('applies a settings change once and hands each project its reloaded concurrency', async () => {
    const { events, shop, docs, reloads, daemon } = setup();
    await events.append(SETTINGS_CHANGED_EVENT, SETTINGS_SUBJECT, { change: { kind: 'limits' } });
    await daemon.tick(new AbortController().signal);
    await daemon.tick(new AbortController().signal);
    expect(reloads).toHaveLength(1);
    expect([shop.concurrency, docs.concurrency]).toEqual([2, 1]);
    expect(events.typesOf(SETTINGS_SUBJECT)).toEqual([SETTINGS_CHANGED_EVENT, CONFIGURATION_RELOADED_EVENT]);
  });

  it('keeps ticking the other projects when one of them fails', async () => {
    const { shop, docs, warnings, daemon } = setup();
    shop.failTick = true;
    await daemon.tick(new AbortController().signal);
    expect(docs.calls).toEqual(['tick']);
    expect(warnings).toEqual(['ticking project shop failed: forge unreachable']);
  });

  it('finds a project by its id', () => {
    const { shop, daemon } = setup();
    expect(daemon.project('shop')).toBe(shop);
    expect(daemon.project('billing')).toBeNull();
  });
});
