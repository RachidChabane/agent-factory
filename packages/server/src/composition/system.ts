import { randomUUID } from 'node:crypto';
import type { Clock, IdGenerator, Sleeper } from '@agent-factory/application';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class RandomRunIds implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}

const ABORT_EVENT = 'abort';

export class SystemSleeper implements Sleeper {
  sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        signal.removeEventListener(ABORT_EVENT, done);
        resolve();
      };
      const timer = setTimeout(done, milliseconds);
      signal.addEventListener(ABORT_EVENT, done, { once: true });
    });
  }
}
