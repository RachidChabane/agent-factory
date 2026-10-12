import { describe, expect, it } from 'vitest';
import { InMemoryEventStore } from '../audit/testing/fakes.ts';
import { FakeHealthProbe, type HealthCheckResult } from '../release/health-probe.ts';
import { SteppingClock } from '../runs/test-support.ts';
import { HEALTH_SAMPLED_EVENT } from './health-events.ts';
import { HealthMonitor, UnknownHealthEnvironmentError } from './health-monitor.ts';
import { healthSamplesSince } from './health-samples.ts';

const START = new Date('2026-10-12T08:00:00.000Z');
const MINUTE_MS = 60_000;
const HOME: HealthCheckResult = { name: 'home', url: 'https://staging.example.com/', passed: true, statusCode: 200, latencyMs: 120, detail: 'HTTP 200' };
const API: HealthCheckResult = { name: 'api', url: 'https://staging.example.com/api/health', passed: false, statusCode: 503, latencyMs: 40, detail: 'HTTP 503' };

function setup() {
  const clock = new SteppingClock(START);
  const events = new InMemoryEventStore(clock);
  const monitor = new HealthMonitor(
    { events, clock },
    { environments: [{ environment: 'staging', probe: new FakeHealthProbe([HOME, API]) }], intervalMs: 5 * MINUTE_MS },
  );
  return { events, clock, monitor };
}

describe('health monitor', () => {
  it('records one sample per check, then waits for the interval', async () => {
    const { events, clock, monitor } = setup();
    expect(await monitor.sampleIfDue()).toBe(2);
    clock.set(new Date(START.getTime() + 4 * MINUTE_MS));
    expect(await monitor.sampleIfDue()).toBe(0);
    clock.set(new Date(START.getTime() + 5 * MINUTE_MS));
    expect(await monitor.sampleIfDue()).toBe(2);
    expect(events.typesOf('health/')).toEqual([HEALTH_SAMPLED_EVENT, HEALTH_SAMPLED_EVENT, HEALTH_SAMPLED_EVENT, HEALTH_SAMPLED_EVENT]);
  });

  it('samples one environment on demand and names the environments that have checks otherwise', async () => {
    const { monitor } = setup();
    expect(await monitor.sampleEnvironment('staging')).toBe(2);
    await expect(monitor.sampleEnvironment('live')).rejects.toBeInstanceOf(UnknownHealthEnvironmentError);
    await expect(monitor.sampleEnvironment('live')).rejects.toThrow('checks exist for staging');
  });

  it('groups the samples by environment and check, oldest first', async () => {
    const { events, clock, monitor } = setup();
    await monitor.sampleIfDue();
    clock.set(new Date(START.getTime() + 10 * MINUTE_MS));
    await monitor.sampleIfDue();
    const samples = healthSamplesSince(events.records, new Date(0));
    expect(samples.get('staging')?.get('home')?.map((sample) => sample.ok)).toEqual([true, true]);
    expect(samples.get('staging')?.get('api')?.[0]).toMatchObject({ ok: false, statusCode: 503, latencyMs: 40 });
    expect(healthSamplesSince(events.records, new Date(START.getTime() + MINUTE_MS)).get('staging')?.get('home')).toHaveLength(1);
  });
});
