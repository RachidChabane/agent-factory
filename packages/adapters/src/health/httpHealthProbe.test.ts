import { describe, expect, it } from 'vitest';
import { FIRST_RETRY_DELAY_MS, HttpHealthProbe, MAX_RETRY_DELAY_MS, isHealthyStatus, type FetchFunction } from './httpHealthProbe.ts';

const STATUS_BY_URL: Readonly<Record<string, number>> = {
  'https://staging.example.com/ok': 200,
  'https://staging.example.com/redirect': 302,
  'https://staging.example.com/down': 503,
  'https://staging.example.com/missing': 404,
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
      now: () => 0,
      targets: [
        { name: 'ok', url: 'https://staging.example.com/ok' },
        { name: 'redirect', url: 'https://staging.example.com/redirect' },
        { name: 'down', url: 'https://staging.example.com/down' },
        { name: 'missing', url: 'https://staging.example.com/missing' },
        { name: 'unreachable', url: 'https://staging.example.com/unreachable' },
      ],
    });
    expect(await probe.check()).toEqual([
      { name: 'ok', url: 'https://staging.example.com/ok', passed: true, statusCode: 200, latencyMs: 0, detail: 'HTTP 200' },
      { name: 'redirect', url: 'https://staging.example.com/redirect', passed: true, statusCode: 302, latencyMs: 0, detail: 'HTTP 302' },
      { name: 'down', url: 'https://staging.example.com/down', passed: false, statusCode: 503, latencyMs: 0, detail: 'HTTP 503' },
      { name: 'missing', url: 'https://staging.example.com/missing', passed: false, statusCode: 404, latencyMs: 0, detail: 'HTTP 404' },
      { name: 'unreachable', url: 'https://staging.example.com/unreachable', passed: false, statusCode: null, latencyMs: null, detail: 'connection refused' },
    ]);
  });

  it('measures how long the environment took to answer', async () => {
    let clock = 1_000;
    const probe = new HttpHealthProbe({
      targets: [{ name: 'home', url: 'https://staging.example.com/ok' }],
      wakeUpBudgetMs: 0,
      fetchFunction: () => {
        clock += 182;
        return Promise.resolve({ status: 200 });
      },
      now: () => clock,
    });
    expect((await probe.check())[0]?.latencyMs).toBe(182);
  });

  it('classifies the status boundaries', () => {
    expect([199, 200, 399, 400].map(isHealthyStatus)).toEqual([false, true, true, false]);
  });

  it('waits for a waking environment and passes once it answers', async () => {
    const statuses = [503, 502, 200];
    const delays: number[] = [];
    let clock = 0;
    const probe = new HttpHealthProbe({
      targets: [{ name: 'staging', url: 'https://staging.example.com/healthz' }],
      fetchFunction: () => Promise.resolve({ status: statuses.shift() ?? 200 }),
      sleep: (milliseconds) => {
        delays.push(milliseconds);
        clock += milliseconds;
        return Promise.resolve();
      },
      now: () => clock,
    });
    expect(await probe.check()).toEqual([
      { name: 'staging', url: 'https://staging.example.com/healthz', passed: true, statusCode: 200, latencyMs: 0, detail: 'HTTP 200 after 2 retries while the environment woke up' },
    ]);
    expect(delays).toEqual([FIRST_RETRY_DELAY_MS, FIRST_RETRY_DELAY_MS * 2]);
  });

  it('fails when the environment is still waking at the end of the budget', async () => {
    let clock = 0;
    const probe = new HttpHealthProbe({
      targets: [{ name: 'staging', url: 'https://staging.example.com/healthz' }],
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
      targets: [{ name: 'staging', url: 'https://staging.example.com/missing' }],
      fetchFunction: () => {
        calls += 1;
        return Promise.resolve({ status: 404 });
      },
      sleep: () => Promise.resolve(),
    });
    expect(await probe.check()).toEqual([expect.objectContaining({ name: 'staging', passed: false, statusCode: 404, detail: 'HTTP 404' })]);
    expect(calls).toBe(1);
  });
});
