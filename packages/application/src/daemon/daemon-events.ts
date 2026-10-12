import { z } from 'zod';
import { PAUSE_CAUSES } from '../notifications/operator-notifications.ts';

export const DAEMON_SUBJECT = 'daemon';
export const DAEMON_STARTED_EVENT = 'daemon.started';
export const DAEMON_STOPPED_EVENT = 'daemon.stopped';
export const SCHEDULER_PAUSED_EVENT = 'scheduler.paused';
export const SCHEDULER_RESUMED_EVENT = 'scheduler.resumed';

export const DaemonStartedPayloadSchema = z.object({ concurrency: z.number().int().positive(), poolSize: z.number().int().positive() });
export const DaemonStoppedPayloadSchema = z.object({ reason: z.string() });

export const SchedulerPausedPayloadSchema = z.object({
  cause: z.enum(PAUSE_CAUSES),
  reason: z.string(),
  resumesAt: z.iso.datetime({ offset: true }).nullable(),
});
export type SchedulerPausedPayload = z.infer<typeof SchedulerPausedPayloadSchema>;

export const SchedulerResumedPayloadSchema = z.object({ cause: z.enum(PAUSE_CAUSES) });
