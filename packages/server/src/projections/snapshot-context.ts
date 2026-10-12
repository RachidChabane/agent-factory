import type { ConfiguredTool, RoleSetting, SubscriptionWindowView, ToolConnection } from '@agent-factory/cockpit';
import type { CheckRunSummary, ProjectConventions } from '@agent-factory/application';
import type { DeploymentEnvironment, IssueSpec, PauseAbovePressureLevel, ResourceSnapshot, TokenUsage } from '@agent-factory/domain';
import type { EnvironmentDeployments } from './environment-views.ts';

export interface ResourceReading {
  readonly snapshot: ResourceSnapshot | null;
  readonly sampledAt: Date;
}

export interface RunLogSummary {
  readonly logLength: number;
  readonly lastLine: string | null;
  readonly currentTool: string | null;
  readonly progress: { readonly usage: TokenUsage; readonly turns: number } | null;
}

export interface SnapshotLinks {
  issue(issueNumber: number): string;
  evidence(issueNumber: number, relativePath: string): string;
  requestAttachment(requestId: string, relativePath: string): string;
}

export function logKey(issueNumber: number, name: string): string {
  return `${issueNumber}/${name}`;
}

export interface SnapshotContext {
  readonly generatedAt: Date;
  readonly repository: string;
  readonly defaultBranch: string;
  readonly operator: string;
  readonly links: SnapshotLinks;
  readonly conventions: ProjectConventions;
  readonly roles: readonly RoleSetting[];
  readonly models: readonly string[];
  readonly concurrency: { readonly ceiling: number; readonly maximum: number };
  readonly freeMemoryThresholdPercent: number;
  readonly pauseAbovePressure: PauseAbovePressureLevel;
  readonly resources: ResourceReading;
  readonly subscription: readonly SubscriptionWindowView[];
  readonly pauseAtUtilization: number;
  readonly dailyCapUsd: number;
  readonly perRunCapUsd: number | null;
  readonly productionWorkflowUrl: string;
  readonly pendingIssues: readonly IssueSpec[];
  readonly runLogs: ReadonlyMap<string, RunLogSummary>;
  readonly pullRequestChecks: ReadonlyMap<number, readonly CheckRunSummary[]>;
  readonly pullRequestTitles: ReadonlyMap<number, string>;
  readonly logs: ReadonlyMap<string, string>;
  readonly knowledgeSources: readonly string[];
  readonly configuredTools: readonly ConfiguredTool[];
  readonly tools: readonly ToolConnection[];
  readonly deployments: ReadonlyMap<DeploymentEnvironment, EnvironmentDeployments>;
}
