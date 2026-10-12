import type { IssueState } from '@agent-factory/domain';
import type { PullRequestRef } from '../ports.ts';

export type RunIssueOutcome =
  | { readonly kind: 'pr-open'; readonly issueNumber: number; readonly pullRequest: PullRequestRef }
  | { readonly kind: 'needs-human'; readonly issueNumber: number; readonly reason: string }
  | { readonly kind: 'blocked'; readonly issueNumber: number; readonly blockers: readonly number[] }
  | { readonly kind: 'beyond-pipeline'; readonly issueNumber: number; readonly state: IssueState };
