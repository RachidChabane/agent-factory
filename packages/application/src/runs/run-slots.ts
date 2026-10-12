import type { AgentHarness, AgentRunEvent, AgentRunRequest, AgentRunResult } from '../ports.ts';

export class RunSlotWaitAbortedError extends Error {
  constructor() {
    super('the run was stopped while it waited for a free run slot');
    this.name = 'RunSlotWaitAbortedError';
  }
}

export class InvalidRunSlotCapacityError extends Error {
  constructor(capacity: number) {
    super(`the number of concurrent agent runs must be a positive integer, not ${capacity}`);
    this.name = 'InvalidRunSlotCapacityError';
  }
}

interface Waiter {
  readonly grant: () => void;
  readonly signal: AbortSignal;
  readonly onAbort: () => void;
}

function assertCapacity(capacity: number): number {
  if (!Number.isInteger(capacity) || capacity < 1) throw new InvalidRunSlotCapacityError(capacity);
  return capacity;
}

/**
 * The installation-wide ceiling on agent runs in progress, shared by every project:
 * a run waits, in arrival order, until a slot is free or its signal aborts.
 */
export class RunSlots {
  private capacity: number;
  private inUse = 0;
  private readonly waiting: Waiter[] = [];

  constructor(capacity: number) {
    this.capacity = assertCapacity(capacity);
  }

  get running(): number {
    return this.inUse;
  }

  get queued(): number {
    return this.waiting.length;
  }

  get limit(): number {
    return this.capacity;
  }

  updateCapacity(capacity: number): void {
    this.capacity = assertCapacity(capacity);
    this.grantFreeSlots();
  }

  /** Resolves with the release of the slot once one is free. */
  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(new RunSlotWaitAbortedError());
    if (this.inUse < this.capacity && this.waiting.length === 0) return Promise.resolve(this.take());
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        grant: () => {
          signal.removeEventListener('abort', waiter.onAbort);
          resolve(this.take());
        },
        signal,
        onAbort: () => {
          const index = this.waiting.indexOf(waiter);
          if (index !== -1) this.waiting.splice(index, 1);
          reject(new RunSlotWaitAbortedError());
        },
      };
      signal.addEventListener('abort', waiter.onAbort, { once: true });
      this.waiting.push(waiter);
    });
  }

  private take(): () => void {
    this.inUse += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inUse -= 1;
      this.grantFreeSlots();
    };
  }

  private grantFreeSlots(): void {
    while (this.inUse < this.capacity) {
      const next = this.waiting.shift();
      if (next === undefined) return;
      next.grant();
    }
  }
}

/** Holds one of the installation's run slots for the whole duration of each run. */
export class SlottedHarness implements AgentHarness {
  private readonly inner: AgentHarness;
  private readonly slots: RunSlots;

  constructor(inner: AgentHarness, slots: RunSlots) {
    this.inner = inner;
    this.slots = slots;
  }

  async run(request: AgentRunRequest, onEvent: (event: AgentRunEvent) => void, signal: AbortSignal): Promise<AgentRunResult> {
    const release = await this.slots.acquire(signal);
    try {
      return await this.inner.run(request, onEvent, signal);
    } finally {
      release();
    }
  }
}
