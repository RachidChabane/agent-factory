import type { Clock, EventStore, FactoryEventRecord } from '../ports.ts';
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

/** The runs these records show started and not ended. */
export function openRunStartsIn(records: readonly FactoryEventRecord[]): readonly FactoryEventRecord[] {
  const runs = records.filter((record) => record.subject.startsWith(RUN_SUBJECT_PREFIX));
  const finished = new Set(runs.filter((record) => record.type === RUN_FINISHED_EVENT).map((record) => record.subject));
  return runs.filter((record) => record.type === RUN_STARTED_EVENT && !finished.has(record.subject));
}

/** The runs the log shows started and not ended. */
export async function openRunStarts(events: EventStore): Promise<readonly FactoryEventRecord[]> {
  return openRunStartsIn(await events.read(RUN_SUBJECT_PREFIX, FIRST_SEQUENCE));
}

export async function closeOrphanRuns(events: EventStore, clock: Clock): Promise<readonly string[]> {
  const orphans = await openRunStarts(events);
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
