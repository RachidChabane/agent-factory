import { ISSUE_SUBJECT_PREFIX } from '@agent-factory/domain';
import type { EventStore, FactoryEventRecord } from '../ports.ts';
import { projectJournal, type PipelineJournal } from '../pipeline/pipeline-journal.ts';

const FIRST_SEQUENCE = 0;
const ISSUE_NUMBER_PATTERN = new RegExp(`^${ISSUE_SUBJECT_PREFIX}(\\d+)$`);

export async function heldWorktrees(events: EventStore): Promise<number> {
  const journals = issueJournalsOf(await events.read(ISSUE_SUBJECT_PREFIX, FIRST_SEQUENCE));
  return [...journals.values()].filter((journal) => journal.worktree !== null).length;
}

export function issueJournalsOf(records: readonly FactoryEventRecord[]): ReadonlyMap<number, PipelineJournal> {
  const numbers = new Set(records.map((record) => Number(ISSUE_NUMBER_PATTERN.exec(record.subject)?.[1])).filter(Number.isInteger));
  return new Map([...numbers].map((number) => [number, projectJournal(number, records)]));
}
