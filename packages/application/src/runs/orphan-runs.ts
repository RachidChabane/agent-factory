import type { Clock, EventStore } from '../ports.ts';
import { DEFAULT_ACCOUNT_NAME } from '../budget/budget-governor.ts';
import { ZERO_USAGE } from './recording-harness.ts';
import {
  ABORTED_OUTCOME,
  RUN_FINISHED_EVENT,
  RUN_STARTED_EVENT,
  RUN_SUBJECT_PREFIX,
  RunStartedPayloadSchema,
  runSubject,
  type RunFinishedPayload,
} from './run-events.ts';

const FIRST_SEQUENCE = 0;
export const ORPHAN_RUN_DETAIL = 'the factory stopped before the run ended';

export async function closeOrphanRuns(events: EventStore, clock: Clock): Promise<readonly string[]> {
  const records = await events.read(RUN_SUBJECT_PREFIX, FIRST_SEQUENCE);
  const finished = new Set(records.filter((record) => record.type === RUN_FINISHED_EVENT).map((record) => record.subject));
  const orphans = records.filter((record) => record.type === RUN_STARTED_EVENT && !finished.has(record.subject));
  const closed: string[] = [];
  for (const orphan of orphans) {
    const started = RunStartedPayloadSchema.parse(orphan.payload);
    const endedAt = clock.now();
    const payload: RunFinishedPayload = {
      status: 'stopped',
      outcome: ABORTED_OUTCOME,
      endedAt: endedAt.toISOString(),
      usage: ZERO_USAGE,
      costUsd: 0,
      turns: 0,
      durationMs: Math.max(0, endedAt.getTime() - new Date(started.startedAt).getTime()),
      sessionId: null,
      account: started.account ?? DEFAULT_ACCOUNT_NAME,
      detail: ORPHAN_RUN_DETAIL,
    };
    await events.append(RUN_FINISHED_EVENT, runSubject(started.id), payload);
    closed.push(started.id);
  }
  return closed;
}
