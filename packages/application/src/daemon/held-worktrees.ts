import { ISSUE_SUBJECT_PREFIX } from '@agent-factory/domain';
import type { IssueState } from '@agent-factory/domain';
import type { EventStore, FactoryEventRecord } from '../ports.ts';
import { projectJournal, type PipelineJournal } from '../pipeline/pipeline-journal.ts';

const FIRST_SEQUENCE = 0;
const ISSUE_NUMBER_PATTERN = new RegExp(`^${ISSUE_SUBJECT_PREFIX}(\\d+)$`);

/** An issue that keeps a worktree of the pool: one that runs, one that waits at its pull request, one that waits for a person. */
export interface WorktreeHolder {
  readonly issueNumber: number;
  readonly state: IssueState | null;
  readonly pullRequestNumber: number | null;
}

export async function worktreeHolders(events: EventStore): Promise<readonly WorktreeHolder[]> {
  const journals = issueJournalsOf(await events.read(ISSUE_SUBJECT_PREFIX, FIRST_SEQUENCE));
  return [...journals.values()]
    .filter((journal) => journal.worktree !== null)
    .map((journal) => ({ issueNumber: journal.issueNumber, state: journal.state, pullRequestNumber: journal.pullRequest?.number ?? null }))
    .sort((left, right) => left.issueNumber - right.issueNumber);
}

export async function heldWorktrees(events: EventStore): Promise<number> {
  return (await worktreeHolders(events)).length;
}

export function issueJournalsOf(records: readonly FactoryEventRecord[]): ReadonlyMap<number, PipelineJournal> {
  const numbers = new Set(records.map((record) => Number(ISSUE_NUMBER_PATTERN.exec(record.subject)?.[1])).filter(Number.isInteger));
  return new Map([...numbers].map((number) => [number, projectJournal(number, records)]));
}
