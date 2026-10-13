import { MERGEABLE_STATES } from '../pipeline/mergeable-states.ts';
import type { PipelineJournal } from '../pipeline/pipeline-journal.ts';

/** Whether the factory's pull request of the issue is open and waits for its merge, with no new cycle running on it. */
export function isAwaitingMerge(journal: PipelineJournal): boolean {
  return journal.pullRequest !== null && journal.mergeSha === null && journal.evidenceRemoval === null && journal.state !== null && MERGEABLE_STATES.includes(journal.state);
}
