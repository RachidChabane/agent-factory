import type { CheckRunSummary, ForgePullRequestState, ProjectConventions } from '@agent-factory/application';
import type { IssueSpec, TokenUsage } from '@agent-factory/domain';
import type { Observed } from '../snapshot/cached-reading.ts';
import type { ProjectFilmContext } from './film-views.ts';
import type { ImageSize } from '../snapshot/image-size.ts';

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
  /** The forge's page of a pull request of the project. */
  pullRequest(number: number): string;
}

/** An issue on the forge the factory has not taken yet: a draft until the operator validates its spec. */
export interface PendingIssue {
  readonly spec: IssueSpec;
  readonly validated: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ForgePullRequest {
  readonly title: string;
  readonly state: ForgePullRequestState;
}

export function logKey(issueNumber: number, name: string): string {
  return `${issueNumber}/${name}`;
}

/** The key of an evidence image of an issue, by the path the evidence links use: the phase, then the file's path. */
export function imageKey(issueNumber: number, relativePath: string): string {
  return `${issueNumber}/${relativePath}`;
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
  /** The checks of the base branch's head, against which failures a change did not cause are told apart. */
  readonly baseChecks: Observed<readonly CheckRunSummary[]>;
  /** The title and state each pull request of the factory has on the forge, as last read. */
  readonly pullRequestsOnForge: ReadonlyMap<number, ForgePullRequest>;
  /** The sizes of the evidence images that could be read, by `imageKey`. */
  readonly imageSizes: ReadonlyMap<string, ImageSize>;
  readonly logs: ReadonlyMap<string, string>;
  readonly productionWorkflowUrl: string | null;
  /** What the agent runs of each issue cost, summed. */
  readonly issueCosts: ReadonlyMap<number, number>;
  /** The files each audited change touched, for the changes read from the forge so far. */
  readonly changedFiles: ReadonlyMap<string, readonly string[]>;
  /** The queue of the installation's films, for a project that films; null for one that does not. */
  readonly films: ProjectFilmContext | null;
}
