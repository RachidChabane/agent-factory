import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../i18n/formatters.ts';
import { TEST_NOW } from '../test/harness.tsx';
import { currentLimits, effectiveFreshness, latestReadFailed, limitTone } from './usage.ts';

const minutesFromNow = (minutes: number) => new Date(TEST_NOW + minutes * MINUTE_MS).toISOString();

const READ_AT = '2026-10-12T09:00:00.000Z';
const BEFORE = '2026-10-12T08:00:00.000Z';
const AFTER = '2026-10-12T09:30:00.000Z';

describe('latestReadFailed', () => {
  it('holds only when the failure is more recent than the last successful read', () => {
    expect(latestReadFailed({ readAt: READ_AT, lastFailure: { at: AFTER, reason: 'timed out' } })).toBe(true);
    expect(latestReadFailed({ readAt: READ_AT, lastFailure: { at: BEFORE, reason: 'timed out' } })).toBe(false);
  });

  it('holds for an account that never read anything and failed', () => {
    expect(latestReadFailed({ readAt: null, lastFailure: { at: BEFORE, reason: 'no report' } })).toBe(true);
  });

  it('does not hold without any failure', () => {
    expect(latestReadFailed({ readAt: READ_AT, lastFailure: null })).toBe(false);
    expect(latestReadFailed({ readAt: null, lastFailure: null })).toBe(false);
  });
});

describe('currentLimits', () => {
  it('keeps the limits whose utilization is still current', () => {
    const limits = [
      { kind: 'session' as const, scope: null, utilization: 0.4, resetsAt: minutesFromNow(30), freshness: 'fresh' as const, pauseAt: 0.9 },
      { kind: 'weekly_all' as const, scope: null, utilization: 0.6, resetsAt: minutesFromNow(30), freshness: 'stale' as const, pauseAt: 0.85 },
      { kind: 'weekly_scoped' as const, scope: 'model', utilization: 0.3, resetsAt: BEFORE, freshness: 'window-reset' as const, pauseAt: 0.85 },
    ];
    expect(currentLimits({ limits }, TEST_NOW).map((limit) => limit.kind)).toEqual(['session']);
  });

  it('drops a limit the snapshot calls fresh once its window has been reset since', () => {
    const limits = [
      { kind: 'session' as const, scope: null, utilization: 0.4, resetsAt: minutesFromNow(-5), freshness: 'fresh' as const, pauseAt: 0.9 },
      { kind: 'weekly_all' as const, scope: null, utilization: 0.6, resetsAt: minutesFromNow(60), freshness: 'fresh' as const, pauseAt: 0.85 },
    ];
    expect(currentLimits({ limits }, TEST_NOW).map((limit) => limit.kind)).toEqual(['weekly_all']);
  });
});

describe('effectiveFreshness', () => {
  it('keeps the freshness the snapshot reports while the window is still open', () => {
    expect(effectiveFreshness({ freshness: 'fresh', resetsAt: minutesFromNow(30) }, TEST_NOW)).toBe('fresh');
    expect(effectiveFreshness({ freshness: 'stale', resetsAt: minutesFromNow(30) }, TEST_NOW)).toBe('stale');
    expect(effectiveFreshness({ freshness: 'fresh', resetsAt: null }, TEST_NOW)).toBe('fresh');
  });

  it('keeps a window the snapshot reports as reset, whatever its reset time says', () => {
    expect(effectiveFreshness({ freshness: 'window-reset', resetsAt: minutesFromNow(30) }, TEST_NOW)).toBe('window-reset');
    expect(effectiveFreshness({ freshness: 'window-reset', resetsAt: null }, TEST_NOW)).toBe('window-reset');
  });

  it('turns a fresh or stale reading into a reset window once its reset time has passed', () => {
    expect(effectiveFreshness({ freshness: 'fresh', resetsAt: minutesFromNow(-1) }, TEST_NOW)).toBe('window-reset');
    expect(effectiveFreshness({ freshness: 'stale', resetsAt: minutesFromNow(0) }, TEST_NOW)).toBe('window-reset');
  });
});

describe('limitTone', () => {
  it('is red at the utilization where the factory pauses and above', () => {
    expect(limitTone({ utilization: 0.9, pauseAt: 0.9 })).toBe('failed');
    expect(limitTone({ utilization: 0.95, pauseAt: 0.9 })).toBe('failed');
  });

  it('is amber when close to the pause threshold and green below', () => {
    expect(limitTone({ utilization: 0.8, pauseAt: 0.9 })).toBe('running');
    expect(limitTone({ utilization: 0.5, pauseAt: 0.9 })).toBe('success');
  });
});
