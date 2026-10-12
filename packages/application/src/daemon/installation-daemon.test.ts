import { describe, expect, it } from 'vitest';
import { InMemoryEventStore } from '../audit/testing/fakes.ts';
import type { AgentRunResult } from '../ports.ts';
import { RecordingHarness } from '../runs/recording-harness.ts';
import { RUN_FINISHED_EVENT, RUN_STARTED_EVENT, runSubject } from '../runs/run-events.ts';
import { agentRunRequest, InMemoryRunLogStore, SteppingClock } from '../runs/test-support.ts';
import { CONFIGURATION_EDITED_EVENT, CONFIGURATION_RELOAD_FAILED_EVENT, CONFIGURATION_RELOADED_EVENT, SETTINGS_CHANGED_EVENT, SETTINGS_SUBJECT } from '../settings/settings-events.ts';
import { DAEMON_STARTED_EVENT, DAEMON_STOPPED_EVENT, DAEMON_SUBJECT, SCHEDULER_RESUMED_EVENT } from './daemon-events.ts';
import { InstallationDaemon, requestDrain, type InstallationReload, type InstallationTask, type ProjectScheduler } from './installation-daemon.ts';
import { activePauses } from './pause-state.ts';
import type { FilmTick, InstallationFilms } from './film-lane.ts';
import { SLOTS_FREE, SLOTS_HELD, type SchedulingHold } from './scheduling-hold.ts';
import type { PauseSet, SchedulingPauses } from './scheduling-pauses.ts';

const START = new Date('2026-03-02T09:00:00.000Z');

class RecordingProject implements ProjectScheduler {
  readonly projectId: string;
  readonly calls: string[] = [];
  concurrency = 1;
  failTick = false;
  busy = false;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  start(): Promise<void> {
    this.calls.push('start');
    return Promise.resolve();
  }

  readonly holds: boolean[] = [];

  tick(_signal: AbortSignal, hold: SchedulingHold): Promise<void> {
    this.calls.push('tick');
    this.holds.push(hold.slotsHeld);
    return this.failTick ? Promise.reject(new Error('forge unreachable')) : Promise.resolve();
  }

  stop(): Promise<void> {
    this.calls.push('stop');
    return Promise.resolve();
  }

  updateConcurrency(concurrency: number): void {
    this.concurrency = concurrency;
  }

  isIdle(): boolean {
    return !this.busy;
  }
}

class FixedPauses implements SchedulingPauses {
  pauses: PauseSet = new Map();

  refresh(): Promise<PauseSet> {
    return Promise.resolve(this.pauses);
  }
}

function setup(extraTasks: readonly InstallationTask[] = [], films: InstallationFilms | null = null) {
  const events = new InMemoryEventStore();
  const clock = new SteppingClock(START);
  const shop = new RecordingProject('shop');
  const docs = new RecordingProject('docs');
  const pauses = new FixedPauses();
  const reloads: InstallationReload[] = [];
  const warnings: string[] = [];
  const tasksRun: string[] = [];
  const refusal: { reason: string | null } = { reason: null };
  const daemon = new InstallationDaemon(
    {
      events,
      clock,
      sleeper: { sleep: (_milliseconds, signal) => new Promise((resolve) => setTimeout(resolve, signal.aborted ? 0 : 1)) },
      log: { info: () => undefined, warn: (line) => warnings.push(line) },
      pauses,
      configuration: {
        reload: () => {
          if (refusal.reason !== null) return Promise.reject(new Error(refusal.reason));
          const reload = { restartRequired: [], concurrencyByProject: new Map([['shop', 2], ['docs', 1]]) };
          reloads.push(reload);
          return Promise.resolve(reload);
        },
      },
      tasks: [{ name: 'refreshing usage', run: () => Promise.resolve(void tasksRun.push('usage')) }, ...extraTasks],
      projects: [shop, docs],
      films,
    },
    { pollIntervalMs: 1 },
  );
  return { events, clock, shop, docs, pauses, reloads, warnings, tasksRun, refusal, daemon };
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

  it('ticks the projects while a task is still running, and never starts that task twice at once', async () => {
    let finish: () => void = () => undefined;
    let started = 0;
    const slow: InstallationTask = {
      name: 'sampling the health of shop',
      run: () => {
        started += 1;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    };
    const { shop, daemon } = setup([slow]);
    const signal = new AbortController().signal;
    await daemon.tick(signal);
    await daemon.tick(signal);
    expect(shop.calls).toEqual(['tick', 'tick']);
    expect(started).toBe(1);
    finish();
    await daemon.settled();
    await daemon.tick(signal);
    expect(started).toBe(2);
  });

  it('waits for the tasks still running before it reports itself stopped', async () => {
    let finished = false;
    const slow: InstallationTask = {
      name: 'refreshing a slow account',
      run: (signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            finished = true;
            resolve();
          });
        }),
    };
    const { events, daemon } = setup([slow]);
    const controller = new AbortController();
    const running = daemon.run(controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await running;
    expect(finished).toBe(true);
    expect(events.records.at(-1)?.type).toBe('daemon.stopped');
  });

  it('applies a settings change once and hands each project its reloaded concurrency', async () => {
    const { events, shop, docs, reloads, daemon } = setup();
    await events.append(SETTINGS_CHANGED_EVENT, SETTINGS_SUBJECT, { change: { kind: 'resources' } });
    await daemon.tick(new AbortController().signal);
    await daemon.tick(new AbortController().signal);
    expect(reloads).toHaveLength(1);
    expect([shop.concurrency, docs.concurrency]).toEqual([2, 1]);
    expect(events.typesOf(SETTINGS_SUBJECT)).toEqual([SETTINGS_CHANGED_EVENT, CONFIGURATION_RELOADED_EVENT]);
  });

  it('reloads after a hand edit of the configuration file, as after a settings change', async () => {
    const { events, reloads, daemon } = setup();
    await events.append(CONFIGURATION_EDITED_EVENT, SETTINGS_SUBJECT, { digest: 'a1b2' });
    await daemon.tick(new AbortController().signal);
    await daemon.tick(new AbortController().signal);
    expect(reloads).toHaveLength(1);
    expect(events.typesOf(SETTINGS_SUBJECT)).toEqual([CONFIGURATION_EDITED_EVENT, CONFIGURATION_RELOADED_EVENT]);
  });

  it('records a file it cannot load once, keeps the settings it had, and reloads after the next edit', async () => {
    const { events, reloads, refusal, warnings, daemon } = setup();
    refusal.reason = 'projects.0.concurrency.issues: must not exceed concurrency.ceiling';
    await events.append(CONFIGURATION_EDITED_EVENT, SETTINGS_SUBJECT, { digest: 'a1b2' });
    await daemon.tick(new AbortController().signal);
    await daemon.tick(new AbortController().signal);
    expect(events.typesOf(SETTINGS_SUBJECT)).toEqual([CONFIGURATION_EDITED_EVENT, CONFIGURATION_RELOAD_FAILED_EVENT]);
    expect(warnings).toEqual(['the configuration did not reload: projects.0.concurrency.issues: must not exceed concurrency.ceiling']);
    refusal.reason = null;
    await events.append(CONFIGURATION_EDITED_EVENT, SETTINGS_SUBJECT, { digest: 'c3d4' });
    await daemon.tick(new AbortController().signal);
    expect(reloads).toHaveLength(1);
    expect(events.typesOf(SETTINGS_SUBJECT).at(-1)).toBe(CONFIGURATION_RELOADED_EVENT);
  });

  it('keeps ticking the other projects when one of them fails', async () => {
    const { shop, docs, warnings, daemon } = setup();
    shop.failTick = true;
    await daemon.tick(new AbortController().signal);
    expect(docs.calls).toEqual(['tick']);
    expect(warnings).toEqual(['ticking project shop failed: forge unreachable']);
  });

  it('stops on its own once a drain is asked for and every project is idle, then starts again unpaused', async () => {
    const { events, shop, docs, daemon } = setup();
    shop.busy = true;
    const controller = new AbortController();
    const running = daemon.run(controller.signal);
    while (!events.typesOf(DAEMON_SUBJECT).includes(DAEMON_STARTED_EVENT)) await new Promise((resolve) => setTimeout(resolve, 1));
    await requestDrain(events, 'alex');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(events.typesOf(DAEMON_SUBJECT)).not.toContain(DAEMON_STOPPED_EVENT);
    shop.busy = false;
    await running;
    expect(controller.signal.aborted).toBe(false);
    expect(shop.calls.at(-1)).toBe('stop');
    expect(docs.calls.at(-1)).toBe('stop');
    expect(events.typesOf(DAEMON_SUBJECT).slice(-2)).toEqual([SCHEDULER_RESUMED_EVENT, DAEMON_STOPPED_EVENT]);
    expect(await activePauses(events)).toEqual(new Map());
  });

  it('lifts a drain a previous process was asked for and never finished', async () => {
    const { events, daemon } = setup();
    await requestDrain(events, 'alex');
    const controller = new AbortController();
    controller.abort();
    await daemon.run(controller.signal);
    expect((await activePauses(events)).has('drain')).toBe(false);
  });

  it('finds a project by its id', () => {
    const { shop, daemon } = setup();
    expect(daemon.project('shop')).toBe(shop);
    expect(daemon.project('billing')).toBeNull();
  });

  it('hands every project the hold its films ask for, and tells the films which work runs', async () => {
    class ScriptedFilms implements InstallationFilms {
      readonly ticks: FilmTick[] = [];
      hold: SchedulingHold = SLOTS_HELD;
      recording = false;

      isRecording(): boolean {
        return this.recording;
      }

      tick(input: FilmTick): Promise<SchedulingHold> {
        this.ticks.push(input);
        return Promise.resolve(this.hold);
      }

      settle(): Promise<void> {
        return Promise.resolve();
      }
    }
    const films = new ScriptedFilms();
    const { shop, docs, pauses, daemon } = setup([], films);
    docs.busy = true;
    pauses.pauses = new Map([['budget', { reason: 'spent' }]]);

    await daemon.tick(new AbortController().signal);
    films.hold = SLOTS_FREE;
    await daemon.tick(new AbortController().signal);

    expect(shop.holds).toEqual([true, false]);
    expect(docs.holds).toEqual([true, false]);
    expect(films.ticks.map((tick) => tick.workRunning)).toEqual([true, true]);
    expect([...(films.ticks[0]?.pauses.keys() ?? [])]).toEqual(['budget']);
  });

  it('leaves the slots free when the films fail to decide', async () => {
    const failing: InstallationFilms = {
      isRecording: () => false,
      tick: () => Promise.reject(new Error('the log is locked')),
      settle: () => Promise.resolve(),
    };
    const { shop, warnings, daemon } = setup([], failing);
    await daemon.tick(new AbortController().signal);
    expect(shop.holds).toEqual([false]);
    expect(warnings).toEqual(['running the films failed: the log is locked']);
  });

  it('does not drain while a film records, and waits for it to end before it stops', async () => {
    let recording = true;
    const films: InstallationFilms = {
      isRecording: () => recording,
      tick: () => Promise.resolve(SLOTS_HELD),
      settle: () => Promise.resolve(),
    };
    const { events, daemon } = setup([], films);
    const controller = new AbortController();
    const running = daemon.run(controller.signal);
    while (!events.typesOf(DAEMON_SUBJECT).includes(DAEMON_STARTED_EVENT)) await new Promise((resolve) => setTimeout(resolve, 1));
    await requestDrain(events, 'Alex Morgan');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(events.typesOf(DAEMON_SUBJECT)).not.toContain(DAEMON_STOPPED_EVENT);
    recording = false;
    await running;
    expect(events.typesOf(DAEMON_SUBJECT)).toContain(DAEMON_STOPPED_EVENT);
  });

  it('waits for the film recording when the signal aborts', async () => {
    let settled = false;
    const films: InstallationFilms = {
      isRecording: () => false,
      tick: () => Promise.resolve(SLOTS_FREE),
      settle: async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        settled = true;
      },
    };
    const { daemon } = setup([], films);
    const controller = new AbortController();
    const running = daemon.run(controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await running;
    expect(settled).toBe(true);
  });
});
