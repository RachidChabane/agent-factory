import { describe, expect, it } from 'vitest';
import { issueSubject } from '@agent-factory/domain';
import type { IssueState } from '@agent-factory/domain';
import { InMemoryEventStore } from '../audit/testing/fakes.ts';
import { PIPELINE_EVENTS } from '../pipeline/journal-events.ts';
import { heldWorktrees, worktreeHolders } from './held-worktrees.ts';

async function holdWorktree(events: InMemoryEventStore, issueNumber: number, state: IssueState, pullRequestNumber: number | null): Promise<void> {
  const subject = issueSubject(issueNumber);
  await events.append('issue.transitioned', subject, { from: null, to: state, reason: 'recorded by the pipeline' });
  await events.append(PIPELINE_EVENTS.worktreeAcquired, subject, { path: `/pool/slot-${issueNumber}`, branch: `factory/${issueNumber}-x`, baseSha: 'base' });
  if (pullRequestNumber !== null) await events.append(PIPELINE_EVENTS.pullRequestOpened, subject, { number: pullRequestNumber, url: `https://example.invalid/pull/${pullRequestNumber}`, headSha: 'head' });
}

describe('the worktrees the pool lends', () => {
  it('lists each issue that keeps a worktree with its state and pull request, in issue order', async () => {
    const events = new InMemoryEventStore();
    await holdWorktree(events, 12, 'pr-open', 31);
    await holdWorktree(events, 9, 'needs-human', null);
    await holdWorktree(events, 14, 'implementing', null);
    expect(await worktreeHolders(events)).toEqual([
      { issueNumber: 9, state: 'needs-human', pullRequestNumber: null },
      { issueNumber: 12, state: 'pr-open', pullRequestNumber: 31 },
      { issueNumber: 14, state: 'implementing', pullRequestNumber: null },
    ]);
    expect(await heldWorktrees(events)).toBe(3);
  });

  it('forgets an issue once its worktree is released, and one that never had a worktree', async () => {
    const events = new InMemoryEventStore();
    await holdWorktree(events, 5, 'pr-open', 20);
    await events.append(PIPELINE_EVENTS.worktreeReleased, issueSubject(5), { path: '/pool/slot-5' });
    await events.append('issue.transitioned', issueSubject(6), { from: null, to: 'spec-validated', reason: 'validated' });
    expect(await worktreeHolders(events)).toEqual([]);
    expect(await heldWorktrees(events)).toBe(0);
  });
});
