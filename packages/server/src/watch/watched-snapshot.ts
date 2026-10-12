import { z } from 'zod';
import { InstallationInfoSchema, IsoDateTimeSchema, IssueViewSchema, ProjectViewSchema, RunViewSchema } from '@agent-factory/cockpit';

const WatchedIssueSchema = IssueViewSchema.pick({ number: true, state: true, paused: true, escalation: true, updatedAt: true });

const WatchedProjectSchema = ProjectViewSchema.pick({ id: true, pauses: true, scheduler: true }).extend({ issues: z.array(WatchedIssueSchema) });

const WatchedRunSchema = RunViewSchema.pick({ id: true, project: true, role: true, status: true, outcome: true, subject: true, startedAt: true, endedAt: true, lastLine: true, pendingQuestion: true });

/**
 * The part of the cockpit's snapshot the blockers are read from. It is built from the contract's own
 * schemas, so the contract stays the one definition of these fields, and it ignores the rest, so a
 * snapshot of a factory that carries more or less elsewhere is still readable.
 */
export const WatchedSnapshotSchema = z.object({
  generatedAt: IsoDateTimeSchema,
  installation: InstallationInfoSchema.pick({ pauses: true }),
  projects: z.array(WatchedProjectSchema),
  runs: z.array(WatchedRunSchema),
});
export type WatchedSnapshot = z.infer<typeof WatchedSnapshotSchema>;
export type WatchedProject = WatchedSnapshot['projects'][number];
export type WatchedIssue = WatchedProject['issues'][number];
export type WatchedRun = WatchedSnapshot['runs'][number];
