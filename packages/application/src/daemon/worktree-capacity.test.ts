import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { freeWorktrees, worktreesBesideRuns } from './worktree-capacity.ts';

describe('the capacity of the worktree pool', () => {
  it('counts the worktrees no issue holds, never below zero', () => {
    expect(freeWorktrees(5, 2)).toBe(3);
    expect(freeWorktrees(3, 3)).toBe(0);
    expect(freeWorktrees(3, 4)).toBe(0);
  });

  it('counts what pull requests and escalated issues can hold beside the issues that run at once', () => {
    expect(worktreesBesideRuns(5, 1)).toBe(4);
    expect(worktreesBesideRuns(5, 3)).toBe(2);
    expect(worktreesBesideRuns(3, 3)).toBe(0);
  });

  it('splits the pool between the worktrees held and the free ones', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 0, max: 30 }), (size, held) => freeWorktrees(size, held) + Math.min(held, size) === size),
    );
  });

  it('leaves exactly the pool minus the concurrency for what waits beside the runs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 20 }), (size, concurrency) => {
        const beside = worktreesBesideRuns(size, concurrency);
        return concurrency > size ? beside === 0 : beside + concurrency === size;
      }),
    );
  });
});
