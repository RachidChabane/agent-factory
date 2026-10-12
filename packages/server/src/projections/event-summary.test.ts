import { describe, expect, it } from 'vitest';
import { summarizeEvent } from './event-summary.ts';

describe('the one-line summary of an event', () => {
  it('names the issues that wait for a worktree, and says when a worktree is free again', () => {
    expect(summarizeEvent({ type: 'scheduler.worktrees-full', subject: 'daemon', payload: { poolSize: 3, waiting: [14, 15], holders: [] } })).toBe(
      '#14, #15 wait: every worktree of the pool is held',
    );
    expect(summarizeEvent({ type: 'scheduler.worktrees-free', subject: 'daemon', payload: {} })).toBe('a worktree is free again');
  });

  it('describes an event of an unknown kind by its type and subject', () => {
    expect(summarizeEvent({ type: 'something.else', subject: 'issue/4', payload: null })).toBe('something.else on issue/4');
  });
});
