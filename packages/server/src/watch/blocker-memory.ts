import type { Blocker } from './blocker.ts';

/** A blocker the watch reported, and the time of the reading at which it first did. */
export interface ReportedBlocker {
  readonly blocker: Blocker;
  readonly reportedAt: Date;
}

/**
 * What the watches of an installation reported and have not seen clear. A watch compares its first reading with it, so a
 * watch that restarts repeats nothing it already said and prints only what appeared or cleared in between.
 */
export interface BlockerMemory {
  recall(): Promise<readonly ReportedBlocker[]>;
  remember(reported: readonly ReportedBlocker[]): Promise<void>;
}
