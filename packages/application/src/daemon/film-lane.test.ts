import { describe, expect, it } from 'vitest';
import type { FilmOutcome } from '../film/film-behaviour.ts';
import type { FilmBodyRefresh } from '../film/film-bodies.ts';
import { FilmDeferredError, FilmRefusedError } from '../film/film-errors.ts';
import type { FilmOrder, QueuedFilm } from '../film/film-order.ts';
import type { FilmRunner } from '../film/film-runner.ts';
import { OperatorNotifications } from '../notifications/operator-notifications.ts';
import type { Notifier } from '../ports.ts';
import { FilmLane, type FilmLaneProject, type FilmTick } from './film-lane.ts';
import { SLOTS_FREE, SLOTS_HELD } from './scheduling-hold.ts';
import type { PauseSet } from './scheduling-pauses.ts';

const SIGNAL = new AbortController().signal;
const NO_PAUSES: PauseSet = new Map();
const PAUSED_BY_OPERATOR: PauseSet = new Map([['operator', {}]]);
const BUDGET_SPENT: PauseSet = new Map([['budget', {}]]);
const RUNNING: FilmTick = { pauses: NO_PAUSES, workRunning: true };
const IDLE: FilmTick = { pauses: NO_PAUSES, workRunning: false };

function order(issueNumber: number, scenario: string): FilmOrder {
  return { issueNumber, scenario, operator: 'Alex Morgan' };
}

class ScriptedFilms implements FilmRunner {
  queued: QueuedFilm[] = [];
  declared: FilmOrder[] = [];
  prepareError: Error | null = null;
  readonly prepared: FilmOrder[] = [];
  readonly filmed: FilmOrder[] = [];
  readonly failures: { order: FilmOrder; reason: string }[] = [];
  refreshes = 0;
  private finishing: ((outcome: FilmOutcome) => void) | null = null;

  prepare(next: FilmOrder): Promise<unknown> {
    this.prepared.push(next);
    return this.prepareError === null ? Promise.resolve() : Promise.reject(this.prepareError);
  }

  film(next: FilmOrder, signal: AbortSignal): Promise<FilmOutcome> {
    this.filmed.push(next);
    return new Promise<FilmOutcome>((resolve, reject) => {
      this.finishing = resolve;
      signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true });
    });
  }

  finish(outcome: FilmOutcome): void {
    this.queued = [];
    this.finishing?.(outcome);
  }

  order(): Promise<void> {
    return Promise.resolve();
  }

  orderDeclared(): Promise<readonly FilmOrder[]> {
    const orders = this.declared;
    this.declared = [];
    return Promise.resolve(orders);
  }

  next(): Promise<QueuedFilm | null> {
    return Promise.resolve(this.queued[0] ?? null);
  }

  fail(failed: FilmOrder, reason: string): Promise<void> {
    this.failures.push({ order: failed, reason });
    this.queued = this.queued.filter((queued) => queued.order.scenario !== failed.scenario);
    return Promise.resolve();
  }

  refreshBodies(): Promise<FilmBodyRefresh> {
    this.refreshes += 1;
    return Promise.resolve({ updated: [], failed: [] });
  }
}

function finished(issueNumber: number, scenario: string): FilmOutcome {
  const phase = { video: 'v', report: 'r', screenshots: [], facts: [], storeVideo: 's', storeScreenshots: [], omitted: [] };
  return { kind: 'finished', issueNumber, pullRequestNumber: 100 + issueNumber, scenario, commitSha: 'films000', before: phase, after: phase };
}

interface Lane {
  readonly lane: FilmLane;
  readonly films: ScriptedFilms;
  readonly titles: string[];
  readonly projectPauses: { current: PauseSet };
}

function projectOf(id: string, films: ScriptedFilms, titles: string[], pauses: { current: PauseSet }): FilmLaneProject {
  const notifier: Notifier = { notify: (title) => Promise.resolve(void titles.push(`${id}: ${title}`)) };
  const log = { info: () => undefined, warn: () => undefined };
  return { projectId: id, films, notifications: new OperatorNotifications(notifier, 'https://factory.example.test', log), log, pauses: () => Promise.resolve(pauses.current) };
}

function setup(): { readonly storefront: Lane; readonly ledger: ScriptedFilms; readonly ledgerPauses: { current: PauseSet } } {
  const titles: string[] = [];
  const storefront = new ScriptedFilms();
  const ledger = new ScriptedFilms();
  const storefrontPauses = { current: NO_PAUSES };
  const ledgerPauses = { current: NO_PAUSES };
  const lane = new FilmLane([projectOf('storefront', storefront, titles, storefrontPauses), projectOf('ledger', ledger, titles, ledgerPauses)]);
  return { storefront: { lane, films: storefront, titles, projectPauses: storefrontPauses }, ledger, ledgerPauses };
}

describe('FilmLane', () => {
  it('starts the film ordered first, whichever project it belongs to, and holds every slot while it records', async () => {
    const { storefront, ledger } = setup();
    storefront.films.queued = [{ order: order(1, 'checkout-flow'), queuedSequence: 20 }];
    ledger.queued = [{ order: order(2, 'month-end'), queuedSequence: 10 }];

    expect(await storefront.lane.tick(IDLE, SIGNAL)).toBe(SLOTS_HELD);

    expect(ledger.filmed).toEqual([order(2, 'month-end')]);
    expect(storefront.films.filmed).toEqual([]);
    expect(storefront.lane.isRecording()).toBe(true);
    expect(await storefront.lane.tick(IDLE, SIGNAL)).toBe(SLOTS_HELD);
    expect(ledger.filmed).toHaveLength(1);
  });

  it('releases the slots and notifies the operator when the film ends', async () => {
    const { storefront, ledger } = setup();
    ledger.queued = [{ order: order(2, 'month-end'), queuedSequence: 10 }];
    await storefront.lane.tick(IDLE, SIGNAL);

    ledger.finish(finished(2, 'month-end'));
    await storefront.lane.settle();

    expect(storefront.lane.isRecording()).toBe(false);
    expect(storefront.titles).toEqual(['ledger: Films of scenario month-end recorded for issue #2']);
    expect(storefront.films.refreshes).toBe(1);
    expect(ledger.refreshes).toBe(1);
    expect(await storefront.lane.tick({ ...IDLE }, SIGNAL)).toBe(SLOTS_FREE);
  });

  it('notifies a film that failed with its reason', async () => {
    const { storefront, ledger } = setup();
    ledger.queued = [{ order: order(2, 'month-end'), queuedSequence: 10 }];
    await storefront.lane.tick(IDLE, SIGNAL);

    ledger.finish({ kind: 'failed', issueNumber: 2, scenario: 'month-end', reason: 'the session expired' });
    await storefront.lane.settle();

    expect(storefront.titles).toEqual(['ledger: Films of scenario month-end failed for issue #2']);
  });

  it('waits for the running work and holds the slots so that it drains', async () => {
    const { storefront } = setup();
    storefront.films.queued = [{ order: order(1, 'checkout-flow'), queuedSequence: 1 }];

    expect(await storefront.lane.tick(RUNNING, SIGNAL)).toBe(SLOTS_HELD);
    expect(storefront.films.prepared).toEqual([]);
    expect(await storefront.lane.tick(IDLE, SIGNAL)).toBe(SLOTS_HELD);
    expect(storefront.films.filmed).toHaveLength(1);
  });

  it('holds nothing while no film waits', async () => {
    const { storefront } = setup();
    expect(await storefront.lane.tick(RUNNING, SIGNAL)).toBe(SLOTS_FREE);
    expect(await storefront.lane.tick(IDLE, SIGNAL)).toBe(SLOTS_FREE);
  });

  it('waits for an agent run to end holding the slots, and for memory without holding them', async () => {
    const { storefront } = setup();
    storefront.films.queued = [{ order: order(1, 'checkout-flow'), queuedSequence: 1 }];
    storefront.films.prepareError = new FilmDeferredError(1, 'agent-run', 'an agent run is active');
    expect(await storefront.lane.tick(IDLE, SIGNAL)).toBe(SLOTS_HELD);

    storefront.films.prepareError = new FilmDeferredError(1, 'resources', 'machine resources are short');
    expect(await storefront.lane.tick(IDLE, SIGNAL)).toBe(SLOTS_FREE);
    expect(storefront.films.filmed).toEqual([]);
  });

  it('fails a film that cannot be filmed and tells the operator, then goes on', async () => {
    const { storefront } = setup();
    storefront.films.queued = [{ order: order(1, 'checkout-flow'), queuedSequence: 1 }];
    storefront.films.prepareError = new FilmRefusedError(1, 'its worktree has uncommitted changes');

    expect(await storefront.lane.tick(IDLE, SIGNAL)).toBe(SLOTS_FREE);

    expect(storefront.films.failures).toEqual([{ order: order(1, 'checkout-flow'), reason: 'its worktree has uncommitted changes' }]);
    expect(storefront.titles).toEqual(['storefront: Films of scenario checkout-flow failed for issue #1']);
  });

  it('lets an unexpected failure reach the daemon', async () => {
    const { storefront } = setup();
    storefront.films.queued = [{ order: order(1, 'checkout-flow'), queuedSequence: 1 }];
    storefront.films.prepareError = new Error('the event log is locked');
    await expect(storefront.lane.tick(IDLE, SIGNAL)).rejects.toThrow('the event log is locked');
  });

  it('goes on while only the subscription budget is paused', async () => {
    const { storefront } = setup();
    storefront.films.queued = [{ order: order(1, 'checkout-flow'), queuedSequence: 1 }];
    expect(await storefront.lane.tick({ pauses: BUDGET_SPENT, workRunning: false }, SIGNAL)).toBe(SLOTS_HELD);
    expect(storefront.films.filmed).toHaveLength(1);
  });

  it('starts no film while the operator, a drain or short resources pause the installation', async () => {
    for (const cause of ['operator', 'drain', 'resources'] as const) {
      const { storefront } = setup();
      storefront.films.queued = [{ order: order(1, 'checkout-flow'), queuedSequence: 1 }];
      expect(await storefront.lane.tick({ pauses: new Map([[cause, {}]]), workRunning: false }, SIGNAL)).toBe(SLOTS_FREE);
      expect(storefront.films.prepared).toEqual([]);
    }
  });

  it('keeps the films of a project the operator paused, and films the other projects', async () => {
    const { storefront, ledger, ledgerPauses } = setup();
    ledgerPauses.current = PAUSED_BY_OPERATOR;
    ledger.queued = [{ order: order(2, 'month-end'), queuedSequence: 1 }];
    storefront.films.queued = [{ order: order(1, 'checkout-flow'), queuedSequence: 2 }];

    await storefront.lane.tick(IDLE, SIGNAL);

    expect(storefront.films.filmed).toEqual([order(1, 'checkout-flow')]);
    expect(ledger.filmed).toEqual([]);
  });

  it('orders the declared films of the projects that are not paused, and refreshes every placeholder', async () => {
    const { storefront, ledger, ledgerPauses } = setup();
    ledgerPauses.current = PAUSED_BY_OPERATOR;
    storefront.films.declared = [order(1, 'checkout-flow')];
    ledger.declared = [order(2, 'month-end')];

    await storefront.lane.tick(IDLE, SIGNAL);

    expect(ledger.declared).toEqual([order(2, 'month-end')]);
    expect(storefront.films.declared).toEqual([]);
    expect(storefront.films.refreshes).toBe(1);
    expect(ledger.refreshes).toBe(1);
  });

  it('stops the film recording when the daemon stops', async () => {
    const { storefront } = setup();
    const controller = new AbortController();
    storefront.films.queued = [{ order: order(1, 'checkout-flow'), queuedSequence: 1 }];
    await storefront.lane.tick(IDLE, controller.signal);

    controller.abort();
    await storefront.lane.settle();

    expect(storefront.lane.isRecording()).toBe(false);
    expect(storefront.titles).toEqual(['storefront: Films of scenario checkout-flow failed for issue #1']);
  });

  it('starts nothing once the daemon is stopping', async () => {
    const { storefront } = setup();
    const controller = new AbortController();
    controller.abort();
    storefront.films.queued = [{ order: order(1, 'checkout-flow'), queuedSequence: 1 }];
    expect(await storefront.lane.tick(IDLE, controller.signal)).toBe(SLOTS_FREE);
  });
});
