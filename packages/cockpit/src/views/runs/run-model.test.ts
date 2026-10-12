import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../i18n/formatters.ts';
import { TEST_NOW } from '../../test/harness.tsx';
import { attemptNumber, canResumeRun, canStopRun, describeTiming, isCostPending, isIssueRun, outcomeTone } from './run-model.ts';
import { aRun } from './run-test-support.ts';

const minutesAgo = (minutes: number) => new Date(TEST_NOW - minutes * MINUTE_MS).toISOString();

describe('canStopRun', () => {
  it.each([
    ['running', true],
    ['waiting', true],
    ['succeeded', false],
    ['failed', false],
    ['stopped', false],
  ] as const)('is %s for a %s run', (status, expected) => {
    expect(canStopRun({ status })).toBe(expected);
  });
});

describe('isIssueRun', () => {
  it('holds for the run of an issue and for no other subject', () => {
    expect(isIssueRun({ subject: { kind: 'issue', id: '45' } })).toBe(true);
    for (const kind of ['request', 'audit', 'release'] as const) expect(isIssueRun({ subject: { kind, id: 'x' } })).toBe(false);
  });
});

describe('canResumeRun', () => {
  it('holds for a stopped or failed run of an issue', () => {
    expect(canResumeRun({ status: 'stopped', subject: { kind: 'issue', id: '64' } })).toBe(true);
    expect(canResumeRun({ status: 'failed', subject: { kind: 'issue', id: '49' } })).toBe(true);
  });

  it('does not hold for a run that is going, that succeeded, or whose subject is not an issue', () => {
    expect(canResumeRun({ status: 'running', subject: { kind: 'issue', id: '45' } })).toBe(false);
    expect(canResumeRun({ status: 'waiting', subject: { kind: 'issue', id: '49' } })).toBe(false);
    expect(canResumeRun({ status: 'succeeded', subject: { kind: 'issue', id: '58' } })).toBe(false);
    expect(canResumeRun({ status: 'failed', subject: { kind: 'request', id: 'R-18' } })).toBe(false);
    expect(canResumeRun({ status: 'failed', subject: { kind: 'audit', id: 'abc' } })).toBe(false);
    expect(canResumeRun({ status: 'stopped', subject: { kind: 'release', id: '1.8.2' } })).toBe(false);
  });
});

describe('isCostPending', () => {
  it('holds while a run is live and has reported no cost', () => {
    expect(isCostPending({ status: 'running', costUsd: 0 })).toBe(true);
    expect(isCostPending({ status: 'waiting', costUsd: 0 })).toBe(true);
  });

  it('does not hold once the cost is known, nor for a run that ended', () => {
    expect(isCostPending({ status: 'running', costUsd: 0.0154 })).toBe(false);
    expect(isCostPending({ status: 'succeeded', costUsd: 0 })).toBe(false);
  });
});

describe('attemptNumber', () => {
  it('counts attempts from one, as the factory numbers them from zero', () => {
    expect(attemptNumber({ attempt: 0 })).toBe(1);
    expect(attemptNumber({ attempt: 3 })).toBe(4);
  });
});

describe('outcomeTone', () => {
  it('shows success as such, a question as waiting, a manual stop as blocked and every other end as a failure', () => {
    expect(outcomeTone('success')).toBe('success');
    expect(outcomeTone('decision-requested')).toBe('waiting');
    expect(outcomeTone('aborted')).toBe('blocked');
    for (const outcome of ['max-turns', 'budget-exceeded', 'error', 'timeout'] as const) expect(outcomeTone(outcome)).toBe('failed');
  });
});

describe('describeTiming', () => {
  it('counts a running run up to now', () => {
    const run = aRun({ status: 'running', startedAt: minutesAgo(14), endedAt: null });
    expect(describeTiming(run, TEST_NOW)).toEqual({ kind: 'running', elapsedMs: 14 * MINUTE_MS });
  });

  it('fixes the duration of a run that ended', () => {
    const run = aRun({ startedAt: minutesAgo(90), endedAt: minutesAgo(30) });
    expect(describeTiming(run, TEST_NOW)).toEqual({ kind: 'ended', elapsedMs: 60 * MINUTE_MS, endedAt: minutesAgo(30) });
  });

  it('stops counting when the agent asks a question, and says when it asked', () => {
    const run = aRun({
      status: 'waiting',
      startedAt: minutesAgo(60),
      endedAt: minutesAgo(21),
      pendingQuestion: { id: 'q', text: 'Which one?', options: [], askedAt: minutesAgo(21) },
    });
    expect(describeTiming(run, TEST_NOW)).toEqual({ kind: 'waiting', elapsedMs: 39 * MINUTE_MS, since: minutesAgo(21) });
  });

  it('keeps counting a waiting run that has neither an end nor a question time', () => {
    const run = aRun({ status: 'waiting', startedAt: minutesAgo(10), endedAt: null, pendingQuestion: null });
    expect(describeTiming(run, TEST_NOW)).toEqual({ kind: 'waiting', elapsedMs: 10 * MINUTE_MS, since: null });
  });

  it('does not invent a duration for a run that ended without recording when', () => {
    const run = aRun({ status: 'stopped', endedAt: null });
    expect(describeTiming(run, TEST_NOW)).toEqual({ kind: 'unknown-end' });
  });
});
