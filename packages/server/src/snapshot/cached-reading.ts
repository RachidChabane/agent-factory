import type { Clock } from '@agent-factory/application';

/** The last value read from outside the factory's log, when it was read, and why the latest attempt failed if it did. */
export interface Observed<Value> {
  readonly value: Value | null;
  readonly readAt: Date | null;
  readonly error: string | null;
}

export const NEVER_READ: Observed<never> = { value: null, readAt: null, error: null };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reads a value at most once per interval. A failed read keeps the previous value and its read
 * time, and records the failure, so a reader can tell an old value from a current one.
 */
export class CachedReading<Value> {
  private readonly read: () => Promise<Value>;
  private readonly intervalMs: number;
  private readonly clock: Clock;
  private observed: Observed<Value> = NEVER_READ;
  private attemptedAt: number | null = null;
  private inFlight: Promise<Observed<Value>> | null = null;

  constructor(read: () => Promise<Value>, intervalMs: number, clock: Clock) {
    this.read = read;
    this.intervalMs = intervalMs;
    this.clock = clock;
  }

  /** The cached value, read again first when the interval has passed or when it was read before `changedAt`. */
  get(changedAt: Date | null = null): Promise<Observed<Value>> {
    const now = this.clock.now().getTime();
    const fresh = this.attemptedAt !== null && now - this.attemptedAt < this.intervalMs;
    const outdated = changedAt !== null && (this.attemptedAt === null || this.attemptedAt < changedAt.getTime());
    if (fresh && !outdated) return Promise.resolve(this.observed);
    return this.refresh();
  }

  /** Reads now, whatever the interval. Concurrent callers share one read. */
  refresh(): Promise<Observed<Value>> {
    if (this.inFlight !== null) return this.inFlight;
    this.inFlight = this.attempt().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async attempt(): Promise<Observed<Value>> {
    this.attemptedAt = this.clock.now().getTime();
    try {
      const value = await this.read();
      this.observed = { value, readAt: this.clock.now(), error: null };
    } catch (error) {
      this.observed = { ...this.observed, error: message(error) };
    }
    return this.observed;
  }
}

/** One cached reading per key, created on first use. */
export class CachedReadings<Key, Value> {
  private readonly readings = new Map<Key, CachedReading<Value>>();
  private readonly read: (key: Key) => Promise<Value>;
  private readonly intervalMs: number;
  private readonly clock: Clock;

  constructor(read: (key: Key) => Promise<Value>, intervalMs: number, clock: Clock) {
    this.read = read;
    this.intervalMs = intervalMs;
    this.clock = clock;
  }

  get(key: Key): Promise<Observed<Value>> {
    let reading = this.readings.get(key);
    if (reading === undefined) {
      reading = new CachedReading(() => this.read(key), this.intervalMs, this.clock);
      this.readings.set(key, reading);
    }
    return reading.get();
  }
}

export function observedView<Value, View>(observed: Observed<Value>, view: (value: Value) => View): { readonly value: View | null; readonly readAt: string | null; readonly error: string | null } {
  return { value: observed.value === null ? null : view(observed.value), readAt: observed.readAt?.toISOString() ?? null, error: observed.error };
}
