import { homedir } from 'node:os';
import {
  ClaudeCodeHarness,
  claudeHarnessConfig,
  FileKnowledgePack,
  FileLogArchive,
  FileRolePromptCatalog,
  FileRunLogStore,
  GitBaseCheckouts,
  GitSourceControl,
  GitWorktreePool,
  GoogleChatNotifier,
  HttpHealthProbe,
  MacosResourceGuard,
  NodeWorkspaceFiles,
  NoopNotifier,
  SpawnCommandRunner,
  type NotifyFetchFunction,
} from '@agent-factory/adapters';
import { readFile } from 'node:fs/promises';
import { dailyCapOfAmount } from '@agent-factory/domain';
import {
  AgentRunAdmission,
  BudgetGovernor,
  DedupingNotifier,
  GovernedHarness,
  MarkdownSpecReader,
  OperatorNotifications,
  RecordingHarness,
} from '@agent-factory/application';
import type {
  AgentHarness,
  BaseCheckouts,
  Clock,
  ConfigurationSource,
  SettingsDocument,
  ToolProber,
  HealthProbe,
  KnowledgePack,
  Notifier,
  OperationLog,
  PipelineDependencies,
  PipelineSettings,
  ResourceGuard,
  RunLogStore,
} from '@agent-factory/application';
import { ConfigFile, configBackupsDirectory } from '../config/config-file.ts';
import { parseFactoryConfig, type FactoryConfig } from '../config/factory-config.ts';
import { FileSettingsDocument } from '../config/file-settings-document.ts';
import { checkCommandEnvironment, pipelineSettingsFrom } from '../config/pipeline-settings-from-config.ts';
import { agentDeniedReadPaths, commandSandbox, factoryListeningPorts, knownSecretSource } from './confinement.ts';
import { ListeningPorts } from './listening-ports.ts';
import { openEventLog } from './event-log.ts';
import { agentProtectedDirectories, factoryGitEnvironment, openGitHubGateway } from './github-gateway.ts';
import { FACTORY_INSTALL_DIRECTORY, ROLE_PROMPTS_DIRECTORY } from './install-paths.ts';
import { LiveConfiguration } from './live-configuration.ts';
import { baseWorkspaces } from './base-workspaces.ts';
import { toolProber } from './tool-checks.ts';
import { StreamOperationLog } from './operation-log.ts';
import { RandomRunIds, SystemClock } from './system.ts';

export type SourceEnvironment = Readonly<Record<string, string | undefined>>;

export const NOTIFICATION_TIMEOUT_MS = 10_000;
const USAGE_STALE_AFTER_MS = 30 * 60_000;

export interface FactoryOverrides {
  readonly harness?: AgentHarness;
  readonly resources?: ResourceGuard;
  readonly fetch?: NotifyFetchFunction;
  readonly log?: OperationLog;
  readonly clock?: Clock;
}

export interface FactoryContainer {
  readonly config: FactoryConfig;
  readonly environment: SourceEnvironment;
  readonly listeningPorts: ListeningPorts;
  readonly dependencies: PipelineDependencies;
  readonly settings: PipelineSettings;
  readonly clock: Clock;
  readonly runLogs: RunLogStore;
  readonly admission: AgentRunAdmission;
  readonly budget: BudgetGovernor;
  readonly notifications: OperatorNotifications;
  readonly log: OperationLog;
  readonly checkouts: BaseCheckouts;
  readonly knowledge: KnowledgePack;
  readonly health: HealthProbe;
  readonly configuration: ConfigurationSource;
  readonly settingsDocument: SettingsDocument;
  readonly tools: ToolProber;
  close(): void;
}

const UTF8 = 'utf8';

function configurationLoader(config: FactoryConfig): () => Promise<FactoryConfig> {
  return async () => parseFactoryConfig(await readFile(config.configPath, UTF8), config.home, config.configPath);
}

function baseHarness(config: FactoryConfig, environment: SourceEnvironment): AgentHarness {
  return new ClaudeCodeHarness(
    claudeHarnessConfig({
      runsDirectory: config.directories.runs,
      factoryInstallDirectory: FACTORY_INSTALL_DIRECTORY,
      protectedDirectories: agentProtectedDirectories(config),
      writableDirectories: config.claude.writableDirectories,
      toolEnvironment: config.gate.environmentSet,
      command: config.claude.command,
      niceness: config.claude.niceness,
      sourceEnvironment: environment,
      gateTimeoutMs: config.gate.timeoutMs,
      accounts: Object.fromEntries(config.claude.accounts.map((account) => [account.name, account.configDir])),
      deniedReadPaths: agentDeniedReadPaths(config),
    }),
  );
}

function notifier(config: FactoryConfig, environment: SourceEnvironment, fetchFunction: NotifyFetchFunction, clock: Clock): Notifier {
  const variable = config.notifications.googleChatWebhookVariable;
  const webhookUrl = variable === null ? undefined : environment[variable];
  const delivered: Notifier =
    webhookUrl === undefined || webhookUrl === '' ? new NoopNotifier() : new GoogleChatNotifier({ webhookUrl, fetch: fetchFunction, timeoutMs: NOTIFICATION_TIMEOUT_MS });
  return new DedupingNotifier(delivered, clock, config.notifications.dedupeWindowMs);
}

function processLog(clock: Clock): OperationLog {
  return new StreamOperationLog((line) => process.stderr.write(`${line}\n`), clock);
}

export async function openFactory(config: FactoryConfig, environment: SourceEnvironment, overrides: FactoryOverrides = {}): Promise<FactoryContainer> {
  const runner = new SpawnCommandRunner();
  const clock = overrides.clock ?? new SystemClock();
  const log = overrides.log ?? processLog(clock);
  const gitEnvironment = factoryGitEnvironment(config, environment);
  const github = await openGitHubGateway(config, runner, environment, clock);
  const eventLog = openEventLog(config);
  try {
    const listeningPorts = new ListeningPorts(factoryListeningPorts(config));
    const live = new LiveConfiguration(config, configurationLoader(config));
    let settings = pipelineSettingsFrom(config, environment);
    const resources = overrides.resources ?? new MacosResourceGuard(runner, checkCommandEnvironment(config, environment));
    const admission = new AgentRunAdmission(resources, settings.resources);
    const budget = new BudgetGovernor(eventLog.events, clock, {
      accounts: config.claude.accounts.map((account) => account.name),
      thresholds: config.budget.thresholds,
      dailyCap: dailyCapOfAmount(config.budget.dailyCapUsd),
      perRunCapUsd: config.budget.perRunCapUsd,
      staleAfterMs: USAGE_STALE_AFTER_MS,
    });
    live.onChange((current) => {
      settings = pipelineSettingsFrom(current, environment);
      admission.updatePolicy(current.resources);
      budget.updateLimits({ thresholds: current.budget.thresholds, dailyCap: dailyCapOfAmount(current.budget.dailyCapUsd), perRunCapUsd: current.budget.perRunCapUsd });
    });
    const runLogs = new FileRunLogStore(config.directories.runLogs, clock);
    const recorded = new RecordingHarness(overrides.harness ?? baseHarness(config, environment), eventLog.events, clock, runLogs);
    const dependencies: PipelineDependencies = {
      github,
      specReader: new MarkdownSpecReader(settings.conventions),
      pool: new GitWorktreePool(runner, {
        targetClonePath: config.target.clonePath,
        poolDirectory: config.worktreePool.directory,
        repositoryName: config.target.name,
        baseBranch: config.target.baseBranch,
        environment: gitEnvironment,
        size: config.worktreePool.size,
      }),
      sourceControl: new GitSourceControl(runner, { environment: gitEnvironment, identity: config.github.commitIdentity }),
      harness: new GovernedHarness(recorded, admission, budget),
      roles: await FileRolePromptCatalog.load(ROLE_PROMPTS_DIRECTORY),
      runner,
      sandbox: commandSandbox(config, homedir(), listeningPorts),
      knownSecrets: knownSecretSource(config, runner, environment),
      events: eventLog.events,
      states: eventLog.states,
      files: new NodeWorkspaceFiles(),
      logs: new FileLogArchive(config.directories.logs),
      resources,
      ids: new RandomRunIds(),
      baseWorkspaces: baseWorkspaces(config, environment, runner),
    };
    return {
      get config(): FactoryConfig {
        return live.config;
      },
      get settings(): PipelineSettings {
        return settings;
      },
      environment,
      listeningPorts,
      dependencies,
      clock,
      runLogs,
      admission,
      budget,
      notifications: new OperatorNotifications(notifier(config, environment, overrides.fetch ?? fetch, clock), config.server.publicUrl, log),
      log,
      checkouts: new GitBaseCheckouts(runner, {
        targetClonePath: config.target.clonePath,
        checkoutsDirectory: config.directories.checkouts,
        baseBranch: config.target.baseBranch,
        environment: gitEnvironment,
      }),
      knowledge: new FileKnowledgePack(config.directories.knowledge),
      health: new HttpHealthProbe({ targets: config.release.prepHealthChecks }),
      configuration: live,
      settingsDocument: new FileSettingsDocument(
        new ConfigFile(config.configPath, configBackupsDirectory(config.directories.state), clock),
        (text) => parseFactoryConfig(text, config.home, config.configPath),
      ),
      tools: toolProber(config, environment, runner, config.home),
      close: eventLog.close,
    };
  } catch (error) {
    eventLog.close();
    throw error;
  }
}
