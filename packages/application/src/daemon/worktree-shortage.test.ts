import { describe, expect, it } from 'vitest';
import { InMemoryEventStore } from '../audit/testing/fakes.ts';
import { NOTICES, OperatorNotifications } from '../notifications/operator-notifications.ts';
import type { Notifier } from '../ports.ts';
import { SteppingClock } from '../runs/test-support.ts';
import { DAEMON_SUBJECT, SCHEDULER_WORKTREES_FREE_EVENT, SCHEDULER_WORKTREES_FULL_EVENT, type WorktreesFullPayload } from './daemon-events.ts';
import { activeWorktreeShortage, worktreeShortageOf, WorktreeShortageReporter } from './worktree-shortage.ts';

const START = new Date('2026-10-12T08:00:00.000Z');
const MINUTE_MS = 60_000;

const FULL_POOL: WorktreesFullPayload = {
  poolSize: 3,
  waiting: [14],
  holders: [
    { issueNumber: 9, state: 'needs-human', pullRequestNumber: null },
    { issueNumber: 11, state: 'pr-open', pullRequestNumber: 31 },
    { issueNumber: 12, state: 'pr-open', pullRequestNumber: 32 },
  ],
};

class RecordingNotifier implements Notifier {
  readonly sent: { readonly title: string; readonly body: string }[] = [];

  notify(title: string, body: string): Promise<void> {
    this.sent.push({ title, body });
    return Promise.resolve();
  }
}

function setup() {
  const clock = new SteppingClock(START);
  const events = new InMemoryEventStore(clock);
  const notifier = new RecordingNotifier();
  const notifications = new OperatorNotifications(notifier, 'http://127.0.0.1:7430', { info: () => undefined, warn: () => undefined });
  return { clock, events, notifier, reporter: new WorktreeShortageReporter({ events, notifications }) };
}

describe('the record of a full worktree pool', () => {
  it('records the condition once, with who waits and who holds, and notifies it once', async () => {
    const { events, notifier, reporter } = setup();
    await reporter.reconcile(FULL_POOL);
    await reporter.reconcile(FULL_POOL);
    await reporter.reconcile({ ...FULL_POOL, holders: [...FULL_POOL.holders] });
    expect(events.typesOf(DAEMON_SUBJECT)).toEqual([SCHEDULER_WORKTREES_FULL_EVENT]);
    expect(await activeWorktreeShortage(events)).toEqual({ ...FULL_POOL, since: START });
    expect(notifier.sent).toEqual([
      {
        title: 'No worktree is free: issues wait',
        body: 'Issue #14 is ready to start, but all 3 worktrees are held by issue #9 waiting for a person, issue #11 with pull request #31, issue #12 with pull request #32. Merge or abandon one to make room.',
      },
    ]);
  });

  it('records a change of who waits or who holds without notifying again, and keeps when the condition began', async () => {
    const { clock, events, notifier, reporter } = setup();
    await reporter.reconcile(FULL_POOL);
    clock.set(new Date(START.getTime() + 20 * MINUTE_MS));
    await reporter.reconcile({ ...FULL_POOL, waiting: [14, 15] });
    expect(events.typesOf(DAEMON_SUBJECT)).toEqual([SCHEDULER_WORKTREES_FULL_EVENT, SCHEDULER_WORKTREES_FULL_EVENT]);
    expect(await activeWorktreeShortage(events)).toEqual({ ...FULL_POOL, waiting: [14, 15], since: START });
    expect(notifier.sent).toHaveLength(1);
  });

  it('clears the condition when room appears, and notifies a later shortage again', async () => {
    const { events, notifier, reporter } = setup();
    await reporter.reconcile(FULL_POOL);
    await reporter.reconcile(null);
    await reporter.reconcile(null);
    expect(events.typesOf(DAEMON_SUBJECT)).toEqual([SCHEDULER_WORKTREES_FULL_EVENT, SCHEDULER_WORKTREES_FREE_EVENT]);
    expect(await activeWorktreeShortage(events)).toBeNull();
    await reporter.reconcile(FULL_POOL);
    expect(notifier.sent).toHaveLength(2);
  });

  it('records nothing while room exists', async () => {
    const { events, notifier, reporter } = setup();
    await reporter.reconcile(null);
    expect(events.records).toEqual([]);
    expect(notifier.sent).toEqual([]);
  });

  it('reads the condition from the events of the daemon alone, and only the latest episode', () => {
    const at = (offset: number): Date => new Date(START.getTime() + offset * MINUTE_MS);
    const record = (sequence: number, type: string, subject: string, payload: unknown, offset: number) => ({ sequence, occurredAt: at(offset), type, subject, payload });
    const records = [
      record(1, SCHEDULER_WORKTREES_FULL_EVENT, DAEMON_SUBJECT, FULL_POOL, 0),
      record(2, SCHEDULER_WORKTREES_FREE_EVENT, DAEMON_SUBJECT, {}, 5),
      record(3, SCHEDULER_WORKTREES_FULL_EVENT, 'issue/9', FULL_POOL, 6),
      record(4, SCHEDULER_WORKTREES_FULL_EVENT, DAEMON_SUBJECT, { ...FULL_POOL, waiting: [20] }, 10),
    ];
    expect(worktreeShortageOf(records)).toEqual({ ...FULL_POOL, waiting: [20], since: at(10) });
    expect(worktreeShortageOf(records.slice(0, 2))).toBeNull();
    expect(worktreeShortageOf([])).toBeNull();
  });

  it('names the only worktree of a pool of one', () => {
    const notice = NOTICES.worktreesFull({ poolSize: 1, waiting: [4], holders: [{ issueNumber: 3, state: 'pr-open', pullRequestNumber: 40 }] });
    expect(notice.body).toBe('Issue #4 is ready to start, but its only worktree is held by issue #3 with pull request #40. Merge or abandon one to make room.');
  });

  it('tells the operator what to free, in the words of the notice', () => {
    const notice = NOTICES.worktreesFull({ poolSize: 2, waiting: [4, 9], holders: [{ issueNumber: 3, state: 'implementing', pullRequestNumber: null }, { issueNumber: 8, state: null, pullRequestNumber: 40 }] });
    expect(notice.body).toBe('Issues #4, #9 are ready to start, but all 2 worktrees are held by issue #3 in progress, issue #8 with pull request #40. Merge or abandon one to make room.');
  });
});
