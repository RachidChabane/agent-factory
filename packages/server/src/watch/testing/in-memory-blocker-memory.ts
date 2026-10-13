import type { BlockerMemory, ReportedBlocker } from '../blocker-memory.ts';

/** A memory that keeps what the watch records in the process, and counts how often it was recorded. */
export class InMemoryBlockerMemory implements BlockerMemory {
  reported: readonly ReportedBlocker[];
  recordings = 0;

  constructor(reported: readonly ReportedBlocker[] = []) {
    this.reported = reported;
  }

  recall(): Promise<readonly ReportedBlocker[]> {
    return Promise.resolve(this.reported);
  }

  remember(reported: readonly ReportedBlocker[]): Promise<void> {
    this.reported = reported;
    this.recordings += 1;
    return Promise.resolve();
  }
}
