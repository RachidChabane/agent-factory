import { describe, expect, it } from 'vitest';
import { drainEffect } from './drain-effect.ts';

describe('what a drain tells the operator it waits for', () => {
  it('says the factory stops at its next tick when nothing is going on', () => {
    expect(drainEffect({ runningIssues: 0, calm: true })).toBe('No new work starts; the factory stops at its next tick');
  });

  it('counts the issues that run', () => {
    expect(drainEffect({ runningIssues: 3, calm: false })).toBe('No new work starts; the factory stops once its 3 running issue(s) finish');
  });

  it('does not promise a stop at the next tick while a film records or an audit, a challenge or a task runs', () => {
    expect(drainEffect({ runningIssues: 0, calm: false })).toBe('No new work starts; the factory stops once its running work finishes');
  });
});
