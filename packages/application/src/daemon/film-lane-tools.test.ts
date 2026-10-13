import { describe, expect, it } from 'vitest';
import type { ToolProbeResult, ToolStatus } from '@agent-factory/domain';
import { InMemoryEventStore } from '../audit/testing/fakes.ts';
import { FILM_TOOLS_AVAILABLE_EVENT, FILM_TOOLS_SUBJECT, FILM_TOOLS_UNAVAILABLE_EVENT, filmToolWaitOf, FilmToolWaitReporter } from '../film/film-tool-wait.ts';
import { FILM_TOOL_FRESHNESS_MS, FILM_TOOL_RECHECK_INTERVAL_MS, type FilmTool, type FilmToolChecks, type LoggedToolReading } from '../film/film-tools.ts';
import { OperatorNotifications } from '../notifications/operator-notifications.ts';
import type { Notifier } from '../ports.ts';
import { SteppingClock } from '../runs/test-support.ts';
import { FilmLane, type FilmLaneProject, type FilmTick } from './film-lane.ts';
import { SLOTS_FREE, SLOTS_HELD } from './scheduling-hold.ts';
import type { PauseSet } from './scheduling-pauses.ts';
import { FilmDeferredError } from '../film/film-errors.ts';
import { order, ScriptedFilms } from './testing/scripted-films.ts';

const START = new Date('2026-10-12T08:00:00.000Z');
const SIGNAL = new AbortController().signal;
const NO_PAUSES: PauseSet = new Map();
const IDLE: FilmTick = { pauses: NO_PAUSES, workRunning: false };
const RUNNING: FilmTick = { pauses: NO_PAUSES, workRunning: true };
const VAULT_LOGIN = 'vault login -method=oidc';
const SLOW_CHECK_MS = 20;

const VAULT: FilmTool = { name: 'vault', scope: 'installation', loginCommand: VAULT_LOGIN };
const CLOUD: FilmTool = { name: 'cloud', scope: 'project', loginCommand: null };

/** The checks of the tools: what each says is scripted, and every call is counted. */
class ScriptedChecks implements FilmToolChecks {
  readonly calls: string[] = [];
  peak = 0;
  delayMs = 0;
  private inFlight = 0;
  private readonly results = new Map<string, ToolProbeResult>();

  private readonly logged = new Map<string, LoggedToolReading>();

  say(name: string, status: ToolStatus, detail = '', fixCommand: string | null = null): void {
    this.results.set(name, { tool: name, status, version: null, detail, fixCommand });
  }

  /** A check of the tool that someone else ran, which the log recorded at that time. */
  record(name: string, status: ToolStatus, checkedAt: Date): void {
    this.logged.set(name, { result: { tool: name, status, version: null, detail: '', fixCommand: null }, checkedAt });
  }

  latest(tool: FilmTool): Promise<LoggedToolReading | null> {
    return Promise.resolve(this.logged.get(tool.name) ?? null);
  }

  async check(tool: FilmTool): Promise<ToolProbeResult> {
    this.calls.push(tool.name);
    this.inFlight += 1;
    this.peak = Math.max(this.peak, this.inFlight);
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    this.inFlight -= 1;
    return this.results.get(tool.name) ?? { tool: tool.name, status: 'connected', version: null, detail: '', fixCommand: null };
  }
}

interface Titled {
  readonly title: string;
  readonly body: string;
}

function world() {
  const clock = new SteppingClock(START);
  const sent: string[] = [];
  const notices: Titled[] = [];
  const notifier: Notifier = {
    notify: (title, body) => {
      sent.push(title);
      notices.push({ title, body });
      return Promise.resolve();
    },
  };
  const log = { info: () => undefined, warn: () => undefined };
  const checks = new ScriptedChecks();
  const logs = new Map<string, InMemoryEventStore>();
  const films = new Map<string, ScriptedFilms>();

  function project(id: string, required: readonly FilmTool[] | null, pause: PauseSet = NO_PAUSES): FilmLaneProject {
    const events = new InMemoryEventStore(clock);
    logs.set(id, events);
    const scripted = new ScriptedFilms();
    films.set(id, scripted);
    const notifications = new OperatorNotifications(notifier, `https://factory.example.test/projects/${id}`, log);
    return {
      projectId: id,
      films: scripted,
      notifications,
      log,
      tools: required === null ? null : { required, checks, wait: new FilmToolWaitReporter({ projectId: id, events, notifications }) },
      pauses: () => Promise.resolve(pause),
    };
  }

  const advance = (milliseconds: number): void => clock.set(new Date(clock.now().getTime() + milliseconds));
  const waitOf = async (id: string) => filmToolWaitOf(await (logs.get(id) as InMemoryEventStore).read(FILM_TOOLS_SUBJECT, 0));
  const typesOf = (id: string) => (logs.get(id) as InMemoryEventStore).typesOf(FILM_TOOLS_SUBJECT);
  const filmsOf = (id: string) => films.get(id) as ScriptedFilms;
  return { clock, sent, notices, checks, project, advance, waitOf, typesOf, filmsOf, logs };
}

function queue(films: ScriptedFilms, issueNumber: number, scenario: string, queuedSequence: number): void {
  films.queued.push({ order: order(issueNumber, scenario), queuedSequence });
}

describe('the films of a project that needs tools', () => {
  it('checks the tools before a film starts, and starts it when they pass', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    const lane = new FilmLane([storefront], { clock: context.clock });

    expect(await lane.tick(IDLE, SIGNAL)).toBe(SLOTS_HELD);

    expect(context.checks.calls).toEqual(['vault']);
    expect(context.filmsOf('storefront').filmed).toEqual([order(1, 'checkout-flow')]);
    expect(await context.waitOf('storefront')).toBeNull();
    expect(context.sent).toEqual([]);
  });

  it('does not start a film whose tool fails, does not fail it, and holds no slot', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    context.checks.say('vault', 'unauthenticated', 'token expired');
    const lane = new FilmLane([storefront], { clock: context.clock });

    expect(await lane.tick(IDLE, SIGNAL)).toBe(SLOTS_FREE);

    expect(context.filmsOf('storefront').prepared).toEqual([]);
    expect(context.filmsOf('storefront').filmed).toEqual([]);
    expect(context.filmsOf('storefront').failures).toEqual([]);
    expect(context.filmsOf('storefront').queued).toHaveLength(1);
    expect(await context.waitOf('storefront')).toMatchObject({ tool: 'vault', scope: 'installation', status: 'unauthenticated', detail: 'token expired', loginCommand: VAULT_LOGIN, since: START });
  });

  it('tells the operator once, naming the tool and the exact login command the declaration gives', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    context.checks.say('vault', 'unauthenticated', 'token expired');
    const lane = new FilmLane([storefront], { clock: context.clock });

    await lane.tick(IDLE, SIGNAL);
    await lane.tick(IDLE, SIGNAL);
    await lane.tick(RUNNING, SIGNAL);

    expect(context.notices).toEqual([
      {
        title: 'Films of storefront wait for vault',
        body: `The tool vault is not logged in: token expired. The queued films stay queued and none fails. Log in with: ${VAULT_LOGIN}. The factory checks again every 5 minutes and starts the films once every tool passes.`,
      },
    ]);
  });

  it('gives the fix command of the check when the tool declares no login', async () => {
    const context = world();
    const storefront = context.project('storefront', [CLOUD]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    context.checks.say('cloud', 'missing', 'cloud is not installed', 'brew install cloud');
    await new FilmLane([storefront], { clock: context.clock }).tick(IDLE, SIGNAL);
    expect(context.notices[0]?.body).toBe(
      'The tool cloud is not installed: cloud is not installed. The queued films stay queued and none fails. The tool declares no login the factory can start. Restore it with: brew install cloud. The factory checks again every 5 minutes and starts the films once every tool passes.',
    );
  });

  it('reads the failing tool again only when the interval has passed, and records each reading', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    context.checks.say('vault', 'unauthenticated', 'token expired');
    const lane = new FilmLane([storefront], { clock: context.clock });

    await lane.tick(IDLE, SIGNAL);
    context.advance(FILM_TOOL_RECHECK_INTERVAL_MS - 1);
    await lane.tick(IDLE, SIGNAL);
    expect(context.checks.calls).toEqual(['vault']);

    context.advance(1);
    await lane.tick(IDLE, SIGNAL);
    expect(context.checks.calls).toEqual(['vault', 'vault']);
    expect(context.typesOf('storefront')).toEqual([FILM_TOOLS_UNAVAILABLE_EVENT, FILM_TOOLS_UNAVAILABLE_EVENT]);
    expect(await context.waitOf('storefront')).toMatchObject({ since: START, checkedAt: new Date(START.getTime() + FILM_TOOL_RECHECK_INTERVAL_MS) });
    expect(context.sent).toHaveLength(1);
  });

  it('reads the failing tool again while work runs, and holds no slot for the film while it fails', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    context.checks.say('vault', 'unauthenticated');
    const lane = new FilmLane([storefront], { clock: context.clock });

    expect(await lane.tick(RUNNING, SIGNAL)).toBe(SLOTS_FREE);
    context.advance(FILM_TOOL_RECHECK_INTERVAL_MS);
    expect(await lane.tick(RUNNING, SIGNAL)).toBe(SLOTS_FREE);

    expect(context.checks.calls).toEqual(['vault', 'vault']);
  });

  describe('a check of the tool that the operator ran', () => {
    it('releases the films at the next tick when it found the tool connected, without waiting for the interval', async () => {
      const context = world();
      const storefront = context.project('storefront', [VAULT]);
      queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
      context.checks.say('vault', 'unauthenticated', 'token expired');
      const lane = new FilmLane([storefront], { clock: context.clock });
      await lane.tick(IDLE, SIGNAL);

      context.advance(60_000);
      context.checks.say('vault', 'connected');
      context.checks.record('vault', 'connected', context.clock.now());
      expect(await lane.tick(IDLE, SIGNAL)).toBe(SLOTS_HELD);

      expect(context.filmsOf('storefront').filmed).toEqual([order(1, 'checkout-flow')]);
      expect(await context.waitOf('storefront')).toBeNull();
      expect(context.notices.map((notice) => notice.title)).toEqual(['Films of storefront wait for vault', 'Films of storefront resume']);
    });

    it('moves the wait to the next tool that fails once the operator has made the first connected, and tells nothing more', async () => {
      const context = world();
      const storefront = context.project('storefront', [VAULT, CLOUD]);
      queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
      context.checks.say('vault', 'unauthenticated', 'token expired');
      context.checks.say('cloud', 'unauthenticated', 'session expired');
      const lane = new FilmLane([storefront], { clock: context.clock });
      await lane.tick(IDLE, SIGNAL);
      expect(await context.waitOf('storefront')).toMatchObject({ tool: 'vault', scope: 'installation' });

      context.advance(60_000);
      context.checks.say('vault', 'connected');
      context.checks.record('vault', 'connected', context.clock.now());
      expect(await lane.tick(IDLE, SIGNAL)).toBe(SLOTS_FREE);

      expect(await context.waitOf('storefront')).toMatchObject({ tool: 'cloud', scope: 'project', detail: 'session expired', since: START });
      expect(context.notices.map((notice) => notice.title)).toEqual(['Films of storefront wait for vault']);
    });

    it('shows what the operator found when the tool still fails, but differently', async () => {
      const context = world();
      const storefront = context.project('storefront', [VAULT]);
      queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
      context.checks.say('vault', 'unauthenticated', 'token expired');
      const lane = new FilmLane([storefront], { clock: context.clock });
      await lane.tick(IDLE, SIGNAL);

      context.advance(60_000);
      context.checks.record('vault', 'missing', context.clock.now());
      await lane.tick(IDLE, SIGNAL);

      expect(await context.waitOf('storefront')).toMatchObject({ tool: 'vault', status: 'missing', detail: '' });
    });

    it('is not taken for a newer reading when it is older than the factory\'s own', async () => {
      const context = world();
      const storefront = context.project('storefront', [VAULT]);
      queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
      context.checks.say('vault', 'unauthenticated');
      context.checks.record('vault', 'connected', new Date(START.getTime() - 60_000));
      const lane = new FilmLane([storefront], { clock: context.clock });

      expect(await lane.tick(IDLE, SIGNAL)).toBe(SLOTS_FREE);
      context.advance(60_000);
      expect(await lane.tick(IDLE, SIGNAL)).toBe(SLOTS_FREE);

      expect(context.filmsOf('storefront').filmed).toEqual([]);
    });

    it('keeps the films waiting when the operator found the tool still failing', async () => {
      const context = world();
      const storefront = context.project('storefront', [VAULT]);
      queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
      context.checks.say('vault', 'unauthenticated');
      const lane = new FilmLane([storefront], { clock: context.clock });
      await lane.tick(IDLE, SIGNAL);

      context.advance(60_000);
      context.checks.record('vault', 'unauthenticated', context.clock.now());
      expect(await lane.tick(IDLE, SIGNAL)).toBe(SLOTS_FREE);
      expect(context.checks.calls).toEqual(['vault']);
    });

    it('is read at once after a restart, when the operator logged in while the factory was down', async () => {
      const context = world();
      const storefront = context.project('storefront', [VAULT]);
      queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
      context.checks.say('vault', 'unauthenticated');
      await new FilmLane([storefront], { clock: context.clock }).tick(IDLE, SIGNAL);

      context.advance(60_000);
      context.checks.say('vault', 'connected');
      context.checks.record('vault', 'connected', context.clock.now());
      expect(await new FilmLane([storefront], { clock: context.clock }).tick(IDLE, SIGNAL)).toBe(SLOTS_HELD);
      expect(context.filmsOf('storefront').filmed).toHaveLength(1);
    });
  });

  it('starts the films again once every tool passes, and says so once', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    context.checks.say('vault', 'unauthenticated', 'token expired');
    const lane = new FilmLane([storefront], { clock: context.clock });
    await lane.tick(IDLE, SIGNAL);

    context.checks.say('vault', 'connected');
    context.advance(FILM_TOOL_RECHECK_INTERVAL_MS);
    expect(await lane.tick(IDLE, SIGNAL)).toBe(SLOTS_HELD);

    expect(context.filmsOf('storefront').filmed).toEqual([order(1, 'checkout-flow')]);
    expect(await context.waitOf('storefront')).toBeNull();
    expect(context.typesOf('storefront')).toEqual([FILM_TOOLS_UNAVAILABLE_EVENT, FILM_TOOLS_AVAILABLE_EVENT]);
    expect(context.notices.map((notice) => notice.title)).toEqual(['Films of storefront wait for vault', 'Films of storefront resume']);
    expect(context.notices[1]?.body).toBe('The tool vault passes its check again: the queued films start.');
  });

  it('tells a later outage again', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT]);
    const films = context.filmsOf('storefront');
    queue(films, 1, 'checkout-flow', 1);
    context.checks.say('vault', 'unauthenticated');
    const lane = new FilmLane([storefront], { clock: context.clock });
    await lane.tick(IDLE, SIGNAL);
    context.checks.say('vault', 'connected');
    context.advance(FILM_TOOL_RECHECK_INTERVAL_MS);
    await lane.tick(IDLE, SIGNAL);
    films.finish({ kind: 'failed', issueNumber: 1, scenario: 'checkout-flow', reason: 'x' });
    await lane.settle();

    queue(films, 2, 'order-history', 2);
    context.checks.say('vault', 'unauthenticated');
    context.advance(FILM_TOOL_RECHECK_INTERVAL_MS);
    await lane.tick(IDLE, SIGNAL);

    expect(context.notices.filter((notice) => notice.title === 'Films of storefront wait for vault')).toHaveLength(2);
  });

  it('goes on with the films of the other projects while one project waits, even when its film was queued first', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT]);
    const ledger = context.project('ledger', null);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    queue(context.filmsOf('ledger'), 2, 'month-end', 2);
    context.checks.say('vault', 'unauthenticated');
    const lane = new FilmLane([storefront, ledger], { clock: context.clock });

    expect(await lane.tick(IDLE, SIGNAL)).toBe(SLOTS_HELD);

    expect(context.filmsOf('ledger').filmed).toEqual([order(2, 'month-end')]);
    expect(context.filmsOf('storefront').filmed).toEqual([]);
    expect(await context.waitOf('storefront')).not.toBeNull();
    expect(await context.waitOf('ledger')).toBeNull();
  });

  it('checks before it holds the slots, so that the factory is not drained for a film that cannot start', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    context.checks.say('vault', 'unauthenticated');

    expect(await new FilmLane([storefront], { clock: context.clock }).tick(RUNNING, SIGNAL)).toBe(SLOTS_FREE);
    expect(await context.waitOf('storefront')).not.toBeNull();
  });

  it('holds the slots for a film whose tools pass while work runs, reading them once per interval', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    const lane = new FilmLane([storefront], { clock: context.clock });

    expect(await lane.tick(RUNNING, SIGNAL)).toBe(SLOTS_HELD);
    expect(await lane.tick(RUNNING, SIGNAL)).toBe(SLOTS_HELD);
    expect(context.checks.calls).toEqual(['vault']);

    context.advance(FILM_TOOL_RECHECK_INTERVAL_MS);
    await lane.tick(RUNNING, SIGNAL);
    expect(context.checks.calls).toEqual(['vault', 'vault']);
  });

  it('reads the tools again right before the film starts, and waits when they no longer pass', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    const lane = new FilmLane([storefront], { clock: context.clock });
    expect(await lane.tick(RUNNING, SIGNAL)).toBe(SLOTS_HELD);

    context.checks.say('vault', 'unauthenticated', 'token expired');
    context.advance(FILM_TOOL_FRESHNESS_MS);
    expect(await lane.tick(IDLE, SIGNAL)).toBe(SLOTS_FREE);

    expect(context.checks.calls).toEqual(['vault', 'vault']);
    expect(context.filmsOf('storefront').filmed).toEqual([]);
    expect(await context.waitOf('storefront')).toMatchObject({ tool: 'vault' });
  });

  it('does not read the tools again at every tick while the start of the film is put off', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT]);
    const films = context.filmsOf('storefront');
    queue(films, 1, 'checkout-flow', 1);
    films.prepareError = new FilmDeferredError(1, 'resources', 'machine resources are short');
    const lane = new FilmLane([storefront], { clock: context.clock });

    for (let tick = 0; tick < 5; tick += 1) {
      expect(await lane.tick(IDLE, SIGNAL)).toBe(SLOTS_FREE);
      context.advance(10_000);
    }
    expect(context.checks.calls).toEqual(['vault']);

    context.advance(FILM_TOOL_FRESHNESS_MS);
    films.prepareError = null;
    expect(await lane.tick(IDLE, SIGNAL)).toBe(SLOTS_HELD);
    expect(context.checks.calls).toEqual(['vault', 'vault']);
    expect(films.filmed).toEqual([order(1, 'checkout-flow')]);
  });

  it('reads the tools of a film once in a round, whether it waits for work or starts', async () => {
    const context = world();
    const lane = new FilmLane([context.project('storefront', [VAULT])], { clock: context.clock });
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    await lane.tick(IDLE, SIGNAL);
    expect(context.checks.calls).toEqual(['vault']);
  });

  it('reads all the tools of a film at once', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT, CLOUD]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    context.checks.delayMs = SLOW_CHECK_MS;
    await new FilmLane([storefront], { clock: context.clock }).tick(IDLE, SIGNAL);
    expect(context.checks.peak).toBe(2);
  });

  it('names the first tool that fails when several do', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT, CLOUD]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    context.checks.say('cloud', 'error', 'timed out');
    context.checks.say('vault', 'unauthenticated');
    await new FilmLane([storefront], { clock: context.clock }).tick(IDLE, SIGNAL);
    expect(await context.waitOf('storefront')).toMatchObject({ tool: 'vault' });
  });

  it('reads a tool the installation declares once for the projects that list it, and a tool of each project for that project', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT, CLOUD]);
    const ledger = context.project('ledger', [VAULT, CLOUD]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    queue(context.filmsOf('ledger'), 2, 'month-end', 2);
    context.checks.say('vault', 'unauthenticated');
    await new FilmLane([storefront, ledger], { clock: context.clock }).tick(IDLE, SIGNAL);
    expect(context.checks.calls.toSorted()).toEqual(['cloud', 'cloud', 'vault']);
    expect(await context.waitOf('storefront')).not.toBeNull();
    expect(await context.waitOf('ledger')).not.toBeNull();
  });

  it('closes the wait, without telling the operator the films resume, when no film is queued any more', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    context.checks.say('vault', 'unauthenticated');
    const lane = new FilmLane([storefront], { clock: context.clock });
    await lane.tick(IDLE, SIGNAL);

    context.filmsOf('storefront').queued = [];
    expect(await lane.tick(IDLE, SIGNAL)).toBe(SLOTS_FREE);

    expect(await context.waitOf('storefront')).toBeNull();
    expect(context.notices.map((notice) => notice.title)).toEqual(['Films of storefront wait for vault']);
  });

  it('reads at once a wait the log recorded before the factory started, and starts the films when the tool passes', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    context.checks.say('vault', 'unauthenticated', 'token expired');
    await new FilmLane([storefront], { clock: context.clock }).tick(IDLE, SIGNAL);

    context.checks.say('vault', 'connected');
    context.advance(60_000);
    const restarted = new FilmLane([storefront], { clock: context.clock });
    expect(await restarted.tick(RUNNING, SIGNAL)).toBe(SLOTS_HELD);

    expect(context.checks.calls).toEqual(['vault', 'vault']);
    expect(await context.waitOf('storefront')).toBeNull();
    expect(context.notices.map((notice) => notice.title)).toEqual(['Films of storefront wait for vault', 'Films of storefront resume']);
  });

  it('keeps the wait in force and tells nothing more when the tool still fails after a restart', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT]);
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    context.checks.say('vault', 'unauthenticated', 'token expired');
    await new FilmLane([storefront], { clock: context.clock }).tick(IDLE, SIGNAL);

    context.advance(60_000);
    expect(await new FilmLane([storefront], { clock: context.clock }).tick(RUNNING, SIGNAL)).toBe(SLOTS_FREE);

    expect(await context.waitOf('storefront')).toMatchObject({ since: START, checkedAt: new Date(START.getTime() + 60_000) });
    expect(context.sent).toHaveLength(1);
  });

  it('checks no tool for a project whose films need none', async () => {
    const context = world();
    const ledger = context.project('ledger', null);
    queue(context.filmsOf('ledger'), 2, 'month-end', 1);
    expect(await new FilmLane([ledger], { clock: context.clock }).tick(IDLE, SIGNAL)).toBe(SLOTS_HELD);
    expect(context.checks.calls).toEqual([]);
  });

  it('leaves the films of a project the operator paused alone, tools included', async () => {
    const context = world();
    const storefront = context.project('storefront', [VAULT], new Map([['operator', {}]]));
    queue(context.filmsOf('storefront'), 1, 'checkout-flow', 1);
    expect(await new FilmLane([storefront], { clock: context.clock }).tick(IDLE, SIGNAL)).toBe(SLOTS_FREE);
    expect(context.checks.calls).toEqual([]);
  });
});
