import type { Clock, Sleeper } from '@agent-factory/application';

const START = new Date('2026-01-01T00:00:00.000Z');

/** A clock that moves only when something sleeps, so a wait of any length takes no time. */
export class FakeTime implements Clock, Sleeper {
  readonly sleeps: number[] = [];
  private readonly startedAt: number;
  private elapsedMs = 0;

  constructor(start: Date = START) {
    this.startedAt = start.getTime();
  }

  now(): Date {
    return new Date(this.startedAt + this.elapsedMs);
  }

  sleep(milliseconds: number): Promise<void> {
    this.sleeps.push(milliseconds);
    this.elapsedMs += milliseconds;
    return Promise.resolve();
  }

  elapsed(): number {
    return this.elapsedMs;
  }
}
