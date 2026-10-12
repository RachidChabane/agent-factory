import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BLOCKER_KINDS } from './blocker.ts';
import { blockersOf } from './blockers-of.ts';
import { HttpSnapshotSource, SnapshotUnavailableError } from './snapshot-source.ts';
import { FixtureFactory, jsonAnswer } from './testing/fixture-factory.ts';
import { issueView, READ_AT, storefrontWith } from './testing/watched-snapshots.ts';
import { WatchLoop, type TransitionSink } from './watch-loop.ts';
import { watchSettings } from './watch-settings.ts';
import type { BlockerTransition } from './blocker-transitions.ts';
import { transitionLine } from './transition-lines.ts';

const ESCALATED = issueView(12, { state: 'needs-human', escalation: { reason: 'the gate failed', diagnosis: 'the gate failed', since: '2026-10-12T13:30:00.000Z' } });
const NO_SIGNAL = new AbortController().signal;
const SHORT_TIMEOUT_MS = 80;

describe('the snapshot read over HTTP', () => {
  let factory: FixtureFactory;
  let source: HttpSnapshotSource;

  beforeEach(async () => {
    factory = new FixtureFactory();
    source = new HttpSnapshotSource(`http://127.0.0.1:${await factory.start()}`);
  });
  afterEach(async () => {
    await factory.stop();
  });

  it('reads the part of the snapshot the blockers come from and ignores the rest', async () => {
    factory.answer = jsonAnswer({ ...storefrontWith([ESCALATED]), sequence: 77, costs: { basis: 'metered' }, settings: { models: ['claude-sonnet-5-5'] } });
    const snapshot = await source.read(NO_SIGNAL);
    expect(snapshot.generatedAt).toBe(READ_AT.toISOString());
    expect(snapshot).not.toHaveProperty('costs');
    expect(blockersOf(snapshot, READ_AT).map((blocker) => blocker.kind)).toEqual([BLOCKER_KINDS.needsHuman]);
  });

  it('says what the factory answered when it is not a snapshot', async () => {
    factory.answer = { status: 503, body: '{}' };
    await expect(source.read(NO_SIGNAL)).rejects.toThrow(/\/api\/state answered HTTP 503$/);
    factory.answer = { status: 200, body: '<html>' };
    await expect(source.read(NO_SIGNAL)).rejects.toThrow(/did not answer a snapshot this version reads/);
    factory.answer = jsonAnswer({ generatedAt: READ_AT.toISOString(), installation: { pauses: [] }, runs: [] });
    await expect(source.read(NO_SIGNAL)).rejects.toThrow(/projects/);
  });

  it('says that nothing answers when the factory is not running', async () => {
    await factory.stop();
    await expect(source.read(NO_SIGNAL)).rejects.toThrow(SnapshotUnavailableError);
    await expect(source.read(NO_SIGNAL)).rejects.toThrow(/is not reachable: ECONNREFUSED/);
    factory = new FixtureFactory();
    await factory.start();
  });

  it('gives up on a factory that accepts the request and never answers', async () => {
    factory.silent = true;
    const impatient = new HttpSnapshotSource(`http://127.0.0.1:${factory.port()}`, fetch, SHORT_TIMEOUT_MS);
    await expect(impatient.read(NO_SIGNAL)).rejects.toThrow(/is not reachable: no answer within 0.08 s/);
  });

  it('passes the abort of the caller on instead of reporting the factory unreachable', async () => {
    factory.silent = true;
    const controller = new AbortController();
    const pending = source.read(controller.signal);
    controller.abort();
    await expect(pending).rejects.not.toBeInstanceOf(SnapshotUnavailableError);
  });
});

describe('the watch of a factory over HTTP', () => {
  it('reports a blocker, an outage of the factory, and the blocker clearing once the factory answers again', async () => {
    const factory = new FixtureFactory();
    const port = await factory.start();
    const lines: string[] = [];
    const sink: TransitionSink = { emit: (at: Date, transition: BlockerTransition) => lines.push(transitionLine(at, transition)) };
    const controller = new AbortController();
    const afterReading: (() => Promise<void>)[] = [
      () => {
        factory.answer = { status: 500, body: 'boom' };
        return Promise.resolve();
      },
      () => {
        factory.answer = jsonAnswer(storefrontWith([]));
        return Promise.resolve();
      },
      () => {
        controller.abort();
        return Promise.resolve();
      },
    ];
    factory.answer = jsonAnswer(storefrontWith([ESCALATED]));
    const loop = new WatchLoop(
      { source: new HttpSnapshotSource(`http://127.0.0.1:${port}`), clock: { now: () => READ_AT }, sleeper: { sleep: () => afterReading.shift()?.() ?? Promise.resolve() }, sink },
      watchSettings(1),
    );
    try {
      await loop.run(controller.signal);
    } finally {
      await factory.stop();
    }
    expect(lines).toEqual([
      '2026-10-12T14:00:00Z blocked needs-human storefront#12: the gate failed',
      `2026-10-12T14:00:00Z blocked cockpit-unreachable factory: http://127.0.0.1:${port}/api/state answered HTTP 500`,
      '2026-10-12T14:00:00Z cleared cockpit-unreachable factory',
      '2026-10-12T14:00:00Z cleared needs-human storefront#12',
    ]);
  });
});
