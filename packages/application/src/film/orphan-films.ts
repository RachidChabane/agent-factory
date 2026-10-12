import { issueSubject } from '@agent-factory/domain';
import { issueJournalsOf } from '../daemon/held-worktrees.ts';
import { PIPELINE_EVENTS } from '../pipeline/journal-events.ts';
import type { EventStore } from '../ports.ts';
import { readIssueRecords } from './film-ledger.ts';

export const ORPHAN_FILM_REASON = 'the factory stopped before the film ended';

/** Fails the films a stopped factory left recording, so that nothing waits for them. */
export async function closeOrphanFilms(events: EventStore): Promise<readonly number[]> {
  const journals = issueJournalsOf(await readIssueRecords(events));
  const closed: number[] = [];
  for (const [issueNumber, journal] of journals) {
    const interrupted = journal.filmOrders.filter((order) => order.status === 'running');
    for (const order of interrupted) {
      await events.append(PIPELINE_EVENTS.filmFailed, issueSubject(issueNumber), { scenario: order.scenario, reason: ORPHAN_FILM_REASON });
    }
    if (interrupted.length > 0) closed.push(issueNumber);
  }
  return closed;
}
