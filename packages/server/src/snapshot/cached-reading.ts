import type { Clock } from '@agent-factory/application';

/** The last value read from outside the factory's log, when it was read, and why the latest attempt failed if it did. */
export interface Observed<Value> {
  readonly value: Value | null;
  readonly readAt: Date | null;
  readonly error: string | null;
}

export const NEVER_READ: Observed<never> = { value: null, readAt: null, error: null };

/** How long a reading stays fresh: a fixed interval, or one chosen from the last value read, null before any. */
export type ReadInterval<Value> = number | ((last: Value | null) => number);

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** How long a caller waits for a reading nobody has completed yet, or that something changed after, before it answers without it. */
export const COLD_READ_WAIT_MS = 3_000;

/**
 * Reads a value at most once per interval, and never makes a caller wait on the outside for a value it already has:
 * an old value is returned at once, with the time it was read, and read again behind the call. A reading that was
 * never completed, or that something changed after, is waited for, but only up to the cold wait; past it the caller
 * gets what is known, and the read ends in the background. A failed read keeps the previous value and its read time,
 * and records the failure, so a reader can tell an old value from a current one.
 */
export class CachedReading<Value> {
  private readonly read: () => Promise<Value>;
  private readonly interval: ReadInterval<Value>;
  private readonly clock: Clock;
  private readonly coldWaitMs: number;
  private observed: Observed<Value> = NEVER_READ;
  private attemptedAt: number | null = null;
  private settled = false;
  private inFlight: Promise<Observed<Value>> | null = null;

  constructor(read: () => Promise<Value>, interval: ReadInterval<Value>, clock: Clock, coldWaitMs: number = COLD_READ_WAIT_MS) {
    this.read = read;
    this.interval = interval;
    this.clock = clock;
    this.coldWaitMs = coldWaitMs;
  }

  /** The cached value; see the class for when it is read again and whether the caller waits for that. */
  get(changedAt: Date | null = null): Promise<Observed<Value>> {
    if (!this.settled) return this.within(this.refresh());
    const now = this.clock.now().getTime();
    const intervalMs = typeof this.interval === 'number' ? this.interval : this.interval(this.observed.value);
    const fresh = this.attemptedAt !== null && now - this.attemptedAt < intervalMs;
    const outdated = changedAt !== null && (this.attemptedAt === null || this.attemptedAt < changedAt.getTime());
    if (fresh && !outdated) return Promise.resolve(this.observed);
    const refreshing = this.refresh();
    return outdated ? this.within(refreshing) : Promise.resolve(this.observed);
  }

  /** Reads now, whatever the interval, and waits for it. Concurrent callers share one read. */
  refresh(): Promise<Observed<Value>> {
    if (this.inFlight !== null) return this.inFlight;
    this.inFlight = this.attempt().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async within(refreshing: Promise<Observed<Value>>): Promise<Observed<Value>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.coldWaitMs);
    });
    try {
      await Promise.race([refreshing, deadline]);
    } finally {
      clearTimeout(timer);
    }
    return this.observed;
  }

  private async attempt(): Promise<Observed<Value>> {
    this.attemptedAt = this.clock.now().getTime();
    try {
      const value = await this.read();
      this.observed = { value, readAt: this.clock.now(), error: null };
    } catch (error) {
      this.observed = { ...this.observed, error: message(error) };
    }
    this.settled = true;
    return this.observed;
  }
}

/** One cached reading per key, created on first use. */
export class CachedReadings<Key, Value> {
  private readonly readings = new Map<Key, CachedReading<Value>>();
  private readonly read: (key: Key) => Promise<Value>;
  private readonly interval: ReadInterval<Value>;
  private readonly clock: Clock;
  private readonly coldWaitMs: number;

  constructor(read: (key: Key) => Promise<Value>, interval: ReadInterval<Value>, clock: Clock, coldWaitMs: number = COLD_READ_WAIT_MS) {
    this.read = read;
    this.interval = interval;
    this.clock = clock;
    this.coldWaitMs = coldWaitMs;
  }

  get(key: Key): Promise<Observed<Value>> {
    let reading = this.readings.get(key);
    if (reading === undefined) {
      reading = new CachedReading(() => this.read(key), this.interval, this.clock, this.coldWaitMs);
      this.readings.set(key, reading);
    }
    return reading.get();
  }
}

export function observedView<Value, View>(observed: Observed<Value>, view: (value: Value) => View): { readonly value: View | null; readonly readAt: string | null; readonly error: string | null } {
  return { value: observed.value === null ? null : view(observed.value), readAt: observed.readAt?.toISOString() ?? null, error: observed.error };
}
