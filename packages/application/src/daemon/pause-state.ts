import type { EventStore } from '../ports.ts';
import type { PauseCause } from '@agent-factory/domain';
import {
  DAEMON_SUBJECT,
  SCHEDULER_PAUSED_EVENT,
  SCHEDULER_RESUMED_EVENT,
  SchedulerPausedPayloadSchema,
  SchedulerResumedPayloadSchema,
  type SchedulerPausedPayload,
} from './daemon-events.ts';

const FIRST_SEQUENCE = 0;

export type ActivePauses = ReadonlyMap<PauseCause, SchedulerPausedPayload>;

export async function activePauses(events: EventStore): Promise<ActivePauses> {
  const active = new Map<PauseCause, SchedulerPausedPayload>();
  for (const record of await events.read(DAEMON_SUBJECT, FIRST_SEQUENCE)) {
    if (record.subject !== DAEMON_SUBJECT) continue;
    if (record.type === SCHEDULER_PAUSED_EVENT) {
      const paused = SchedulerPausedPayloadSchema.parse(record.payload);
      active.set(paused.cause, paused);
    } else if (record.type === SCHEDULER_RESUMED_EVENT) {
      active.delete(SchedulerResumedPayloadSchema.parse(record.payload).cause);
    }
  }
  return active;
}

export async function pauseScheduling(events: EventStore, cause: PauseCause, reason: string, resumesAt: Date | null): Promise<number> {
  const payload: SchedulerPausedPayload = { cause, reason, resumesAt: resumesAt?.toISOString() ?? null };
  return (await events.append(SCHEDULER_PAUSED_EVENT, DAEMON_SUBJECT, payload)).sequence;
}

export async function resumeScheduling(events: EventStore, cause: PauseCause): Promise<number> {
  return (await events.append(SCHEDULER_RESUMED_EVENT, DAEMON_SUBJECT, { cause })).sequence;
}
