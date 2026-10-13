import { z } from 'zod';
import { ISSUE_SUBJECT_PREFIX, issueSubject } from '@agent-factory/domain';
import type { EventStore, FactoryEventRecord } from '../ports.ts';

export const ISSUE_PAUSED_EVENT = 'issue.paused';
export const ISSUE_UNPAUSED_EVENT = 'issue.unpaused';

export const IssuePauseTogglePayloadSchema = z.object({ reason: z.string() });

const FIRST_SEQUENCE = 0;
const ISSUE_NUMBER_PATTERN = new RegExp(`^${ISSUE_SUBJECT_PREFIX}(\\d+)$`);

/** The issues these records show paused by the operator. */
export function pausedIssuesIn(records: readonly FactoryEventRecord[]): ReadonlySet<number> {
  const paused = new Set<number>();
  for (const record of records) {
    if (record.type !== ISSUE_PAUSED_EVENT && record.type !== ISSUE_UNPAUSED_EVENT) continue;
    const issueNumber = Number(ISSUE_NUMBER_PATTERN.exec(record.subject)?.[1]);
    if (!Number.isInteger(issueNumber)) continue;
    if (record.type === ISSUE_PAUSED_EVENT) paused.add(issueNumber);
    else paused.delete(issueNumber);
  }
  return paused;
}

export async function pausedIssues(events: EventStore): Promise<ReadonlySet<number>> {
  return pausedIssuesIn(await events.read(ISSUE_SUBJECT_PREFIX, FIRST_SEQUENCE));
}

export async function setIssuePaused(events: EventStore, issueNumber: number, paused: boolean, reason: string): Promise<number> {
  const record = await events.append(paused ? ISSUE_PAUSED_EVENT : ISSUE_UNPAUSED_EVENT, issueSubject(issueNumber), { reason });
  return record.sequence;
}
