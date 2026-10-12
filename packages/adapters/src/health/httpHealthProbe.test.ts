import { describe, expect, it } from 'vitest';
import { FIRST_RETRY_DELAY_MS, HttpHealthProbe, MAX_RETRY_DELAY_MS, isHealthyStatus, type FetchFunction } from './httpHealthProbe.ts';

const STATUS_BY_URL: Readonly<Record<string, number>> = {
  'https://prep.example/ok': 200,
  'https://prep.example/redirect': 302,
  'https://prep.example/down': 503,
  'https://prep.example/missing': 404,
};

const fakeFetch: FetchFunction = (url) => {
  const status = STATUS_BY_URL[url];
  if (status === undefined) return Promise.reject(new Error('connection refused'));
  return Promise.resolve({ status });
};

describe('HttpHealthProbe', () => {
  it('passes on 2xx and 3xx and fails on 4xx, 5xx and network errors', async () => {
    const probe = new HttpHealthProbe({
      fetchFunction: fakeFetch,
      wakeUpBudgetMs: 0,
      targets: [
        { name: 'ok', url: 'https://prep.example/ok' },
        { name: 'redirect', url: 'https://prep.example/redirect' },
        { name: 'down', url: 'https://prep.example/down' },
        { name: 'missing', url: 'https://prep.example/missing' },
        { name: 'unreachable', url: 'https://prep.example/unreachable' },
      ],
    });
    expect(await probe.check()).toEqual([
      { name: 'ok', passed: true, detail: 'HTTP 200' },
      { name: 'redirect', passed: true, detail: 'HTTP 302' },
      { name: 'down', passed: false, detail: 'HTTP 503' },
      { name: 'missing', passed: false, detail: 'HTTP 404' },
      { name: 'unreachable', passed: false, detail: 'connection refused' },
    ]);
  });

  it('classifies the status boundaries', () => {
    expect([199, 200, 399, 400].map(isHealthyStatus)).toEqual([false, true, true, false]);
  });

  it('waits for a waking environment and passes once it answers', async () => {
    const statuses = [503, 502, 200];
    const delays: number[] = [];
    let clock = 0;
    const probe = new HttpHealthProbe({
      targets: [{ name: 'prep', url: 'https://prep.example/healthz' }],
      fetchFunction: () => Promise.resolve({ status: statuses.shift() ?? 200 }),
      sleep: (milliseconds) => {
        delays.push(milliseconds);
        clock += milliseconds;
        return Promise.resolve();
      },
      now: () => clock,
    });
    expect(await probe.check()).toEqual([{ name: 'prep', passed: true, detail: 'HTTP 200 after 2 retries while the environment woke up' }]);
    expect(delays).toEqual([FIRST_RETRY_DELAY_MS, FIRST_RETRY_DELAY_MS * 2]);
  });

  it('fails when the environment is still waking at the end of the budget', async () => {
    let clock = 0;
    const probe = new HttpHealthProbe({
      targets: [{ name: 'prep', url: 'https://prep.example/healthz' }],
      fetchFunction: () => Promise.resolve({ status: 503 }),
      wakeUpBudgetMs: 60_000,
      sleep: (milliseconds) => {
        expect(milliseconds).toBeLessThanOrEqual(MAX_RETRY_DELAY_MS);
        clock += milliseconds;
        return Promise.resolve();
      },
      now: () => clock,
    });
    const [result] = await probe.check();
    expect(result?.passed).toBe(false);
    expect(result?.detail).toMatch(/^HTTP 503 after \d+ retries/);
    expect(clock).toBeLessThanOrEqual(60_000);
  });

  it('does not retry a definitive failure', async () => {
    let calls = 0;
    const probe = new HttpHealthProbe({
      targets: [{ name: 'prep', url: 'https://prep.example/missing' }],
      fetchFunction: () => {
        calls += 1;
        return Promise.resolve({ status: 404 });
      },
      sleep: () => Promise.resolve(),
    });
    expect(await probe.check()).toEqual([{ name: 'prep', passed: false, detail: 'HTTP 404' }]);
    expect(calls).toBe(1);
  });
});
