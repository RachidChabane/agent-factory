import { issueSubject } from '@agent-factory/domain';
import type { IssueState } from '@agent-factory/domain';
import { ISSUE_OPENED_AT, type InMemoryEventStore } from '../../audit/testing/fakes.ts';
import { PipelineAbortedError } from '../../pipeline/pipeline-errors.ts';
import type { RunIssueOutcome } from '../../pipeline/run-issue-outcome.ts';
import type { IssueRecord, Notifier, Worktree, WorktreePool } from '../../ports.ts';
import type { IssueDriver } from '../factory-daemon.ts';

interface Pending {
  readonly issueNumber: number;
  readonly signal: AbortSignal;
  settle(outcome: RunIssueOutcome | Error): void;
}

/** Issue pipelines that run until the test finishes them, or until the daemon stops them. */
export class ControlledDriverFactory {
  readonly pending: Pending[] = [];
  readonly started: number[] = [];

  create(signal: AbortSignal): IssueDriver {
    return {
      runIssue: (issueNumber) =>
        new Promise<RunIssueOutcome>((resolve, reject) => {
          this.started.push(issueNumber);
          const entry: Pending = {
            issueNumber,
            signal,
            settle: (outcome) => (outcome instanceof Error ? reject(outcome) : resolve(outcome)),
          };
          signal.addEventListener(
            'abort',
            () => {
              this.pending.splice(this.pending.indexOf(entry), 1);
              reject(new PipelineAbortedError(issueNumber));
            },
            { once: true },
          );
          this.pending.push(entry);
        }),
    };
  }

  finish(issueNumber: number, outcome: RunIssueOutcome | Error): void {
    const index = this.pending.findIndex((entry) => entry.issueNumber === issueNumber);
    const [entry] = this.pending.splice(index, 1);
    entry?.settle(outcome);
  }
}

export class RecordingNotifier implements Notifier {
  readonly titles: string[] = [];

  notify(title: string): Promise<void> {
    this.titles.push(title);
    return Promise.resolve();
  }
}

export class ReleasingPool implements WorktreePool {
  readonly released: string[] = [];

  acquire(): never {
    throw new Error('not used');
  }
  reattach(): never {
    throw new Error('not used');
  }
  release(worktree: Worktree): Promise<void> {
    this.released.push(worktree.path);
    return Promise.resolve();
  }
}

export function validated(number: number, blockedBy: readonly number[] = []): IssueRecord {
  return { number, title: `issue ${number}`, body: '', labels: ['type:docs', 'spec:validated'], state: 'open', blockedBy, createdAt: ISSUE_OPENED_AT, updatedAt: ISSUE_OPENED_AT };
}

/** The state the pipeline of an issue recorded last. */
export async function recordState(events: InMemoryEventStore, issueNumber: number, to: IssueState): Promise<void> {
  await events.append('issue.transitioned', issueSubject(issueNumber), { from: null, to, reason: 'recorded by the pipeline' });
}

export function prOpen(issueNumber: number, pullRequestNumber: number): RunIssueOutcome {
  return { kind: 'pr-open', issueNumber, pullRequest: { number: pullRequestNumber, url: `https://example.invalid/${pullRequestNumber}`, headSha: 'h' } };
}
