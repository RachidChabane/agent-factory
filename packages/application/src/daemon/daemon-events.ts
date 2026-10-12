import { z } from 'zod';
import { ISSUE_STATES, PAUSE_CAUSES } from '@agent-factory/domain';

export const DAEMON_SUBJECT = 'daemon';
export const DAEMON_STARTED_EVENT = 'daemon.started';
export const DAEMON_STOPPED_EVENT = 'daemon.stopped';
export const SCHEDULER_PAUSED_EVENT = 'scheduler.paused';
export const SCHEDULER_RESUMED_EVENT = 'scheduler.resumed';
export const SCHEDULER_WORKTREES_FULL_EVENT = 'scheduler.worktrees-full';
export const SCHEDULER_WORKTREES_FREE_EVENT = 'scheduler.worktrees-free';

export const DaemonStartedPayloadSchema = z.object({ concurrency: z.number().int().positive(), poolSize: z.number().int().positive() });
export const DaemonStoppedPayloadSchema = z.object({ reason: z.string() });
/** The start of an installation's daemon, in the installation's own log. */
export const InstallationStartedPayloadSchema = z.object({ projects: z.array(z.string()) });

export const SchedulerPausedPayloadSchema = z.object({
  cause: z.enum(PAUSE_CAUSES),
  reason: z.string(),
  resumesAt: z.iso.datetime({ offset: true }).nullable(),
});
export type SchedulerPausedPayload = z.infer<typeof SchedulerPausedPayloadSchema>;

export const SchedulerResumedPayloadSchema = z.object({ cause: z.enum(PAUSE_CAUSES) });

export const WorktreeHolderPayloadSchema = z.object({
  issueNumber: z.number().int().positive(),
  state: z.enum(ISSUE_STATES).nullable(),
  pullRequestNumber: z.number().int().positive().nullable(),
});

/** Validated issues that wait because every worktree of the pool is held, and who holds them. */
export const WorktreesFullPayloadSchema = z.object({
  poolSize: z.number().int().positive(),
  /** The issues that would start if a worktree were free. */
  waiting: z.array(z.number().int().positive()),
  holders: z.array(WorktreeHolderPayloadSchema),
});
export type WorktreesFullPayload = z.infer<typeof WorktreesFullPayloadSchema>;

export const WorktreesFreePayloadSchema = z.object({});
