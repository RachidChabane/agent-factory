import { afterEach, describe, expect, it } from 'vitest';
import { commit, FakeGitHubGateway, InMemoryEventStore } from '../audit/testing/fakes.ts';
import type { FilmOutcome } from '../film/film-behaviour.ts';
import type { FilmBodyRefresh } from '../film/film-bodies.ts';
import type { FilmOrder, QueuedFilm } from '../film/film-order.ts';
import type { FilmRunner } from '../film/film-runner.ts';
import { OperatorNotifications } from '../notifications/operator-notifications.ts';
import { EventSourcedIssueStates } from '../pipeline/testing/pipeline-fakes.ts';
import { SteppingClock } from '../runs/test-support.ts';
import { DAEMON_STARTED_EVENT, DAEMON_STOPPED_EVENT, DAEMON_SUBJECT } from './daemon-events.ts';
import { FactoryDaemon, type DaemonSettings } from './factory-daemon.ts';
import { FilmLane } from './film-lane.ts';
import { DRAINED_REASON, InstallationDaemon, requestDrain, type ProjectScheduler } from './installation-daemon.ts';
import { activePauses } from './pause-state.ts';
import { ProjectSchedulingPauses } from './scheduling-pauses.ts';
import { ControlledDriverFactory, prOpen, RecordingNotifier, recordState, ReleasingPool, validated } from './testing/daemon-fakes.ts';
import { DEFAULT_PROJECT_CONVENTIONS } from '../conventions/project-conventions.ts';

const START = new Date('2026-10-12T08:00:00.000Z');
const MINUTE_MS = 60_000;
const POLL_MS = 1;
const SETTLE_MS = 40;
const WAIT_LIMIT_MS = 2_000;
const SETTINGS: DaemonSettings = {
  concurrency: 1,
  poolSize: 3,
  baseBranch: 'main',
  conventions: DEFAULT_PROJECT_CONVENTIONS,
  releaseModel: { kind: 'release-please', tagPattern: '*v*' },
  pollIntervalMs: POLL_MS,
  mergeWatchIntervalMs: 10 * MINUTE_MS,
  issueRefreshMs: 0,
  retryDelayMs: 5 * MINUTE_MS,
};
const QUIET_LOG = { info: () => undefined, warn: () => undefined };

/** Films that record until the test ends them; what waits in the queue stays there. */
class ScriptedFilms implements FilmRunner {
  queued: QueuedFilm[] = [];
  readonly filmed: FilmOrder[] = [];
  private ending: ((outcome: FilmOutcome) => void) | null = null;

  prepare(): Promise<unknown> {
    return Promise.resolve();
  }

  film(order: FilmOrder): Promise<FilmOutcome> {
    this.filmed.push(order);
    this.queued = this.queued.filter((queued) => queued.order.scenario !== order.scenario);
    return new Promise<FilmOutcome>((resolve) => {
      this.ending = resolve;
    });
  }

  end(outcome: FilmOutcome): void {
    this.ending?.(outcome);
  }

  order(): Promise<void> {
    return Promise.resolve();
  }

  orderDeclared(): Promise<readonly FilmOrder[]> {
    return Promise.resolve([]);
  }

  next(): Promise<QueuedFilm | null> {
    return Promise.resolve(this.queued[0] ?? null);
  }

  fail(): Promise<void> {
    return Promise.resolve();
  }

  refreshBodies(): Promise<FilmBodyRefresh> {
    return Promise.resolve({ updated: [], failed: [] });
  }
}

function filmOrder(issueNumber: number, scenario: string): FilmOrder {
  return { issueNumber, scenario, operator: 'Alex Morgan' };
}

function queuedFilm(issueNumber: number, scenario: string, queuedSequence: number): QueuedFilm {
  return { order: filmOrder(issueNumber, scenario), queuedSequence };
}

function finishedFilm(order: FilmOrder): FilmOutcome {
  const phase = { video: 'v', report: 'r', screenshots: [], facts: [], storeVideo: 's', storeScreenshots: [], omitted: [] };
  return { kind: 'finished', issueNumber: order.issueNumber, pullRequestNumber: 100 + order.issueNumber, scenario: order.scenario, commitSha: 'films000', before: phase, after: phase };
}

const pause = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function until(condition: () => boolean | Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`gave up waiting for ${what}`);
    await pause(POLL_MS);
  }
}

/** A project's daemon and the films of the installation under one installation daemon, over one log. */
function world() {
  const events = new InMemoryEventStore();
  const clock = new SteppingClock(START);
  const github = new FakeGitHubGateway();
  github.history.push(commit({ sha: 'base' }));
  const drivers = new ControlledDriverFactory();
  const films = new ScriptedFilms();
  const notifier = new RecordingNotifier();
  const notifications = new OperatorNotifications(notifier, 'http://127.0.0.1:7430', QUIET_LOG);
  const sleeper = { sleep: (_milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve) => setTimeout(resolve, signal.aborted ? 0 : POLL_MS)) };
  let installation: InstallationDaemon | null = null;
  const daemon = new FactoryDaemon(
    {
      events,
      states: new EventSourcedIssueStates(events),
      github,
      pool: new ReleasingPool(),
      clock,
      sleeper,
      pauses: new ProjectSchedulingPauses(events, () => installation?.currentPauses() ?? new Map()),
      notifications,
      log: QUIET_LOG,
      pipelines: (signal) => drivers.create(signal),
      audits: null,
      challenges: null,
      films,
      pullRequestReady: null,
      releases: { evaluate: () => Promise.resolve({ promotable: false, blockingReasons: [], report: '' }) },
      configuration: null,
      reclaimStacks: () => Promise.resolve(0),
    },
    SETTINGS,
  );
  const scheduler: ProjectScheduler = {
    projectId: 'shop',
    start: () => daemon.start(),
    tick: (signal, hold) => daemon.tick(signal, hold),
    stop: () => daemon.stop(),
    updateConcurrency: (concurrency) => daemon.updateConcurrency(concurrency),
    isIdle: () => daemon.isIdle(),
  };
  const lane = new FilmLane([{ projectId: 'shop', films, notifications, log: QUIET_LOG, pauses: () => activePauses(events) }]);
  installation = new InstallationDaemon(
    { events, clock, sleeper, log: QUIET_LOG, pauses: { refresh: () => Promise.resolve(new Map()) }, configuration: null, tasks: [], projects: [scheduler], films: lane },
    { pollIntervalMs: POLL_MS },
  );
  return { events, github, drivers, films, daemon, installation };
}

type World = ReturnType<typeof world>;

/** Runs the installation daemon until it stops on its own; `stopped()` says whether it has. */
function running(context: World) {
  const controller = new AbortController();
  let stopped = false;
  const finished = context.installation.run(controller.signal).then(() => {
    stopped = true;
  });
  return { controller, finished, stopped: () => stopped };
}

describe('a restart that waits for a calm moment', () => {
  const stops: (() => void)[] = [];

  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
  });

  function start(context: World) {
    const session = running(context);
    stops.push(() => session.controller.abort());
    return session;
  }

  const reasonOfStop = (context: World): unknown => (context.events.records.findLast((record) => record.type === DAEMON_STOPPED_EVENT && record.subject === DAEMON_SUBJECT)?.payload as { reason?: string } | undefined)?.reason;

  it('waits for an issue in a stage the factory runs by itself, and stops once its pipeline ends', async () => {
    const context = world();
    context.github.issues.set(1, validated(1));
    context.github.issues.set(2, validated(2));
    const session = start(context);
    await until(() => context.drivers.started.includes(1), 'the pipeline of issue #1');
    await recordState(context.events, 1, 'gating');

    await requestDrain(context.events, 'Alex Morgan');
    await pause(SETTLE_MS);

    expect(session.stopped()).toBe(false);
    expect(context.daemon.isIdle()).toBe(false);
    expect(context.events.typesOf(DAEMON_SUBJECT)).not.toContain(DAEMON_STOPPED_EVENT);
    context.drivers.finish(1, prOpen(1, 10));
    await session.finished;
    expect(context.drivers.started).toEqual([1]);
    expect(reasonOfStop(context)).toBe(DRAINED_REASON);
  });

  it.each(['checks-frozen', 'gating', 'producing-evidence'] as const)('keeps the project busy while its issue is %s, until the pipeline ends', async (state) => {
    const context = world();
    context.github.issues.set(1, validated(1));
    await context.daemon.tick(new AbortController().signal);
    await recordState(context.events, 1, state);
    expect(context.daemon.isIdle()).toBe(false);
    context.drivers.finish(1, prOpen(1, 10));
    await context.daemon.settle();
    expect(context.daemon.isIdle()).toBe(true);
  });

  it('starts no issue while it waits', async () => {
    const context = world();
    context.github.issues.set(1, validated(1));
    context.github.issues.set(2, validated(2));
    const session = start(context);
    await until(() => context.drivers.started.includes(1), 'the pipeline of issue #1');
    await requestDrain(context.events, 'Alex Morgan');
    context.drivers.finish(1, prOpen(1, 10));
    await session.finished;
    expect(context.drivers.started).toEqual([1]);
  });

  it('does not wait for an issue left in a stage by an earlier stop, which nothing drives', async () => {
    const context = world();
    const session = start(context);
    await until(() => context.events.typesOf(DAEMON_SUBJECT).includes(DAEMON_STARTED_EVENT), 'the daemon to start');
    await requestDrain(context.events, 'Alex Morgan');
    await recordState(context.events, 5, 'gating');
    await session.finished;
    expect(context.drivers.started).toEqual([]);
    expect(reasonOfStop(context)).toBe(DRAINED_REASON);
  });

  it('waits for the film recording, and leaves the films that wait in the queue for the next start', async () => {
    const context = world();
    context.films.queued = [queuedFilm(1, 'checkout-flow', 1), queuedFilm(2, 'order-history', 2)];
    const session = start(context);
    await until(() => context.films.filmed.length === 1, 'the first film to record');

    await requestDrain(context.events, 'Alex Morgan');
    await pause(SETTLE_MS);

    expect(session.stopped()).toBe(false);
    expect(context.films.filmed).toEqual([filmOrder(1, 'checkout-flow')]);
    context.films.end(finishedFilm(filmOrder(1, 'checkout-flow')));
    await session.finished;
    expect(context.films.filmed).toHaveLength(1);
    expect(context.films.queued).toEqual([queuedFilm(2, 'order-history', 2)]);
    expect(reasonOfStop(context)).toBe(DRAINED_REASON);
  });

  it('starts no film once the drain is asked, even when one waits for the running work', async () => {
    const context = world();
    context.github.issues.set(1, validated(1));
    const session = start(context);
    await until(() => context.drivers.started.includes(1), 'the pipeline of issue #1');
    context.films.queued = [queuedFilm(3, 'checkout-flow', 1)];
    await requestDrain(context.events, 'Alex Morgan');
    await pause(SETTLE_MS);

    context.drivers.finish(1, prOpen(1, 10));
    await session.finished;

    expect(context.films.filmed).toEqual([]);
    expect(context.films.queued).toEqual([queuedFilm(3, 'checkout-flow', 1)]);
  });

  it('stops at once when nothing runs, nothing records and nothing is in a stage', async () => {
    const context = world();
    const session = start(context);
    await until(() => context.events.typesOf(DAEMON_SUBJECT).includes(DAEMON_STARTED_EVENT), 'the daemon to start');
    await requestDrain(context.events, 'Alex Morgan');
    await session.finished;
    expect(reasonOfStop(context)).toBe(DRAINED_REASON);
  });
});
