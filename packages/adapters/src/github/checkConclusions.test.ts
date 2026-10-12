import { describe, expect, it } from 'vitest';
import { checkRunDuration, forgePullRequestState } from './checkConclusions.ts';

describe('what the forge says of a check run and a pull request', () => {
  it('times a finished check run from its start to its end', () => {
    expect(checkRunDuration('2026-10-12T09:00:00Z', '2026-10-12T09:01:24Z')).toBe(84_000);
  });

  it('gives no duration to a run still going, to one without a start, or to times that make no sense', () => {
    expect(checkRunDuration('2026-10-12T09:00:00Z', null)).toBeNull();
    expect(checkRunDuration(null, '2026-10-12T09:01:24Z')).toBeNull();
    expect(checkRunDuration('2026-10-12T09:01:24Z', '2026-10-12T09:00:00Z')).toBeNull();
    expect(checkRunDuration('not a time', '2026-10-12T09:00:00Z')).toBeNull();
  });

  it('tells a merged pull request from one closed without a merge', () => {
    expect(forgePullRequestState('open', null)).toBe('open');
    expect(forgePullRequestState('closed', '2026-10-12T09:00:00Z')).toBe('merged');
    expect(forgePullRequestState('closed', null)).toBe('closed');
  });
});
