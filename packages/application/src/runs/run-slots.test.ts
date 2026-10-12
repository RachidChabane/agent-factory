import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AgentHarness, AgentRunResult } from '../ports.ts';
import { InvalidRunSlotCapacityError, RunSlots, RunSlotWaitAbortedError, SlottedHarness } from './run-slots.ts';
import { runResult } from '../audit/testing/fakes.ts';
import { agentRunRequest } from './test-support.ts';

const NEVER = new AbortController().signal;

function settled<T>(promise: Promise<T>): { readonly done: () => boolean } {
  let done = false;
  void promise.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  return { done: () => done };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('run slots', () => {
  it('grants slots up to the capacity, then queues in arrival order', async () => {
    const slots = new RunSlots(2);
    const first = await slots.acquire(NEVER);
    await slots.acquire(NEVER);
    const order: string[] = [];
    const third = slots.acquire(NEVER).then((release) => {
      order.push('third');
      return release;
    });
    const fourth = slots.acquire(NEVER).then((release) => {
      order.push('fourth');
      return release;
    });
    await flush();
    expect({ running: slots.running, queued: slots.queued }).toEqual({ running: 2, queued: 2 });
    first();
    (await third)();
    await fourth;
    expect(order).toEqual(['third', 'fourth']);
  });

  it('releases a slot once even when the release is called twice', async () => {
    const slots = new RunSlots(1);
    const release = await slots.acquire(NEVER);
    release();
    release();
    expect(slots.running).toBe(0);
  });

  it('lets a waiting run go when its signal aborts', async () => {
    const slots = new RunSlots(1);
    await slots.acquire(NEVER);
    const controller = new AbortController();
    const waiting = slots.acquire(controller.signal);
    controller.abort();
    await expect(waiting).rejects.toBeInstanceOf(RunSlotWaitAbortedError);
    expect(slots.queued).toBe(0);
    await expect(slots.acquire(AbortSignal.abort())).rejects.toBeInstanceOf(RunSlotWaitAbortedError);
  });

  it('wakes waiting runs when the capacity grows', async () => {
    const slots = new RunSlots(1);
    await slots.acquire(NEVER);
    const waiting = settled(slots.acquire(NEVER));
    await flush();
    expect(waiting.done()).toBe(false);
    slots.updateCapacity(2);
    await flush();
    expect(waiting.done()).toBe(true);
    expect(slots.running).toBe(2);
  });

  it('refuses a capacity that is not a positive integer', () => {
    expect(() => new RunSlots(0)).toThrow(InvalidRunSlotCapacityError);
    expect(() => new RunSlots(1.5)).toThrow(InvalidRunSlotCapacityError);
  });

  it('never runs more than the capacity at once, whatever the arrival order (property)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 4 }), fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 12 }), async (capacity, delays) => {
        const slots = new RunSlots(capacity);
        let running = 0;
        let peak = 0;
        await Promise.all(
          delays.map(async (delay) => {
            const release = await slots.acquire(NEVER);
            running += 1;
            peak = Math.max(peak, running);
            for (let tick = 0; tick < delay; tick += 1) await Promise.resolve();
            running -= 1;
            release();
          }),
        );
        expect(peak).toBeLessThanOrEqual(capacity);
        expect(slots.running).toBe(0);
      }),
    );
  });
});

describe('slotted harness', () => {
  it('holds a slot for the duration of the run and frees it even when the run fails', async () => {
    const slots = new RunSlots(1);
    const seen: number[] = [];
    const succeeding: AgentHarness = {
      run: () => {
        seen.push(slots.running);
        return Promise.resolve<AgentRunResult>(runResult({}));
      },
    };
    const failing: AgentHarness = { run: () => Promise.reject(new Error('crashed')) };
    await new SlottedHarness(succeeding, slots).run(agentRunRequest(), () => undefined, NEVER);
    await expect(new SlottedHarness(failing, slots).run(agentRunRequest(), () => undefined, NEVER)).rejects.toThrow('crashed');
    expect(seen).toEqual([1]);
    expect(slots.running).toBe(0);
  });
});
