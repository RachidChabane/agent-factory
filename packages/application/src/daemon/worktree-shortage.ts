import type { OperatorNotifications } from '../notifications/operator-notifications.ts';
import { NOTICES } from '../notifications/operator-notifications.ts';
import type { EventStore, FactoryEventRecord } from '../ports.ts';
import {
  DAEMON_SUBJECT,
  SCHEDULER_WORKTREES_FREE_EVENT,
  SCHEDULER_WORKTREES_FULL_EVENT,
  WorktreesFullPayloadSchema,
  type WorktreesFullPayload,
} from './daemon-events.ts';

const FIRST_SEQUENCE = 0;

/** The condition in force: validated issues wait only because every worktree of the pool is held. */
export interface WorktreeShortage extends WorktreesFullPayload {
  /** When the condition began; later changes of who waits or who holds do not move it. */
  readonly since: Date;
}

/** The shortage in force after these events of one daemon log, or null when room exists. */
export function worktreeShortageOf(records: readonly FactoryEventRecord[]): WorktreeShortage | null {
  let shortage: WorktreeShortage | null = null;
  for (const record of records) {
    if (record.subject !== DAEMON_SUBJECT) continue;
    if (record.type === SCHEDULER_WORKTREES_FULL_EVENT) {
      const since: Date = shortage?.since ?? record.occurredAt;
      shortage = { ...WorktreesFullPayloadSchema.parse(record.payload), since };
    } else if (record.type === SCHEDULER_WORKTREES_FREE_EVENT) {
      shortage = null;
    }
  }
  return shortage;
}

export async function activeWorktreeShortage(events: EventStore): Promise<WorktreeShortage | null> {
  return worktreeShortageOf(await events.read(DAEMON_SUBJECT, FIRST_SEQUENCE));
}

const KEY_SEPARATOR = ',';

function holdersKey(holders: WorktreesFullPayload['holders']): string {
  return holders.map((holder) => `${holder.issueNumber}:${holder.state ?? ''}:${holder.pullRequestNumber ?? ''}`).join(KEY_SEPARATOR);
}

function sameShortage(recorded: WorktreesFullPayload, found: WorktreesFullPayload): boolean {
  return (
    recorded.poolSize === found.poolSize &&
    recorded.waiting.join(KEY_SEPARATOR) === found.waiting.join(KEY_SEPARATOR) &&
    holdersKey(recorded.holders) === holdersKey(found.holders)
  );
}

export interface WorktreeShortageDependencies {
  readonly events: EventStore;
  readonly notifications: OperatorNotifications;
}

/**
 * Keeps the project's record of the shortage in step with what its scheduler finds at each tick:
 * an event when the condition appears or who waits or holds changes, one notice when it appears,
 * and an event when room appears again.
 */
export class WorktreeShortageReporter {
  private readonly dependencies: WorktreeShortageDependencies;

  constructor(dependencies: WorktreeShortageDependencies) {
    this.dependencies = dependencies;
  }

  async reconcile(found: WorktreesFullPayload | null): Promise<void> {
    const { events, notifications } = this.dependencies;
    const recorded = await activeWorktreeShortage(events);
    if (found === null) {
      if (recorded !== null) await events.append(SCHEDULER_WORKTREES_FREE_EVENT, DAEMON_SUBJECT, {});
      return;
    }
    if (recorded !== null && sameShortage(recorded, found)) return;
    await events.append(SCHEDULER_WORKTREES_FULL_EVENT, DAEMON_SUBJECT, found);
    if (recorded === null) await notifications.send(NOTICES.worktreesFull(found));
  }
}
