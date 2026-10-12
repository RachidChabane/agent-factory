import { describe, expect, it } from 'vitest';
import type { Sleeper } from '@agent-factory/application';
import type { Blocker } from './blocker.ts';
import type { BlockerTransition } from './blocker-transitions.ts';
import { SnapshotUnavailableError, type SnapshotSource } from './snapshot-source.ts';
import { issueView, READ_AT, storefrontWith } from './testing/watched-snapshots.ts';
import type { WatchedSnapshot } from './watched-snapshot.ts';
import { WatchLoop, type TransitionSink } from './watch-loop.ts';
import { DEFAULT_WATCH_SETTINGS, watchSettings } from './watch-settings.ts';

const MINUTE_MS = 60_000;
const ESCALATED = issueView(12, { state: 'needs-human', escalation: { reason: 'the gate failed', diagnosis: '', since: '2026-10-12T13:30:00.000Z' } });

type Step = WatchedSnapshot | Error;

/** Answers each read with the next step; a run is stopped once its last step was read. */
class ScriptedSource implements SnapshotSource {
  private position = 0;
  private readonly steps: readonly Step[];
  private readonly lastStep: () => void;

  constructor(steps: readonly Step[], lastStep: () => void) {
    this.steps = steps;
    this.lastStep = lastStep;
  }

  read(): Promise<WatchedSnapshot> {
    const step = this.steps[this.position];
    this.position += 1;
    if (this.position >= this.steps.length) this.lastStep();
    if (step === undefined) return Promise.reject(new Error('the script ended'));
    return step instanceof Error ? Promise.reject(step) : Promise.resolve(step);
  }
}

class RecordingSink implements TransitionSink {
  readonly emitted: { readonly at: string; readonly kind: BlockerTransition['kind']; readonly blocker: Blocker }[] = [];

  emit(at: Date, transition: BlockerTransition): void {
    this.emitted.push({ at: at.toISOString(), kind: transition.kind, blocker: transition.blocker });
  }

  summary(): string[] {
    return this.emitted.map((entry) => `${entry.at} ${entry.kind} ${entry.blocker.kind}`);
  }
}

function setup(steps: readonly Step[], stopAfterLastStep = true) {
  const controller = new AbortController();
  const sink = new RecordingSink();
  const slept: number[] = [];
  const sleeper: Sleeper = {
    sleep: (milliseconds) => {
      slept.push(milliseconds);
      return Promise.resolve();
    },
  };
  const loop = new WatchLoop({ source: new ScriptedSource(steps, () => (stopAfterLastStep ? controller.abort() : undefined)), clock: { now: () => READ_AT }, sleeper, sink }, watchSettings(30));
  return { controller, sink, slept, loop };
}

const snapshotAt = (minutes: number, issues = [ESCALATED]): WatchedSnapshot => ({ ...storefrontWith(issues), generatedAt: new Date(READ_AT.getTime() + minutes * MINUTE_MS).toISOString() });

describe('the watch loop', () => {
  it('reports the blockers present at the first reading, then only what changes', async () => {
    const { controller, sink, slept, loop } = setup([snapshotAt(0), snapshotAt(1), snapshotAt(2), snapshotAt(3, [])]);
    await loop.run(controller.signal);
    expect(sink.summary()).toEqual(['2026-10-12T14:00:00.000Z appeared needs-human', '2026-10-12T14:03:00.000Z cleared needs-human']);
    expect(slept).toEqual([30_000, 30_000, 30_000, 30_000]);
  });

  it('reports the cockpit as unreachable once, then as reachable again, at the local time of each failed reading', async () => {
    const down = new SnapshotUnavailableError('http://127.0.0.1:7430 is not reachable: ECONNREFUSED');
    const { controller, sink, loop } = setup([snapshotAt(0, []), down, down, snapshotAt(3, [])]);
    await loop.run(controller.signal);
    expect(sink.summary()).toEqual(['2026-10-12T14:00:00.000Z appeared cockpit-unreachable', '2026-10-12T14:03:00.000Z cleared cockpit-unreachable']);
    expect(sink.emitted[0]?.blocker.detail).toBe('http://127.0.0.1:7430 is not reachable: ECONNREFUSED');
  });

  it('shows no clearing and no new appearance for a blocker that lasts through an outage', async () => {
    const down = new SnapshotUnavailableError('no answer within 10 s');
    const { controller, sink, loop } = setup([snapshotAt(0), down, snapshotAt(2), snapshotAt(3, [])]);
    await loop.run(controller.signal);
    expect(sink.emitted.map((entry) => [entry.kind, entry.blocker.kind])).toEqual([
      ['appeared', 'needs-human'],
      ['appeared', 'cockpit-unreachable'],
      ['cleared', 'cockpit-unreachable'],
      ['cleared', 'needs-human'],
    ]);
  });

  it('reads once, reports what blocks now and returns it', async () => {
    const { controller, sink, loop } = setup([snapshotAt(0)], false);
    const blockers = await loop.readOnce(controller.signal);
    expect(blockers.map((blocker) => blocker.kind)).toEqual(['needs-human']);
    expect(sink.summary()).toEqual(['2026-10-12T14:00:00.000Z appeared needs-human']);
  });

  it('returns nothing from a factory that works, and the unreachable cockpit from one that does not answer', async () => {
    const quiet = setup([snapshotAt(0, [])], false);
    expect(await quiet.loop.readOnce(quiet.controller.signal)).toEqual([]);
    const silent = setup([new Error('connection refused')], false);
    expect((await silent.loop.readOnce(silent.controller.signal)).map((blocker) => blocker.kind)).toEqual(['cockpit-unreachable']);
  });

  it('stops without reporting a failed reading when the signal aborts it', async () => {
    const { controller, sink, loop } = setup([new Error('aborted')]);
    controller.abort();
    await loop.run(controller.signal);
    expect(sink.emitted).toEqual([]);
  });

  it('polls every twenty seconds unless told otherwise', () => {
    expect(DEFAULT_WATCH_SETTINGS.intervalMs).toBe(20_000);
    expect(watchSettings(5).intervalMs).toBe(5_000);
  });
});
