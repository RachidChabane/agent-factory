import { IssueJournalWriter } from './journal-writer.ts';
import { PIPELINE_EVENTS } from './journal-events.ts';
import { issueOfPullRequest, MERGEABLE_STATES } from './merge-on-order.ts';
import type { PipelineDependencies } from './pipeline-dependencies.ts';
import { PullRequestNotFromFactoryError } from './pipeline-errors.ts';
import { loadJournal } from './pipeline-journal.ts';

export type ExternalMergeDependencies = Pick<PipelineDependencies, 'events' | 'states' | 'pool'>;

export interface ExternalMergeOutcome {
  readonly issueNumber: number;
  readonly pullRequestNumber: number;
  readonly mergeSha: string;
}

async function factoryIssueOf(dependencies: ExternalMergeDependencies, pullRequestNumber: number): Promise<number | null> {
  try {
    return await issueOfPullRequest(dependencies.events, pullRequestNumber);
  } catch (error) {
    if (error instanceof PullRequestNotFromFactoryError) return null;
    throw error;
  }
}

export async function recordExternalMerge(
  dependencies: ExternalMergeDependencies,
  pullRequestNumber: number,
  mergeSha: string,
): Promise<ExternalMergeOutcome | null> {
  const { events, states, pool } = dependencies;
  const issueNumber = await factoryIssueOf(dependencies, pullRequestNumber);
  if (issueNumber === null) return null;
  const journal = await loadJournal(events, issueNumber);
  if (journal.mergeSha !== null || journal.state === null || !MERGEABLE_STATES.includes(journal.state)) return null;
  const writer = new IssueJournalWriter(events, states, issueNumber);
  const reason = `pull request #${pullRequestNumber} was merged outside the factory as ${mergeSha}`;
  if (journal.state === 'pr-open') await writer.transition('ci', reason);
  if (journal.state === 'pr-open' || journal.state === 'ci') await writer.transition('ready-to-merge', reason);
  await writer.record(PIPELINE_EVENTS.pullRequestMerged, { mergeSha });
  await writer.transition('merged', reason);
  if (journal.worktree !== null) {
    await pool.release(journal.worktree);
    await writer.record(PIPELINE_EVENTS.worktreeReleased, { path: journal.worktree.path });
  }
  return { issueNumber, pullRequestNumber, mergeSha };
}
