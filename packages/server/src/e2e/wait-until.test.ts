import { describe, expect, it } from 'vitest';
import { ExpectationFailed } from './expectations.ts';
import { FakeTime } from './testing/fake-time.ts';
import { failed, ready, waiting, waitUntil, type Poll, type WaitSettings } from './wait-until.ts';

const INTERVAL_MS = 1_000;
const TIMEOUT_MS = 5_000;

function settingsOn(time: FakeTime, signal: AbortSignal = new AbortController().signal): WaitSettings {
  return { what: 'the checks', timeoutMs: TIMEOUT_MS, intervalMs: INTERVAL_MS, clock: time, sleeper: time, signal };
}

function looks(polls: readonly Poll<string>[]): { look: () => Promise<Poll<string>>; count: () => number } {
  let taken = 0;
  return {
    look: () => {
      const poll = polls[Math.min(taken, polls.length - 1)];
      taken += 1;
      return Promise.resolve(poll ?? waiting('nothing'));
    },
    count: () => taken,
  };
}

describe('waitUntil', () => {
  it('returns what is ready at the first look without sleeping', async () => {
    const time = new FakeTime();
    const { look } = looks([ready('done')]);
    await expect(waitUntil(settingsOn(time), look)).resolves.toBe('done');
    expect(time.sleeps).toEqual([]);
  });

  it('looks once per interval until the thing is ready', async () => {
    const time = new FakeTime();
    const { look, count } = looks([waiting('first'), waiting('second'), waiting('third'), ready('done')]);
    await expect(waitUntil(settingsOn(time), look)).resolves.toBe('done');
    expect(count()).toBe(4);
    expect(time.sleeps).toEqual([INTERVAL_MS, INTERVAL_MS, INTERVAL_MS]);
  });

  it('ends at once, with its reason, when a look fails', async () => {
    const time = new FakeTime();
    const { look, count } = looks([waiting('first'), failed('the gate failed at unit')]);
    const outcome = waitUntil(settingsOn(time), look);
    await expect(outcome).rejects.toBeInstanceOf(ExpectationFailed);
    await expect(outcome).rejects.toThrow('found:    the gate failed at unit');
    expect(count()).toBe(2);
  });

  it('gives up at the timeout and says what it saw last', async () => {
    const time = new FakeTime();
    const { look, count } = looks([waiting('no outcome file yet')]);
    const outcome = waitUntil(settingsOn(time), look);
    await expect(outcome).rejects.toThrow('waiting for the checks');
    await expect(outcome).rejects.toThrow('it to happen within 5.0 s');
    await expect(outcome).rejects.toThrow('still waiting: no outcome file yet');
    expect(count()).toBe(TIMEOUT_MS / INTERVAL_MS + 1);
    expect(time.elapsed()).toBe(TIMEOUT_MS);
  });

  it('stops looking once the run is interrupted', async () => {
    const time = new FakeTime();
    const interruption = new AbortController();
    interruption.abort();
    const { look, count } = looks([ready('done')]);
    await expect(waitUntil(settingsOn(time, interruption.signal), look)).rejects.toThrow('the run was interrupted');
    expect(count()).toBe(0);
  });
});
