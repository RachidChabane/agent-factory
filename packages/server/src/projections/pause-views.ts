import {
  DAEMON_SUBJECT,
  SCHEDULER_PAUSED_EVENT,
  SCHEDULER_RESUMED_EVENT,
  SchedulerPausedPayloadSchema,
  SchedulerResumedPayloadSchema,
  type PauseCause,
} from '@agent-factory/application';
import type { EventIndex } from './event-index.ts';

export function activePauseCauses(index: EventIndex): ReadonlySet<PauseCause> {
  const causes = new Set<PauseCause>();
  for (const record of index.subject(DAEMON_SUBJECT)) {
    if (record.type === SCHEDULER_PAUSED_EVENT) causes.add(SchedulerPausedPayloadSchema.parse(record.payload).cause);
    if (record.type === SCHEDULER_RESUMED_EVENT) causes.delete(SchedulerResumedPayloadSchema.parse(record.payload).cause);
  }
  return causes;
}
