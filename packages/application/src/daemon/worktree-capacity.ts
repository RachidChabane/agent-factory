/** Worktrees of the pool that no issue holds. */
export function freeWorktrees(poolSize: number, held: number): number {
  return Math.max(0, poolSize - held);
}

/**
 * Worktrees that pull requests awaiting review, and issues waiting for a person, can hold while
 * `concurrency` issues run at once. Once every worktree is held, no issue starts.
 */
export function worktreesBesideRuns(poolSize: number, concurrency: number): number {
  return Math.max(0, poolSize - concurrency);
}
