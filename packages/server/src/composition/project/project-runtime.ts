import { join } from 'node:path';
import {
  ClaudeCodeHarness,
  claudeHarnessConfig,
  EventSourcedIssueStateStore,
  FileLogArchive,
  FileRolePromptCatalog,
  GitBaseCheckouts,
  GitObjects,
  GitSourceControl,
  GitWorktreePool,
  LayeredRolePromptCatalog,
  NodeWorkspaceFiles,
  SourcesKnowledgePack,
  SpawnServiceProcesses,
} from '@agent-factory/adapters';
import {
  GovernedHarness,
  HealthMonitor,
  OperatorNotifications,
  parseIssueSpec,
  ProjectEventStore,
  RecordingHarness,
  SlottedHarness,
  StackSlots,
  type AgentHarness,
  type BaseCheckouts,
  type DeliveryEnvironment,
  type EnvironmentHealth,
  type GitHubGateway,
  type OperationLog,
  type PipelineDependencies,
  type PipelineSettings,
  type ProjectConventions,
  type SpecReader,
} from '@agent-factory/application';
import type { AgentFactoryConfig, ProjectConfig } from '../../config/agent-factory-config.ts';
import type { InstallationContext } from '../installation/installation-context.ts';
import { FACTORY_INSTALL_DIRECTORY, ROLE_PROMPTS_DIRECTORY } from '../install-paths.ts';
import { RandomRunIds } from '../system.ts';
import { baseWorkspaces } from './base-workspaces.ts';
import { agentDeniedReadPaths, agentShellCommands, commandSandbox, knownSecretSource, projectEngineSockets } from './confinement.ts';
import { deliveryEnvironments, monitoredEnvironments, releaseGateHealth } from './delivery.ts';
import { openProjectFilms, type ProjectFilms } from './films.ts';
import { openForge, projectGitEnvironment } from './forge.ts';
import { ProjectRepository } from './project-repository.ts';
import { localGateChecks } from './local-checks.ts';
import { pipelineSettings } from './project-settings.ts';

export const PROJECT_LINK_SEGMENT = 'projects';
/** Where the services of a project's stacks write their output, under the project's logs. */
const STACK_LOG_DIRECTORY = 'stacks';

/** One project of the installation, with everything its use cases need and its settings kept current. */
export interface ProjectRuntime {
  readonly id: string;
  readonly config: ProjectConfig;
  readonly settings: PipelineSettings;
  readonly conventions: ProjectConventions;
  /** The dependencies of the project's use cases; `events` is the project's own view of the log. */
  readonly dependencies: PipelineDependencies;
  readonly forge: GitHubGateway;
  readonly checkouts: BaseCheckouts;
  /** The commits of the project's repository, read from the factory's clone. */
  readonly repository: ProjectRepository;
  readonly knowledge: SourcesKnowledgePack;
  readonly delivery: readonly DeliveryEnvironment[];
  readonly releaseHealth: readonly EnvironmentHealth[];
  readonly health: HealthMonitor;
  /** The films of the project, when it declares a film command. */
  readonly films: ProjectFilms | null;
  readonly notifications: OperatorNotifications;
  readonly log: OperationLog;
  /** Takes the settings that apply without a restart (roles, concurrency) from a reloaded configuration. */
  reconfigure(config: AgentFactoryConfig): void;
}

function projectLog(log: OperationLog, id: string): OperationLog {
  return { info: (message) => log.info(`[${id}] ${message}`), warn: (message) => log.warn(`[${id}] ${message}`) };
}

function projectCockpitUrl(publicUrl: string, id: string): string {
  return `${publicUrl.replace(/\/+$/, '')}/${PROJECT_LINK_SEGMENT}/${encodeURIComponent(id)}`;
}

function baseHarness(installation: InstallationContext, project: ProjectConfig): AgentHarness {
  if (installation.harnessFor !== null) return installation.harnessFor(project);
  const { config } = installation;
  return new ClaudeCodeHarness(
    claudeHarnessConfig({
      runsDirectory: config.directories.runs,
      factoryInstallDirectory: FACTORY_INSTALL_DIRECTORY,
      protectedDirectories: project.forge.kind === 'local' ? [project.forge.directory] : [],
      writableDirectories: config.claude.writableDirectories,
      toolEnvironment: project.environment.set,
      command: config.claude.command,
      niceness: config.claude.niceness,
      sourceEnvironment: installation.environment,
      gateTimeoutMs: project.gate.timeoutMs,
      accounts: Object.fromEntries(config.claude.accounts.map((account) => [account.name, account.configDir])),
      deniedReadPaths: agentDeniedReadPaths(config, project),
      home: installation.userHome,
      shellCommands: agentShellCommands(project),
      sandboxAllowedDomains: project.sandbox.allowedDomains,
      engineSockets: projectEngineSockets(project, { platform: installation.platform, home: installation.userHome, environment: installation.environment }),
      platform: installation.platform,
    }),
  );
}

/** Runs are recorded in the installation's log, stamped with the project, and share the installation's run slots. */
export function projectHarness(installation: InstallationContext, project: ProjectConfig): AgentHarness {
  const recorded = new RecordingHarness(baseHarness(installation, project), installation.events, installation.clock, installation.runLogs, project.id);
  return new SlottedHarness(new GovernedHarness(recorded, installation.admission, installation.budget, installation.usage), installation.runSlots);
}

async function rolePrompts(project: ProjectConfig): Promise<LayeredRolePromptCatalog> {
  return LayeredRolePromptCatalog.load(await FileRolePromptCatalog.load(ROLE_PROMPTS_DIRECTORY), project.prompts);
}

export async function openProject(installation: InstallationContext, initial: ProjectConfig): Promise<ProjectRuntime> {
  const { runner, clock, environment } = installation;
  let config = initial;
  let settings = pipelineSettings(installation.config, config, environment);
  const gitEnvironment = projectGitEnvironment(config, environment);
  const events = new ProjectEventStore(installation.events, config.id);
  const gateChecks = localGateChecks(installation.config, config, {
    runner,
    environment,
    platform: installation.platform,
    home: installation.userHome,
    clock,
    lifetime: installation.lifetime,
    scheduling: installation.localChecks,
  });
  const forge = await openForge(config, runner, environment, clock, gateChecks);
  const files = new NodeWorkspaceFiles();
  const specReader: SpecReader = { read: (issue) => parseIssueSpec(issue, settings.conventions) };
  const dependencies: PipelineDependencies = {
    github: forge,
    specReader,
    pool: new GitWorktreePool(runner, {
      targetClonePath: config.clonePath,
      poolDirectory: config.worktreePool.directory,
      repositoryName: config.repository.name,
      baseBranch: config.baseBranch,
      environment: gitEnvironment,
      size: config.worktreePool.size,
    }),
    sourceControl: new GitSourceControl(runner, { environment: gitEnvironment, identity: config.commitIdentity, branchPrefix: config.conventions.branchPrefix }),
    harness: projectHarness(installation, config),
    roles: await rolePrompts(config),
    runner,
    sandbox: commandSandbox(installation.config, config, {
      platform: installation.platform,
      home: installation.userHome,
      environment: installation.environment,
      listening: installation.listeningPorts,
    }),
    knownSecrets: knownSecretSource(config, runner, environment, installation.userHome),
    events,
    states: new EventSourcedIssueStateStore(events),
    files,
    logs: new FileLogArchive(config.directories.logs),
    resources: installation.resources,
    ids: new RandomRunIds(),
    baseWorkspaces: baseWorkspaces(config, runner, gitEnvironment),
    services: new SpawnServiceProcesses(join(config.directories.logs, STACK_LOG_DIRECTORY)),
    stackSlots: new StackSlots(),
  };
  const log = projectLog(installation.log, config.id);
  const cockpitUrl = projectCockpitUrl(installation.config.server.publicUrl, config.id);
  return {
    id: config.id,
    get config(): ProjectConfig {
      return config;
    },
    get settings(): PipelineSettings {
      return settings;
    },
    get conventions(): ProjectConventions {
      return settings.conventions;
    },
    dependencies,
    forge,
    checkouts: new GitBaseCheckouts(runner, {
      targetClonePath: config.clonePath,
      checkoutsDirectory: config.directories.checkouts,
      baseBranch: config.baseBranch,
      environment: gitEnvironment,
    }),
    repository: new ProjectRepository(new GitObjects(config.clonePath, gitEnvironment), events, clock),
    knowledge: new SourcesKnowledgePack(config.knowledge, config.clonePath, files),
    delivery: deliveryEnvironments(config),
    releaseHealth: releaseGateHealth(config),
    health: new HealthMonitor({ events, clock }, { environments: monitoredEnvironments(config), intervalMs: config.delivery.healthIntervalMs }),
    films: openProjectFilms(installation, config, settings, dependencies, cockpitUrl),
    notifications: new OperatorNotifications(installation.notifier, cockpitUrl, log),
    log,
    reconfigure: (reloaded) => {
      const next = reloaded.projects.find((candidate) => candidate.id === config.id);
      if (next === undefined) return;
      config = { ...config, roles: next.roles, concurrency: next.concurrency };
      settings = pipelineSettings(reloaded, config, environment);
    },
  };
}
