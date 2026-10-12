import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CockpitSnapshot, RoleSetting, SubscriptionWindowView, TelemetrySample, ToolConnection } from '@agent-factory/cockpit';
import {
  acceptanceCommand,
  activePauses,
  issueJournalsOf,
  latestToolChecks,
  parseIssueSpec,
  SPEC_VALIDATED_LABEL,
  DEPLOYMENT_HISTORY_LIMIT,
  type CheckRunSummary,
  type RunLogLine,
} from '@agent-factory/application';
import type { EnvironmentDeployments } from '../projections/environment-views.ts';
import { AGENT_ROLES, DEPLOYMENT_ENVIRONMENTS, type DeploymentEnvironment, type IssueSpec, type ResourceSnapshot } from '@agent-factory/domain';
import type { FactoryContainer } from '../composition/factory-container.ts';
import { recordedRuns } from '../projections/run-views.ts';
import { indexEvents } from '../projections/event-index.ts';
import { projectSnapshot } from '../projections/snapshot.ts';
import { proofLogExcerpt } from '../projections/pull-request-views.ts';
import { logKey, type RunLogSummary, type SnapshotContext } from '../projections/snapshot-context.ts';

export const GITHUB_CACHE_MS = 60_000;
export const RESOURCE_CACHE_MS = 10_000;
export const LOG_TAIL_CHARACTERS = 20_000;
const ALL_SUBJECTS = '';
const FIRST_SEQUENCE = 0;
const MARKDOWN_EXTENSION = '.md';
const RESOURCES_CAUSE = 'resources';
const NEWLINE = '\n';
const TOOL_CALL = 'tool-call';
const TOOL_RESULT = 'tool-result';
const ASSISTANT_TEXT = 'assistant-text';
const PROGRESS = 'progress';
const GITHUB_WEB_ORIGIN = 'https://github.com';
const LOCAL_MODE = 'local';
const NO_DAILY_CAP = 0;
const SUBSCRIPTION_WINDOW_OF_KIND = { session: 'five_hour', weekly_all: 'seven_day', weekly_scoped: null } as const;
const LOCAL_ISSUES_DIRECTORY = 'issues';
const LOCAL_ISSUE_EXTENSION = '.md';

interface Cached<T> {
  readonly value: T;
  readonly at: number;
}

function summarise(lines: readonly RunLogLine[], total: number): RunLogSummary {
  const open = new Map<string, string>();
  let lastLine: string | null = null;
  let progress: RunLogSummary['progress'] = null;
  for (const line of lines) {
    const event = line.event;
    if (event.kind === PROGRESS) {
      progress = { usage: event.usage, turns: event.turns };
    } else if (event.kind === TOOL_CALL) {
      open.set(event.toolUseId, event.toolName);
      lastLine = event.toolName;
    } else if (event.kind === TOOL_RESULT) {
      open.delete(event.toolUseId);
    } else if (event.kind === ASSISTANT_TEXT) {
      lastLine = event.text.trim().split(NEWLINE)[0] ?? lastLine;
    }
  }
  return { logLength: total, lastLine, currentTool: [...open.values()].at(-1) ?? null, progress };
}

function toolConnections(records: Parameters<typeof latestToolChecks>[0]): ToolConnection[] {
  return [...latestToolChecks(records).values()].map((check) => ({
    tool: check.tool,
    status: check.status,
    version: check.version,
    detail: check.detail,
    fixCommand: check.fixCommand,
    checkedAt: check.checkedAt.toISOString(),
  }));
}

export class SnapshotSource {
  private readonly factory: FactoryContainer;
  private resources: Cached<ResourceSnapshot | null> | null = null;
  private pending: Cached<readonly IssueSpec[]> | null = null;
  private readonly checks = new Map<string, Cached<readonly CheckRunSummary[]>>();
  private readonly titles = new Map<number, Cached<string>>();
  private readonly deployments = new Map<DeploymentEnvironment, Cached<EnvironmentDeployments>>();

  constructor(factory: FactoryContainer) {
    this.factory = factory;
  }

  async snapshot(): Promise<CockpitSnapshot> {
    const records = await this.factory.dependencies.events.read(ALL_SUBJECTS, FIRST_SEQUENCE);
    return projectSnapshot(records, await this.context(records));
  }

  async telemetry(): Promise<TelemetrySample> {
    const { events } = this.factory.dependencies;
    const pauses = await activePauses(events);
    const reading = await this.resourceReading();
    return {
      resources: {
        freeMemoryPercent: reading.value?.freeMemoryPercent ?? 0,
        pressure: reading.value?.pressure ?? 'normal',
        thresholdPercent: this.factory.config.resources.minimumFreeMemoryPercent,
        schedulingPaused: pauses.has(RESOURCES_CAUSE),
        sampledAt: new Date(reading.at).toISOString(),
      },
      subscription: await this.subscription(),
    };
  }

  private async context(records: Awaited<ReturnType<FactoryContainer['dependencies']['events']['read']>>): Promise<SnapshotContext> {
    const { config, clock } = this.factory;
    const index = indexEvents(records);
    const journals = issueJournalsOf(records);
    const reading = await this.resourceReading();
    return {
      generatedAt: clock.now(),
      repository: `${config.target.owner}/${config.target.name}`,
      defaultBranch: config.target.baseBranch,
      operator: this.factory.environment['USER'] ?? config.github.commitIdentity.name,
      links: {
        issue: (number) =>
          config.github.mode === LOCAL_MODE
            ? pathToFileURL(join(config.github.local.directory, LOCAL_ISSUES_DIRECTORY, `${number}${LOCAL_ISSUE_EXTENSION}`)).href
            : `${GITHUB_WEB_ORIGIN}/${config.target.owner}/${config.target.name}/issues/${number}`,
        evidence: (number, path) => `/api/evidence/${number}/${path}`,
        requestAttachment: (id, path) => `/api/requests/${encodeURIComponent(id)}/${path}`,
      },
      conventionalScopes: this.factory.settings.conventionalScopes,
      roles: this.roleSettings(),
      models: this.models(),
      concurrency: { ceiling: config.concurrency.issues, maximum: config.concurrency.ceiling },
      freeMemoryThresholdPercent: config.resources.minimumFreeMemoryPercent,
      pauseAbovePressure: config.resources.pauseAbovePressure,
      resources: { snapshot: reading.value, sampledAt: new Date(reading.at) },
      subscription: await this.subscription(),
      pauseAtUtilization: config.budget.thresholds.weekly_all,
      dailyCapUsd: config.budget.dailyCapUsd ?? NO_DAILY_CAP,
      perRunCapUsd: config.budget.perRunCapUsd,
      productionWorkflowUrl: config.release.productionWorkflowUrl,
      pendingIssues: await this.pendingIssues(),
      runLogs: await this.runLogSummaries(index),
      pullRequestChecks: await this.pullRequestChecks(journals),
      pullRequestTitles: await this.pullRequestTitles(journals),
      logs: await this.logTails(journals),
      knowledgeSources: await this.knowledgeSources(),
      tools: toolConnections(records),
      deployments: await this.environmentDeployments(),
    };
  }

  private async environmentDeployments(): Promise<ReadonlyMap<DeploymentEnvironment, EnvironmentDeployments>> {
    const delivery = this.factory.config.delivery;
    const result = new Map<DeploymentEnvironment, EnvironmentDeployments>();
    if (delivery === null) return result;
    const now = this.factory.clock.now().getTime();
    for (const environment of DEPLOYMENT_ENVIRONMENTS) {
      const target = delivery.environments[environment];
      if (target === undefined) continue;
      const cached = this.deployments.get(environment);
      if (cached !== undefined && now - cached.at < GITHUB_CACHE_MS) {
        result.set(environment, cached.value);
        continue;
      }
      try {
        const { github } = this.factory.dependencies;
        const records = await github.deployments(target.name, DEPLOYMENT_HISTORY_LIMIT);
        const tags = new Set((await github.listTags()).map((tag) => tag.name));
        const value: EnvironmentDeployments = { targetName: target.name, url: target.url, records, tags };
        this.deployments.set(environment, { value, at: now });
        result.set(environment, value);
      } catch {
        result.set(environment, cached?.value ?? { targetName: target.name, url: target.url, records: [], tags: new Set() });
      }
    }
    return result;
  }

  private roleSettings(): RoleSetting[] {
    const { roles } = this.factory.config;
    return AGENT_ROLES.flatMap((role) => {
      const settings = roles[role];
      return settings === undefined
        ? []
        : [{ role, model: settings.model, effort: settings.effort, maxBudgetUsd: settings.maxBudgetUsd, maxTurns: settings.maxTurns }];
    });
  }

  private models(): string[] {
    const { roles } = this.factory.config;
    const models = AGENT_ROLES.flatMap((role) => {
      const settings = roles[role];
      return settings === undefined ? [] : [settings.model, ...(settings.escalation === null ? [] : [settings.escalation.model])];
    });
    return [...new Set(models)].sort();
  }

  private async resourceReading(): Promise<Cached<ResourceSnapshot | null>> {
    const now = this.factory.clock.now().getTime();
    if (this.resources !== null && now - this.resources.at < RESOURCE_CACHE_MS) return this.resources;
    let value: ResourceSnapshot | null = null;
    try {
      value = await this.factory.dependencies.resources.snapshot();
    } catch {
      value = this.resources?.value ?? null;
    }
    this.resources = { value, at: now };
    return this.resources;
  }

  private async subscription(): Promise<SubscriptionWindowView[]> {
    const { budget } = this.factory;
    const usage = await budget.usage();
    const choice = await budget.check();
    const shown = usage.find((account) => choice.kind === 'selected' && account.account === choice.account) ?? usage[0];
    return (shown?.limits ?? []).flatMap((limit) => {
      const window = SUBSCRIPTION_WINDOW_OF_KIND[limit.kind];
      return window === null || limit.resetsAt === null ? [] : [{ window, utilization: limit.utilization, resetsAt: limit.resetsAt.toISOString() }];
    });
  }

  private async pendingIssues(): Promise<readonly IssueSpec[]> {
    const now = this.factory.clock.now().getTime();
    if (this.pending !== null && now - this.pending.at < GITHUB_CACHE_MS) return this.pending.value;
    let value: readonly IssueSpec[] = this.pending?.value ?? [];
    try {
      const issues = await this.factory.dependencies.github.listIssues(SPEC_VALIDATED_LABEL);
      value = issues.flatMap((issue) => {
        try {
          return [parseIssueSpec(issue)];
        } catch {
          return [];
        }
      });
    } catch {
      value = this.pending?.value ?? [];
    }
    this.pending = { value, at: now };
    return value;
  }

  private async runLogSummaries(index: ReturnType<typeof indexEvents>): Promise<ReadonlyMap<string, RunLogSummary>> {
    const summaries = new Map<string, RunLogSummary>();
    for (const run of recordedRuns(index)) {
      if (run.finished !== null) continue;
      const page = await this.factory.runLogs.read(run.started.id, null);
      summaries.set(run.started.id, summarise(page.lines, page.total));
    }
    return summaries;
  }

  private async pullRequestTitles(journals: ReturnType<typeof issueJournalsOf>): Promise<ReadonlyMap<number, string>> {
    const now = this.factory.clock.now().getTime();
    const titles = new Map<number, string>();
    for (const journal of journals.values()) {
      const number = journal.pullRequest?.number;
      if (number === undefined) continue;
      const cached = this.titles.get(number);
      if (cached !== undefined && (journal.mergeSha !== null || now - cached.at < GITHUB_CACHE_MS)) {
        titles.set(number, cached.value);
        continue;
      }
      try {
        const value = (await this.factory.dependencies.github.pullRequestDetails(number)).title;
        this.titles.set(number, { value, at: now });
        titles.set(number, value);
      } catch {
        if (cached !== undefined) titles.set(number, cached.value);
      }
    }
    return titles;
  }

  private async pullRequestChecks(journals: ReturnType<typeof issueJournalsOf>): Promise<ReadonlyMap<number, readonly CheckRunSummary[]>> {
    const now = this.factory.clock.now().getTime();
    const checks = new Map<number, readonly CheckRunSummary[]>();
    for (const journal of journals.values()) {
      const pullRequest = journal.pullRequest;
      if (pullRequest === null || journal.mergeSha !== null) continue;
      const head = journal.evidenceRemoval?.headSha ?? journal.pushedHead ?? pullRequest.headSha;
      const cached = this.checks.get(head);
      if (cached !== undefined && now - cached.at < GITHUB_CACHE_MS) {
        checks.set(pullRequest.number, cached.value);
        continue;
      }
      try {
        const value = await this.factory.dependencies.github.checks(head);
        this.checks.set(head, { value, at: now });
        checks.set(pullRequest.number, value);
      } catch {
        checks.set(pullRequest.number, cached?.value ?? []);
      }
    }
    return checks;
  }

  private async logTails(journals: ReturnType<typeof issueJournalsOf>): Promise<ReadonlyMap<string, string>> {
    const tails = new Map<string, string>();
    for (const journal of journals.values()) {
      if (journal.pullRequest === null) continue;
      const command = journal.manifest === null ? null : acceptanceCommand(journal.manifest);
      const beforeLog = journal.beforeProof?.logName ?? null;
      const gateLog = journal.gates.at(-1)?.logName ?? null;
      if (beforeLog !== null) await this.keepTail(tails, journal.issueNumber, beforeLog, null);
      if (gateLog !== null) await this.keepTail(tails, journal.issueNumber, gateLog, command);
    }
    return tails;
  }

  private async keepTail(tails: Map<string, string>, issueNumber: number, name: string, section: string | null): Promise<void> {
    const text = await this.factory.dependencies.logs.read(issueNumber, name);
    if (text === null) return;
    tails.set(logKey(issueNumber, name), proofLogExcerpt(text, section, LOG_TAIL_CHARACTERS));
  }


  private async knowledgeSources(): Promise<readonly string[]> {
    try {
      return (await readdir(this.factory.config.directories.knowledge)).filter((name) => name.endsWith(MARKDOWN_EXTENSION)).sort();
    } catch {
      return [];
    }
  }
}
