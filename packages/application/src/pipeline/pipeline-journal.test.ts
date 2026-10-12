import { describe, expect, it } from 'vitest';
import type { FactoryEventRecord } from '../ports.ts';
import { PIPELINE_EVENTS } from './journal-events.ts';
import { JournalCorruptError, projectJournal, reviewRecord } from './pipeline-journal.ts';

const ISSUE = 7;
const OPERATOR = 'Alex Morgan';

let sequence = 0;
function record(type: string, payload: unknown): FactoryEventRecord {
  sequence += 1;
  return { sequence, occurredAt: new Date(Date.UTC(2026, 9, 12, 12, 0, sequence)), type, subject: `issue/${ISSUE}`, payload };
}

const review = (attempt: number, runId: string) => record(PIPELINE_EVENTS.reviewCompleted, { attempt, runId, findings: [] });
const reordered = (attempt: number) => record(PIPELINE_EVENTS.reviewReordered, { attempt, operator: OPERATOR });

describe('review reorders in the journal', () => {
  it('supersedes the reviews of the ordered attempt recorded before the order', () => {
    const journal = projectJournal(ISSUE, [review(0, 'run-1'), review(1, 'run-2'), reordered(1)]);
    expect(reviewRecord(journal, 1)).toBeNull();
    expect(reviewRecord(journal, 0)?.runId).toBe('run-1');
    expect(journal.supersededReviews.map((superseded) => superseded.runId)).toEqual(['run-2']);
    expect(journal.reviewReorders).toEqual([{ attempt: 1, operator: OPERATOR }]);
  });

  it('counts only the reviews recorded after the latest order', () => {
    const journal = projectJournal(ISSUE, [review(1, 'run-1'), reordered(1), review(1, 'run-2'), reordered(1), review(1, 'run-3')]);
    expect(reviewRecord(journal, 1)?.runId).toBe('run-3');
    expect(journal.supersededReviews.map((superseded) => superseded.runId)).toEqual(['run-1', 'run-2']);
    expect(journal.reviewReorders).toHaveLength(2);
  });

  it('rejects an order without an operator', () => {
    expect(() => projectJournal(ISSUE, [record(PIPELINE_EVENTS.reviewReordered, { attempt: 1, operator: '' })])).toThrow(JournalCorruptError);
  });
});
