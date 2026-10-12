import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localPullRequestPage, type KnowledgeDocument } from '@agent-factory/adapters';
import type { CockpitSnapshot, KnowledgeSourceView, ProjectView, ReferenceView, TelemetrySample } from '@agent-factory/cockpit';
import { evidencePath, forgeFilePath, requestAttachmentPath } from '@agent-factory/cockpit';
import {
  acceptanceCommand,
  EVIDENCE_CACHE_ISSUE_PREFIX,
  latestToolChecks,
  latestToolSessions,
  parseIssueSpec,
  parseProjectSubject,
  PENDING_ISSUE_EVENTS,
  referenceState,
  type CheckRunSummary,
  type FactoryEventRecord,
  type FilmForecast,
  type ReferenceState,
  type RunLogLine,
  type WorkflowRunRecord,
} from '@agent-factory/application';
import type { ResourceSnapshot } from '@agent-factory/domain';
import type { InstallationRuntime } from '../composition/installation/installation-runtime.ts';
import { projectTools } from '../composition/installation/tools.ts';
import { forgeUrl } from '../composition/project/forge.ts';
import { productionWorkflowUrl } from '../composition/project/delivery.ts';
import type { ProjectRuntime } from '../composition/project/project-runtime.ts';
import { FACTORY_INSTALL_DIRECTORY } from '../composition/install-paths.ts';
import { streamEventOf } from '../http/event-stream.ts';
import { auditsWithoutFiles } from '../projections/audit-views.ts';
import { issueCosts, projectCosts } from '../projections/cost-views.ts';
import type { EnvironmentDeployments } from '../projections/environment-views.ts';
import { indexEvents } from '../projections/event-index.ts';
import { installationSettingsView, pauseViews, toolViews, usageView } from '../projections/installation-views.ts';
import { issueJournals } from '../projections/issue-views.ts';
import { withoutLocalPaths } from '../projections/local-paths.ts';
import { proofLogExcerpt } from '../projections/pull-request-views.ts';
import { projectRuns, recordedRuns, type RecordedRun } from '../projections/run-views.ts';
import { imageKey, logKey, type ForgePullRequest, type PendingIssue, type ProjectSnapshotContext, type RunLogSummary } from '../projections/snapshot-context.ts';
import { projectView, type ProjectViewProjection } from '../projections/project-view.ts';
import { CachedReading, CachedReadings, COLD_READ_WAIT_MS, NEVER_READ, observedView, type Observed } from './cached-reading.ts';
import { DeploymentCommits } from './deployment-commits.ts';
import { ImageSizes } from './evidence-image-sizes.ts';
import type { ImageSize } from './image-size.ts';

export const FORGE_READ_INTERVAL_MS = 60_000;
/** Checks still running are read again sooner: their conclusion is about to change. */
export const PENDING_CHECKS_READ_INTERVAL_MS = 10_000;
export const RESOURCES_READ_INTERVAL_MS = 10_000;
export const KNOWLEDGE_READ_INTERVAL_MS = 5 * 60_000;
/** A reference's snapshot is read from the project's own directory, and from its source clone only while it is not built. */
export const REFERENCES_READ_INTERVAL_MS = 30_000;
/** A commit's files never change. */
export const CHANGED_FILES_READ_INTERVAL_MS = 24 * 60 * 60_000;
export const ACTIVITY_LIMIT = 100;
export const WORKFLOW_RUN_LIMIT = 20;
export const LOG_TAIL_CHARACTERS = 20_000;
export const STALE_AFTER_MS = { forge: 5 * 60_000, resources: 60_000, tools: 24 * 60 * 60_000, knowledge: 15 * 60_000, references: 5 * 60_000 } as const;
const HEALTH_STALE_FACTOR = 2;
const DEPLOYMENT_HISTORY_LIMIT = 10;
const ALL_SUBJECTS = '';
const FIRST_SEQUENCE = 0;
const RESOURCES_CAUSE = 'resources';
const NEWLINE = '\n';
const UNKNOWN_VERSION = '0.0.0';
const DAEMON_STARTED_EVENT = 'daemon.started';
const DAEMON_STOPPED_EVENT = 'daemon.stopped';
const FILE_URL_PREFIX = 'file://';
const LOCAL_ISSUES_DIRECTORY = 'issues';
const PENDING_CONCLUSION = 'pending';
const OPEN_ON_FORGE = 'open';
const MARKDOWN_EXTENSION = '.md';

function productVersion(): string {
  try {
    const manifest: unknown = JSON.parse(readFileSync(join(FACTORY_INSTALL_DIRECTORY, 'package.json'), 'utf8'));
    return typeof manifest === 'object' && manifest !== null && 'version' in manifest && typeof manifest.version === 'string' ? manifest.version : UNKNOWN_VERSION;
  } catch {
    return UNKNOWN_VERSION;
  }
}

function summariseLog(lines: readonly RunLogLine[], total: number): RunLogSummary {
  const open = new Map<string, string>();
  let lastLine: string | null = null;
  let progress: RunLogSummary['progress'] = null;
  for (const { event } of lines) {
    if (event.kind === 'progress') progress = { usage: event.usage, turns: event.turns };
    else if (event.kind === 'tool-call') {
      open.set(event.toolUseId, event.toolName);
      lastLine = event.toolName;
    } else if (event.kind === 'tool-result') open.delete(event.toolUseId);
    else if (event.kind === 'assistant-text') lastLine = event.text.trim().split(NEWLINE)[0] ?? lastLine;
  }
  return { logLength: total, lastLine, currentTool: [...open.values()].at(-1) ?? null, progress };
}

interface SplitRecords {
  readonly installation: readonly FactoryEventRecord[];
  readonly projects: ReadonlyMap<string, readonly FactoryEventRecord[]>;
}

/** Splits the installation's log into its own events and each project's, with the subjects the project sees. */
function splitByProject(records: readonly FactoryEventRecord[]): SplitRecords {
  const installation: FactoryEventRecord[] = [];
  const projects = new Map<string, FactoryEventRecord[]>();
  for (const record of records) {
    const { project, subject } = parseProjectSubject(record.subject);
    if (project === null) {
      installation.push(record);
      continue;
    }
    const list = projects.get(project) ?? [];
    list.push({ ...record, subject });
    projects.set(project, list);
  }
  return { installation, projects };
}

function hasUnmergedPullRequest(journals: ReturnType<typeof issueJournals>): boolean {
  return [...journals.values()].some((journal) => journal.pullRequest !== null && journal.mergeSha === null);
}

function checksReadInterval(last: readonly CheckRunSummary[] | null): number {
  return last?.some((check) => check.conclusion === PENDING_CONCLUSION) === true ? PENDING_CHECKS_READ_INTERVAL_MS : FORGE_READ_INTERVAL_MS;
}

/** The readings of one project from its forge and its files, each with the time it was read. */
class ProjectReadings {
  readonly pendingIssues: CachedReading<readonly PendingIssue[]>;
  readonly checks: CachedReadings<string, readonly CheckRunSummary[]>;
  readonly baseChecks: CachedReading<readonly CheckRunSummary[]>;
  readonly pullRequests: CachedReadings<number, ForgePullRequest>;
  readonly deployments: CachedReadings<string, EnvironmentDeployments>;
  readonly workflows: CachedReading<readonly WorkflowRunRecord[] | null>;
  readonly changedFiles: CachedReadings<string, readonly string[]>;
  readonly knowledge: CachedReadings<number, readonly KnowledgeDocument[]>;
  readonly references: CachedReadings<string, ReferenceState>;

  constructor(project: ProjectRuntime, runtime: InstallationRuntime, coldWaitMs: number) {
    const { clock } = runtime;
    const forge = project.forge;
    const { labels } = project.conventions;
    this.pendingIssues = new CachedReading<readonly PendingIssue[]>(
      async () => {
        const listed = [...(await forge.listIssues(labels.factory)), ...(await forge.listIssues(labels.validated))];
        return [...new Map(listed.map((issue) => [issue.number, issue])).values()].flatMap((issue): PendingIssue[] => {
          try {
            return [{ spec: parseIssueSpec(issue, project.conventions), validated: issue.labels.includes(labels.validated), createdAt: issue.createdAt, updatedAt: issue.updatedAt }];
          } catch {
            return [];
          }
        });
      },
      FORGE_READ_INTERVAL_MS,
      clock,
      coldWaitMs,
    );
    this.checks = new CachedReadings((head) => forge.checks(head), checksReadInterval, clock, coldWaitMs);
    this.baseChecks = new CachedReading(() => forge.baseBranchChecks(), FORGE_READ_INTERVAL_MS, clock, coldWaitMs);
    this.pullRequests = new CachedReadings(
      async (number) => {
        const details = await forge.pullRequestDetails(number);
        return { title: details.title, state: details.state };
      },
      FORGE_READ_INTERVAL_MS,
      clock,
      coldWaitMs,
    );
    const deliveredCommits = new DeploymentCommits(project.repository);
    this.deployments = new CachedReadings<string, EnvironmentDeployments>(
      async (target) => {
        const [records, tags] = await Promise.all([forge.deployments(target, DEPLOYMENT_HISTORY_LIMIT), forge.listTags()]);
        const [changes, pending] = await Promise.all([deliveredCommits.changes(records), deliveredCommits.pending(records)]);
        return { records, tags: new Set(tags.map((tag) => tag.name)), changes, pending };
      },
      FORGE_READ_INTERVAL_MS,
      clock,
      coldWaitMs,
    );
    this.workflows = new CachedReading(() => forge.workflowRuns(WORKFLOW_RUN_LIMIT), FORGE_READ_INTERVAL_MS, clock, coldWaitMs);
    this.changedFiles = new CachedReadings(async (sha) => (await forge.commitDiff(sha)).changedFiles, CHANGED_FILES_READ_INTERVAL_MS, clock, coldWaitMs);
    this.knowledge = new CachedReadings(
      (position) => {
        const source = project.config.knowledge[position];
        return source === undefined ? Promise.resolve([]) : project.knowledge.documents(source);
      },
      KNOWLEDGE_READ_INTERVAL_MS,
      clock,
      coldWaitMs,
    );
    this.references = new CachedReadings(
      (name) => {
        const reference = project.config.references.find((candidate) => candidate.name === name);
        if (reference === undefined) throw new Error(`the project ${project.id} cites no reference ${name}`);
        return referenceState(project.references, reference);
      },
      REFERENCES_READ_INTERVAL_MS,
      clock,
      coldWaitMs,
    );
  }
}

export interface SnapshotSourceOptions {
  /** How long the snapshot waits for a reading nobody has completed yet; a later snapshot carries what the read brought. */
  readonly coldReadWaitMs?: number;
}

/** Builds the cockpit's snapshot of an installation and the telemetry it streams between events. */
export class SnapshotSource {
  private readonly runtime: InstallationRuntime;
  private readonly version = productVersion();
  private readonly readings = new Map<string, ProjectReadings>();
  private readonly resources: CachedReading<ResourceSnapshot>;
  private readonly imageSizes = new ImageSizes();
  private readonly coldReadWaitMs: number;

  constructor(runtime: InstallationRuntime, options: SnapshotSourceOptions = {}) {
    this.runtime = runtime;
    this.coldReadWaitMs = options.coldReadWaitMs ?? COLD_READ_WAIT_MS;
    this.resources = new CachedReading(() => runtime.resources.snapshot(), RESOURCES_READ_INTERVAL_MS, runtime.clock, this.coldReadWaitMs);
    for (const project of runtime.projects) this.readings.set(project.id, new ProjectReadings(project, runtime, this.coldReadWaitMs));
  }

  async snapshot(): Promise<CockpitSnapshot> {
    const { runtime } = this;
    const records = await runtime.events.read(ALL_SUBJECTS, FIRST_SEQUENCE);
    const generatedAt = runtime.clock.now();
    const split = splitByProject(records);
    const installation = indexEvents(split.installation);
    const runs = recordedRuns(installation);
    const forecast = runtime.filmLedger?.forecastFrom(split.projects) ?? null;
    const projects = await Promise.all(runtime.projects.map((project) => this.projectSnapshot(project, split.projects.get(project.id) ?? [], runs, generatedAt, forecast)));
    const questions = new Map(projects.flatMap((project) => [...project.questions]));
    const pauses = pauseViews(split.installation, 'installation');
    const config = runtime.config;
    return {
      sequence: records.at(-1)?.sequence ?? FIRST_SEQUENCE,
      generatedAt: generatedAt.toISOString(),
      installation: {
        version: this.version,
        mode: runtime.mode,
        operator: runtime.operator,
        publicUrl: config.server.publicUrl,
        startedAt: this.startedAt(split.installation),
        pauses,
        runSlots: { limit: runtime.runSlots.limit, running: runtime.runSlots.running, queued: runtime.runSlots.queued },
        staleAfterMs: { ...STALE_AFTER_MS, health: this.healthStaleAfterMs() },
      },
      activity: records.slice(-ACTIVITY_LIMIT).reverse().map(streamEventOf),
      projects: projects.map((project) => project.view),
      runs: projectRuns(runs, await this.runLogSummaries(runs), questions),
      usage: usageView(config, await runtime.budget.usage(), split.installation),
      costs: projectCosts(runs, {
        generatedAt,
        billing: config.claude.accounts.map((account) => account.billing),
        dailyCap: config.budget.dailyCap,
        perRunCapUsd: config.budget.perRunCapUsd,
      }),
      resources: await this.resourcesView(pauses.some((pause) => pause.cause === RESOURCES_CAUSE)),
      tools: toolViews(runtime.configuredTools, latestToolChecks(split.installation), latestToolSessions(split.installation), 'installation'),
      settings: installationSettingsView(config, runtime.environment, split.installation),
    };
  }

  async telemetry(): Promise<TelemetrySample> {
    const records = await this.runtime.events.read(ALL_SUBJECTS, FIRST_SEQUENCE);
    const split = splitByProject(records);
    const runs = recordedRuns(indexEvents(split.installation));
    const paused = pauseViews(split.installation, 'installation').some((pause) => pause.cause === RESOURCES_CAUSE);
    return {
      resources: await this.resourcesView(paused),
      usage: usageView(this.runtime.config, await this.runtime.budget.usage(), split.installation),
      runs: projectRuns(runs, await this.runLogSummaries(runs), new Map()),
    };
  }

  /** Reads the resources now, for the operator's explicit refresh. */
  refreshResources(): Promise<Observed<ResourceSnapshot>> {
    return this.resources.refresh();
  }

  private async resourcesView(schedulingPaused: boolean): Promise<CockpitSnapshot['resources']> {
    const { config } = this.runtime;
    return {
      sample: observedView(await this.resources.get(), (sample) => ({ freeMemoryPercent: sample.freeMemoryPercent, pressure: sample.pressure })),
      minimumFreeMemoryPercent: config.resources.minimumFreeMemoryPercent,
      pauseAbovePressure: config.resources.pauseAbovePressure,
      schedulingPaused,
    };
  }

  private healthStaleAfterMs(): number {
    const intervals = this.runtime.projects.map((project) => project.config.delivery.healthIntervalMs);
    return Math.max(0, ...intervals) * HEALTH_STALE_FACTOR;
  }

  private startedAt(records: readonly FactoryEventRecord[]): string | null {
    const last = records.findLast((record) => record.type === DAEMON_STARTED_EVENT || record.type === DAEMON_STOPPED_EVENT);
    return last?.type === DAEMON_STARTED_EVENT ? last.occurredAt.toISOString() : null;
  }

  private async runLogSummaries(runs: readonly RecordedRun[]): Promise<ReadonlyMap<string, RunLogSummary>> {
    const summaries = new Map<string, RunLogSummary>();
    for (const run of runs) {
      if (run.finished !== null) continue;
      const page = await this.runtime.runLogs.read(run.started.id, null);
      summaries.set(run.started.id, summariseLog(page.lines, page.total));
    }
    return summaries;
  }

  private projectReadings(project: ProjectRuntime): ProjectReadings {
    const readings = this.readings.get(project.id);
    if (readings !== undefined) return readings;
    const created = new ProjectReadings(project, this.runtime, this.coldReadWaitMs);
    this.readings.set(project.id, created);
    return created;
  }

  private async projectSnapshot(
    project: ProjectRuntime,
    records: readonly FactoryEventRecord[],
    runs: readonly RecordedRun[],
    generatedAt: Date,
    forecast: FilmForecast | null,
  ): Promise<ProjectViewProjection> {
    const readings = this.projectReadings(project);
    const index = indexEvents(records);
    const journals = issueJournals(index);
    const config = project.config;
    const changedAt = records.findLast((record) => PENDING_ISSUE_EVENTS.includes(record.type))?.occurredAt ?? null;
    const [pending, pullRequests, baseChecks, changedFiles, imageSizes, logs, deployments, workflows, knowledge, references] = await Promise.all([
      readings.pendingIssues.get(changedAt),
      this.pullRequestReadings(readings, journals),
      hasUnmergedPullRequest(journals) ? readings.baseChecks.get() : Promise.resolve(NEVER_READ),
      this.auditChangedFiles(readings, index),
      this.evidenceImageSizes(project, journals),
      this.logTails(project, journals),
      this.deploymentReadings(project, readings),
      this.workflowsView(readings),
      this.knowledgeViews(project, readings),
      this.referenceViews(project, readings),
    ]);
    const context: ProjectSnapshotContext = {
      generatedAt,
      project: project.id,
      conventions: project.conventions,
      links: {
        issue: (number) => this.issueUrl(project, number),
        forge: (url) => this.forgeLink(project, url),
        evidence: (number, path) => evidencePath(project.id, number, path),
        requestAttachment: (requestId, path) => requestAttachmentPath(project.id, requestId, path),
        pullRequest: (number) => this.pullRequestUrl(project, number),
      },
      pendingIssues: pending.value ?? [],
      pullRequestChecks: pullRequests.checks,
      baseChecks: pullRequests.checks.size === 0 ? NEVER_READ : baseChecks,
      pullRequestsOnForge: pullRequests.onForge,
      imageSizes,
      logs,
      productionWorkflowUrl: productionWorkflowUrl(config),
      issueCosts: issueCosts(runs, project.id),
      changedFiles,
      films: project.films === null || forecast === null ? null : { forecast, presentation: project.films.presentation },
    };
    return projectView(config, records, context, {
      forgeUrl: forgeUrl(config),
      workflows,
      deployments: (target) => deployments.get(target) ?? null,
      knowledge,
      references,
      tools: toolViews(projectTools(config), latestToolChecks(records), latestToolSessions(records), 'project'),
    });
  }

  /** The state of every pull request on the forge and the checks of the open ones, each read concurrently. */
  private async pullRequestReadings(
    readings: ProjectReadings,
    journals: ReturnType<typeof issueJournals>,
  ): Promise<{ readonly onForge: ReadonlyMap<number, ForgePullRequest>; readonly checks: ReadonlyMap<number, Observed<readonly CheckRunSummary[]>> }> {
    const onForge = new Map<number, ForgePullRequest>();
    const checks = new Map<number, Observed<readonly CheckRunSummary[]>>();
    await Promise.all(
      [...journals.values()].map(async (journal) => {
        const pullRequest = journal.pullRequest;
        if (pullRequest === null) return;
        const reading = await readings.pullRequests.get(pullRequest.number);
        if (reading.value !== null) onForge.set(pullRequest.number, reading.value);
        if (journal.mergeSha !== null || (reading.value !== null && reading.value.state !== OPEN_ON_FORGE)) return;
        checks.set(pullRequest.number, await readings.checks.get(journal.evidenceRemoval?.headSha ?? journal.pushedHead ?? pullRequest.headSha));
      }),
    );
    return { onForge, checks };
  }

  /** The files of the commits audits cover, read where the commit is known. */
  private async auditChangedFiles(readings: ProjectReadings, index: ReturnType<typeof indexEvents>): Promise<ReadonlyMap<string, readonly string[]>> {
    const changedFiles = new Map<string, readonly string[]>();
    await Promise.all(
      auditsWithoutFiles(index, new Map()).map(async (sha) => {
        const files = await readings.changedFiles.get(sha);
        if (files.value !== null) changedFiles.set(sha, files.value);
      }),
    );
    return changedFiles;
  }

  /** The deployments of every environment that reads them from the forge, by deployment target. */
  private async deploymentReadings(project: ProjectRuntime, readings: ProjectReadings): Promise<ReadonlyMap<string, Observed<EnvironmentDeployments>>> {
    const targets = project.config.delivery.environments.flatMap((environment) => (environment.deployments.kind === 'github' ? [environment.deployments.environment] : []));
    return new Map(await Promise.all(targets.map(async (target) => [target, await readings.deployments.get(target)] as const)));
  }

  /** The sizes of the evidence images of every issue with a pull request, by issue, phase and path. */
  private async evidenceImageSizes(project: ProjectRuntime, journals: ReturnType<typeof issueJournals>): Promise<ReadonlyMap<string, ImageSize>> {
    const sizes = new Map<string, ImageSize>();
    for (const journal of journals.values()) {
      for (const file of journal.evidence?.bundle.files ?? []) {
        const relativePath = `${file.phase}/${file.sourcePath}`;
        const size = await this.imageSizes.of(join(project.config.directories.evidence, `${EVIDENCE_CACHE_ISSUE_PREFIX}${journal.issueNumber}`, relativePath));
        if (size !== null) sizes.set(imageKey(journal.issueNumber, relativePath), size);
      }
    }
    return sizes;
  }

  private pullRequestUrl(project: ProjectRuntime, number: number): string {
    const web = forgeUrl(project.config);
    return web === null ? forgeFilePath(project.id, localPullRequestPage(number)) : `${web}/pull/${number}`;
  }

  private issueUrl(project: ProjectRuntime, number: number): string {
    const web = forgeUrl(project.config);
    return web === null ? forgeFilePath(project.id, `${LOCAL_ISSUES_DIRECTORY}/${number}${MARKDOWN_EXTENSION}`) : `${web}/issues/${number}`;
  }

  /** A file URL inside the project's local forge becomes the API path that serves it. */
  private forgeLink(project: ProjectRuntime, url: string): string {
    const { forge } = project.config;
    if (forge.kind !== 'local' || !url.startsWith(FILE_URL_PREFIX)) return url;
    const path = fileURLToPath(url);
    const relative = path.startsWith(`${forge.directory}/`) ? path.slice(forge.directory.length + 1) : null;
    return relative === null ? url : forgeFilePath(project.id, relative);
  }

  private async workflowsView(readings: ProjectReadings): Promise<ProjectView['workflows']> {
    const observed = await readings.workflows.get();
    if (observed.readAt !== null && observed.value === null) return null;
    return observedView(observed, (runs) =>
      (runs ?? []).map((run) => ({
        id: run.id,
        workflow: run.workflow,
        title: run.title,
        branch: run.branch,
        sha: run.sha,
        trigger: run.trigger,
        status: run.status,
        conclusion: conclusionOf(run.conclusion),
        actor: run.actor,
        startedAt: run.startedAt.toISOString(),
        durationMs: run.status === 'completed' ? Math.max(0, run.updatedAt.getTime() - run.startedAt.getTime()) : null,
        url: run.url,
      })),
    );
  }

  private async knowledgeViews(project: ProjectRuntime, readings: ProjectReadings): Promise<KnowledgeSourceView[]> {
    const home = this.runtime.userHome;
    return Promise.all(
      project.config.knowledge.map(async (source, position) => ({
        kind: source.kind,
        location: withoutLocalPaths(source.path, [home]),
        documents: observedView(await readings.knowledge.get(position), (documents) =>
          documents.map((document) => ({ path: withoutLocalPaths(document.path, [project.config.clonePath, home]), title: document.title, bytes: document.bytes })),
        ),
      })),
    );
  }

  private async referenceViews(project: ProjectRuntime, readings: ProjectReadings): Promise<ReferenceView[]> {
    return Promise.all(
      project.config.references.map(async (reference) => ({
        name: reference.name,
        repository: reference.repository,
        ref: reference.ref,
        snapshot: observedView(await readings.references.get(reference.name), (state) => ({ status: state.status, commit: state.commit })),
      })),
    );
  }

  private async logTails(project: ProjectRuntime, journals: ReturnType<typeof issueJournals>): Promise<ReadonlyMap<string, string>> {
    const tails = new Map<string, string>();
    for (const journal of journals.values()) {
      if (journal.pullRequest === null) continue;
      const command = journal.manifest === null ? null : acceptanceCommand(journal.manifest);
      const names: readonly (readonly [string | null, string | null])[] = [
        [journal.beforeProof?.logName ?? null, null],
        [journal.gates.at(-1)?.logName ?? null, command],
      ];
      for (const [name, section] of names) {
        if (name === null) continue;
        const text = await project.dependencies.logs.read(journal.issueNumber, name);
        if (text !== null) tails.set(logKey(journal.issueNumber, name), proofLogExcerpt(text, section, LOG_TAIL_CHARACTERS));
      }
    }
    return tails;
  }
}

const CHECK_CONCLUSIONS = ['success', 'failure', 'pending', 'neutral', 'skipped', 'cancelled'] as const;

function conclusionOf(conclusion: string | null): (typeof CHECK_CONCLUSIONS)[number] | null {
  if (conclusion === null) return null;
  if (conclusion === 'timed_out' || conclusion === 'action_required' || conclusion === 'startup_failure') return 'failure';
  return CHECK_CONCLUSIONS.find((known) => known === conclusion) ?? 'neutral';
}

