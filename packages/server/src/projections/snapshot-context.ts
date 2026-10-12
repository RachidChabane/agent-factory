import type { CheckRunSummary, ProjectConventions } from '@agent-factory/application';
import type { IssueSpec, TokenUsage } from '@agent-factory/domain';
import type { Observed } from '../snapshot/cached-reading.ts';

export interface RunLogSummary {
  readonly logLength: number;
  readonly lastLine: string | null;
  readonly currentTool: string | null;
  readonly progress: { readonly usage: TokenUsage; readonly turns: number } | null;
}

/** Where the cockpit finds a project's issues, evidence files and request attachments. */
export interface SnapshotLinks {
  issue(issueNumber: number): string;
  /** The address the cockpit can open for a URL the forge gave, such as a local forge's file. */
  forge(url: string): string;
  evidence(issueNumber: number, relativePath: string): string;
  requestAttachment(requestId: string, relativePath: string): string;
}

/** An issue on the forge the factory has not taken yet: a draft until the operator validates its spec. */
export interface PendingIssue {
  readonly spec: IssueSpec;
  readonly validated: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function logKey(issueNumber: number, name: string): string {
  return `${issueNumber}/${name}`;
}

/** What the projections of one project read besides its events. */
export interface ProjectSnapshotContext {
  readonly generatedAt: Date;
  readonly project: string;
  readonly conventions: ProjectConventions;
  readonly links: SnapshotLinks;
  /** Open issues of the factory it has not taken yet, drafts and validated ones, as last read from the forge. */
  readonly pendingIssues: readonly PendingIssue[];
  readonly pullRequestChecks: ReadonlyMap<number, Observed<readonly CheckRunSummary[]>>;
  readonly pullRequestTitles: ReadonlyMap<number, string>;
  readonly logs: ReadonlyMap<string, string>;
  readonly productionWorkflowUrl: string | null;
  /** What the agent runs of each issue cost, summed. */
  readonly issueCosts: ReadonlyMap<number, number>;
  /** The files each audited change touched, for the changes read from the forge so far. */
  readonly changedFiles: ReadonlyMap<string, readonly string[]>;
}
