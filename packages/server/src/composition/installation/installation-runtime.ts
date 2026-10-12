import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createResourceGuard, FileRunLogStore, SpawnCommandRunner, type LocalCheckScheduling, type NotifyFetchFunction } from '@agent-factory/adapters';
import {
  AgentRunAdmission,
  BudgetGovernor,
  ChangeSettings,
  FilmLedger,
  OperatorNotifications,
  RunSlots,
  type AgentHarness,
  type Clock,
  type CommandRunner,
  type EventStore,
  type Notifier,
  type OperationLog,
  type ResourceGuard,
  type SettingsDocument,
  type ToolProber,
  type UsageReportSource,
} from '@agent-factory/application';
import type { SettingsChange } from '@agent-factory/domain';
import { parseAgentFactoryConfig, projectOf, UnknownProjectError, type AgentFactoryConfig, type ProjectConfig } from '../../config/agent-factory-config.ts';
import { ConfigFile, configBackupsDirectory } from '../../config/config-file.ts';
import { FileSettingsDocument } from '../../config/file-settings-document.ts';
import { factoryPorts, ListeningPorts } from '../listening-ports.ts';
import { StreamOperationLog } from '../operation-log.ts';
import { openProject, type ProjectRuntime } from '../project/project-runtime.ts';
import { SystemClock } from '../system.ts';
import { openEventLog } from './event-log.ts';
import type { InstallationContext, SourceEnvironment } from './installation-context.ts';
import { LiveInstallation } from './live-installation.ts';
import { installationNotifier } from './notifications.ts';
import { definedEnvironment, installationToolProber, installationTools, projectToolProber, type ConfiguredTool } from './tools.ts';
import { ConfiguredToolSessions } from './tool-sessions.ts';
import { usageRefresher, usageReportSource } from './usage.ts';

export const INSTALLATION_MODES = ['live', 'demo', 'rehearsal'] as const;
export type InstallationMode = (typeof INSTALLATION_MODES)[number];
const UTF8 = 'utf8';
const NO_FILM_TIMEOUT_MS = 0;
const OPERATOR_VARIABLE = 'USER';
const UNNAMED_OPERATOR = 'operator';

export interface InstallationOverrides {
  /** Replaces the Claude CLI for agent runs. */
  readonly harnessFor?: (project: ProjectConfig) => AgentHarness;
  readonly resources?: ResourceGuard;
  readonly usage?: UsageReportSource;
  readonly fetch?: NotifyFetchFunction;
  readonly log?: OperationLog;
  readonly clock?: Clock;
  readonly platform?: string;
  readonly userHome?: string;
  readonly mode?: InstallationMode;
  /** Opens only these projects of the configuration; every project when absent. */
  readonly projects?: readonly string[];
  /** The person running the factory; the USER of the environment when absent. */
  readonly operator?: string;
  /** `awaited` for a command that ends once it has answered, so a local forge's gate it starts runs to its end. */
  readonly localChecks?: LocalCheckScheduling;
}

export interface InstallationRuntime extends InstallationContext {
  readonly live: LiveInstallation;
  readonly mode: InstallationMode;
  /** Who acts when the cockpit is used from this machine, and whose name the cockpit shows. */
  readonly operator: string;
  /** Notices about the whole installation, such as its pauses, linking to the cockpit's home. */
  readonly notifications: OperatorNotifications;
  readonly tools: ToolProber;
  readonly configuredTools: readonly ConfiguredTool[];
  readonly settingsDocument: SettingsDocument;
  readonly projects: readonly ProjectRuntime[];
  project(id: string): ProjectRuntime;
  projectTools(id: string): ToolProber;
  /** The logins and keep-alives the installation's own tools declare. */
  readonly toolSessions: ConfiguredToolSessions;
  /** The logins and keep-alives a project's tools declare. */
  projectToolSessions(id: string): ConfiguredToolSessions;
  /** Applies a settings change to the configuration file and records it; the running daemon picks it up. */
  changeSettings(change: SettingsChange, operator: string): Promise<number>;
  close(): void;
}

/** A runner that stops its command when the signal aborts, for the logins and keep-alives of the tools. */
function sessionRunner(signal: AbortSignal): CommandRunner {
  return new SpawnCommandRunner({ abortSignal: signal });
}

function processLog(clock: Clock): OperationLog {
  return new StreamOperationLog((line) => process.stderr.write(`${line}\n`), clock);
}

function inferredMode(config: AgentFactoryConfig): InstallationMode {
  return config.projects.every((project) => project.forge.kind === 'local') ? 'rehearsal' : 'live';
}

function selectedProjects(config: AgentFactoryConfig, ids: readonly string[] | undefined): readonly ProjectConfig[] {
  return ids === undefined ? config.projects : ids.map((id) => projectOf(config, id));
}

/** The films of the projects that film wait in one queue; a film is expected to take as long as the longest timeout until some succeed. */
function filmLedgerOf(config: AgentFactoryConfig, events: EventStore, clock: Clock): FilmLedger | null {
  const filming = config.projects.flatMap((project) => (project.evidence.films === null ? [] : [{ id: project.id, timeoutMs: project.evidence.films.timeoutMs }]));
  if (filming.length === 0) return null;
  return FilmLedger.ofInstallation(events, filming.map((project) => project.id), clock, Math.max(NO_FILM_TIMEOUT_MS, ...filming.map((project) => project.timeoutMs)));
}

function configurationLoader(config: AgentFactoryConfig, userHome: string): () => Promise<AgentFactoryConfig> {
  return async () => parseAgentFactoryConfig(await readFile(config.configPath, UTF8), config.home, config.configPath, userHome);
}

/** Opens an installation and every project of its configuration. */
export async function openInstallation(config: AgentFactoryConfig, environment: SourceEnvironment, overrides: InstallationOverrides = {}): Promise<InstallationRuntime> {
  const clock = overrides.clock ?? new SystemClock();
  const log = overrides.log ?? processLog(clock);
  const platform = overrides.platform ?? process.platform;
  const userHome = overrides.userHome ?? homedir();
  const runner = new SpawnCommandRunner();
  const eventLog = openEventLog(config.directories.state);
  const lifetime = new AbortController();
  try {
    const live = new LiveInstallation(config, configurationLoader(config, userHome));
    const events = eventLog.events;
    const resources = overrides.resources ?? createResourceGuard(platform, runner, definedEnvironment(environment));
    const admission = new AgentRunAdmission(resources, config.resources);
    const budget = new BudgetGovernor(events, clock, {
      accounts: config.claude.accounts.map((account) => account.name),
      thresholds: config.budget.thresholds,
      dailyCap: config.budget.dailyCap,
      perRunCapUsd: config.budget.perRunCapUsd,
      staleAfterMs: config.claude.usage.staleAfterMs,
    });
    const runSlots = new RunSlots(config.resources.maxConcurrentRuns);
    live.onChange((current) => {
      admission.updatePolicy(current.resources);
      runSlots.updateCapacity(current.resources.maxConcurrentRuns);
      budget.updateLimits({ thresholds: current.budget.thresholds, dailyCap: current.budget.dailyCap, perRunCapUsd: current.budget.perRunCapUsd });
    });
    const usage = usageRefresher(config, budget, overrides.usage ?? usageReportSource(config, { clock, environment, workingDirectory: config.home }), events, clock, log);
    const notifier: Notifier = installationNotifier(config, { platform, runner, environment, fetch: overrides.fetch ?? fetch, clock });
    const listeningPorts = new ListeningPorts(factoryPorts(config.server.port));
    const context: InstallationContext = {
      get config(): AgentFactoryConfig {
        return live.config;
      },
      environment,
      platform,
      userHome,
      clock,
      log,
      runner,
      events,
      runLogs: new FileRunLogStore(config.directories.runLogs, clock),
      resources,
      admission,
      budget,
      usage,
      runSlots,
      listeningPorts,
      notifier,
      lifetime: lifetime.signal,
      localChecks: overrides.localChecks ?? 'background',
      filmLedger: filmLedgerOf(config, events, clock),
      harnessFor: overrides.harnessFor ?? null,
    };
    const projects: ProjectRuntime[] = [];
    for (const project of selectedProjects(config, overrides.projects)) projects.push(await openProject(context, project));
    live.onChange((current) => {
      for (const project of projects) project.reconfigure(current);
    });
    const toolSettings = { runner, environment, platform, workingDirectory: config.home };
    const settingsDocument = new FileSettingsDocument(new ConfigFile(config.configPath, configBackupsDirectory(config.directories.state), clock), (text) =>
      parseAgentFactoryConfig(text, config.home, config.configPath, userHome),
    );
    return {
      ...context,
      get config(): AgentFactoryConfig {
        return live.config;
      },
      live,
      mode: overrides.mode ?? inferredMode(config),
      operator: overrides.operator ?? environment[OPERATOR_VARIABLE] ?? UNNAMED_OPERATOR,
      notifications: new OperatorNotifications(notifier, config.server.publicUrl, log),
      tools: installationToolProber(config, toolSettings),
      configuredTools: installationTools(config),
      settingsDocument,
      projects,
      project: (id) => {
        const found = projects.find((project) => project.id === id);
        if (found === undefined) throw new UnknownProjectError(id, projects.map((project) => project.id));
        return found;
      },
      projectTools: (id) => projectToolProber(projectOf(live.config, id), toolSettings),
      toolSessions: new ConfiguredToolSessions(config.tools, sessionRunner, { environment, home: userHome }),
      projectToolSessions: (id) => new ConfiguredToolSessions(projectOf(live.config, id).tools, sessionRunner, { environment, home: userHome }),
      changeSettings: (change, operator) => new ChangeSettings({ events, document: settingsDocument }).change(change, operator),
      close: () => {
        lifetime.abort();
        eventLog.close();
      },
    };
  } catch (error) {
    lifetime.abort();
    eventLog.close();
    throw error;
  }
}
