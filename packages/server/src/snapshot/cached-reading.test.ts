import { describe, expect, it } from 'vitest';
import { CachedReading, CachedReadings, NEVER_READ, observedView } from './cached-reading.ts';

class ManualClock {
  private at: number;

  constructor(at: number) {
    this.at = at;
  }

  now(): Date {
    return new Date(this.at);
  }

  advance(milliseconds: number): void {
    this.at += milliseconds;
  }
}

const START = Date.parse('2026-10-12T09:00:00.000Z');
const COLD_WAIT_MS = 25;

interface Deferred {
  readonly promise: Promise<string>;
  resolve(value: string): void;
  reject(reason: Error): void;
}

function deferred(): Deferred {
  let resolve: (value: string) => void = () => undefined;
  let reject: (reason: Error) => void = () => undefined;
  const promise = new Promise<string>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/** Lets the reads that were started behind a call end. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('cached readings', () => {
  it('reads once per interval and stamps each value with its read time', async () => {
    const clock = new ManualClock(START);
    let reads = 0;
    const reading = new CachedReading(() => Promise.resolve((reads += 1)), 60_000, clock);
    expect(await reading.get()).toEqual({ value: 1, readAt: new Date(START), error: null });
    clock.advance(30_000);
    expect((await reading.get()).value).toBe(1);
    expect(reads).toBe(1);
    clock.advance(30_000);
    await reading.get();
    await settle();
    expect(await reading.get()).toEqual({ value: 2, readAt: new Date(START + 60_000), error: null });
  });

  it('keeps the previous value and its time when a read fails, and says why', async () => {
    const clock = new ManualClock(START);
    let fail = false;
    const reading = new CachedReading(() => (fail ? Promise.reject(new Error('the forge did not answer')) : Promise.resolve('main')), 1_000, clock);
    await reading.get();
    fail = true;
    clock.advance(5_000);
    await reading.get();
    await settle();
    expect(await reading.get()).toEqual({ value: 'main', readAt: new Date(START), error: 'the forge did not answer' });
  });

  it('shares one read between concurrent callers and refreshes on demand', async () => {
    const clock = new ManualClock(START);
    let reads = 0;
    const reading = new CachedReading(() => Promise.resolve((reads += 1)), 60_000, clock);
    await Promise.all([reading.refresh(), reading.refresh(), reading.get()]);
    expect(reads).toBe(1);
    await reading.refresh();
    expect(reads).toBe(2);
  });

  it('keeps one reading per key', async () => {
    const clock = new ManualClock(START);
    const readings = new CachedReadings((key: string) => Promise.resolve(key.length), 60_000, clock);
    expect((await readings.get('staging')).value).toBe(7);
    expect((await readings.get('dev')).value).toBe(3);
  });

  it('renders a reading for the cockpit with ISO times', () => {
    expect(observedView({ value: 2, readAt: new Date(START), error: null }, (value) => value * 2)).toEqual({ value: 4, readAt: '2026-10-12T09:00:00.000Z', error: null });
    expect(observedView({ value: null, readAt: null, error: 'down' }, (value: number) => value)).toEqual({ value: null, readAt: null, error: 'down' });
  });

  it('reads again before the interval ends once something changed after the last read', async () => {
    let now = new Date('2026-10-10T08:00:00.000Z');
    let reads = 0;
    const reading = new CachedReading(() => Promise.resolve((reads += 1)), 60_000, { now: () => now });
    await reading.get();
    now = new Date('2026-10-10T08:00:10.000Z');
    expect((await reading.get(new Date('2026-10-10T07:59:00.000Z'))).value).toBe(1);
    expect((await reading.get(new Date('2026-10-10T08:00:05.000Z'))).value).toBe(2);
    expect((await reading.get(null)).value).toBe(2);
  });

  it('reads again sooner while the last value says it is about to change', async () => {
    const clock = new ManualClock(START);
    const values = ['pending', 'pending', 'success'];
    const reading = new CachedReading(() => Promise.resolve(values.shift() ?? 'success'), (last) => (last === 'pending' ? 10_000 : 60_000), clock);
    expect((await reading.get()).value).toBe('pending');
    clock.advance(10_000);
    await reading.get();
    await settle();
    clock.advance(10_000);
    await reading.get();
    await settle();
    expect(await reading.get()).toMatchObject({ value: 'success', readAt: new Date(START + 20_000) });
    clock.advance(10_000);
    expect((await reading.get()).value).toBe('success');
  });
});

describe('cached readings that never make a caller wait on the outside for a value they have', () => {
  function slowReading(): { readonly reading: CachedReading<string>; readonly clock: ManualClock; readonly loads: Deferred[] } {
    const clock = new ManualClock(START);
    const loads: Deferred[] = [];
    const reading = new CachedReading(
      () => {
        const load = deferred();
        loads.push(load);
        return load.promise;
      },
      60_000,
      clock,
      COLD_WAIT_MS,
    );
    return { reading, clock, loads };
  }

  it('waits for the first read and returns its value', async () => {
    const { reading, loads } = slowReading();
    const read = reading.get();
    loads[0]?.resolve('first');
    expect(await read).toEqual({ value: 'first', readAt: new Date(START), error: null });
  });

  it('answers that nothing was read once the cold wait elapses, and keeps reading behind', async () => {
    const { reading, loads } = slowReading();
    expect(await reading.get()).toBe(NEVER_READ);
    loads[0]?.resolve('late');
    await settle();
    expect(await reading.get()).toMatchObject({ value: 'late', error: null });
    expect(loads).toHaveLength(1);
  });

  it('lets a caller that arrives during the first read wait for that same read', async () => {
    const { reading, loads } = slowReading();
    const readings = Promise.all([reading.get(), reading.get(), reading.get()]);
    expect(loads).toHaveLength(1);
    loads[0]?.resolve('shared');
    expect((await readings).map((observed) => observed.value)).toEqual(['shared', 'shared', 'shared']);
  });

  it('returns an old value at once, with the time it was read, and reads again behind the call', async () => {
    const { reading, clock, loads } = slowReading();
    const first = reading.get();
    loads[0]?.resolve('v1');
    await first;
    clock.advance(60_000);
    expect(await reading.get()).toEqual({ value: 'v1', readAt: new Date(START), error: null });
    expect(await reading.get()).toMatchObject({ value: 'v1' });
    expect(loads).toHaveLength(2);
    loads[1]?.resolve('v2');
    await settle();
    expect(await reading.get()).toEqual({ value: 'v2', readAt: new Date(START + 60_000), error: null });
  });

  it('waits for a read that something changed after, but not past the cold wait', async () => {
    const { reading, clock, loads } = slowReading();
    const first = reading.get();
    loads[0]?.resolve('v1');
    await first;
    clock.advance(1_000);
    const changedAt = new Date(START + 500);
    const waiting = reading.get(changedAt);
    loads[1]?.resolve('v2');
    expect(await waiting).toMatchObject({ value: 'v2' });
    clock.advance(1_000);
    expect(await reading.get(new Date(START + 1_500))).toMatchObject({ value: 'v2' });
    expect(loads).toHaveLength(3);
  });

  it('answers the previous value when a read that something changed after outlasts the wait', async () => {
    const { reading, clock, loads } = slowReading();
    const first = reading.get();
    loads[0]?.resolve('old');
    await first;
    clock.advance(1_000);
    expect(await reading.get(new Date(START + 500))).toMatchObject({ value: 'old' });
  });

  it('keeps a failed first read as an error with no value, and tries again once the interval has passed', async () => {
    const { reading, clock, loads } = slowReading();
    const first = reading.get();
    loads[0]?.reject(new Error('offline'));
    expect(await first).toEqual({ value: null, readAt: null, error: 'offline' });
    expect(await reading.get()).toMatchObject({ error: 'offline' });
    expect(loads).toHaveLength(1);
    clock.advance(60_000);
    await reading.get();
    expect(loads).toHaveLength(2);
  });
});
