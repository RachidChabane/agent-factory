import { describe, expect, it } from 'vitest';
import { CachedReading, CachedReadings, observedView } from './cached-reading.ts';

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

describe('cached readings', () => {
  it('reads once per interval and stamps each value with its read time', async () => {
    const clock = new ManualClock(START);
    let reads = 0;
    const reading = new CachedReading(() => Promise.resolve((reads += 1)), 60_000, clock);
    expect(await reading.get()).toEqual({ value: 1, readAt: new Date(START), error: null });
    clock.advance(30_000);
    expect((await reading.get()).value).toBe(1);
    clock.advance(30_000);
    expect(await reading.get()).toEqual({ value: 2, readAt: new Date(START + 60_000), error: null });
  });

  it('keeps the previous value and its time when a read fails, and says why', async () => {
    const clock = new ManualClock(START);
    let fail = false;
    const reading = new CachedReading(() => (fail ? Promise.reject(new Error('the forge did not answer')) : Promise.resolve('main')), 1_000, clock);
    await reading.get();
    fail = true;
    clock.advance(5_000);
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
});
