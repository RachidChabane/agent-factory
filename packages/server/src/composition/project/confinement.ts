import { homedir } from 'node:os';
import {
  BUILT_IN_CREDENTIAL_PATHS,
  concretePaths,
  createCommandSandbox,
  defaultWritableCacheDirectories,
  engineSocketsOf,
  NO_ENGINE_SOCKETS,
  OperatorSecretInventory,
  parsePathPattern,
  userTemporaryDirectories,
  type EngineSockets,
  type PathPattern,
} from '@agent-factory/adapters';
import type { CommandRunner, CommandSandbox, KnownSecretSource } from '@agent-factory/application';
import { resolvePath, type AgentFactoryConfig, type ProjectConfig } from '../../config/agent-factory-config.ts';
import { FACTORY_INSTALL_DIRECTORY } from '../install-paths.ts';
import type { ListeningPorts } from '../listening-ports.ts';
import type { SourceEnvironment } from './project-settings.ts';

/** The shell commands an agent of a project granted the container engine may start. */
export const CONTAINER_ENGINE_COMMANDS: readonly string[] = ['docker *'];
/** Matches a command as typed, and the same command with arguments. */
const COMMAND_WITH_ARGUMENTS = '*';

/** The credential stores no agent and no command of the project may read. */
export function credentialPaths(project: ProjectConfig): readonly string[] {
  return [...BUILT_IN_CREDENTIAL_PATHS, ...project.sandbox.deniedReadPaths];
}

/** The directories of every other project of the installation: one project never reads another's work. */
export function otherProjectsDirectories(config: AgentFactoryConfig, project: ProjectConfig): readonly string[] {
  return config.projects.filter((other) => other.id !== project.id).map((other) => other.directory);
}

/** The factory's own files, which only the factory reads. */
export function installationPrivatePaths(config: AgentFactoryConfig): readonly string[] {
  const { directories } = config;
  return [
    FACTORY_INSTALL_DIRECTORY,
    config.configPath,
    directories.state,
    directories.runs,
    directories.logs,
    ...config.claude.accounts.map((account) => account.configDir),
  ];
}

/** The project's own directories that hold the factory's records rather than the code being worked on. */
export function projectPrivatePaths(project: ProjectConfig): readonly string[] {
  const { directories } = project;
  return [
    directories.checkouts,
    directories.logs,
    directories.evidence,
    directories.requests,
    directories.knowledge,
    ...(project.forge.kind === 'local' ? [project.forge.directory] : []),
  ];
}

/** What an agent run of the project may not read. */
export function agentDeniedReadPaths(config: AgentFactoryConfig, project: ProjectConfig): readonly string[] {
  return [
    ...credentialPaths(project),
    config.configPath,
    config.directories.state,
    config.directories.logs,
    project.directories.evidence,
    ...otherProjectsDirectories(config, project),
  ];
}

function commandDeniedReads(config: AgentFactoryConfig, project: ProjectConfig, home: string): readonly PathPattern[] {
  const paths = [...credentialPaths(project), ...installationPrivatePaths(config), ...projectPrivatePaths(project), ...otherProjectsDirectories(config, project)];
  const patterns = paths.map((pattern) => parsePathPattern(pattern, home));
  const resolved = concretePaths(patterns).map((path): PathPattern => ({ path, prefix: false }));
  const unique = new Map([...patterns, ...resolved].map((pattern) => [`${pattern.prefix ? '*' : ''}${pattern.path}`, pattern]));
  return [...unique.values()];
}

/** Where confined commands may write besides their worktree and the temporary directories. */
export function commandWritableDirectories(config: AgentFactoryConfig, project: ProjectConfig, platform: string, home: string): readonly string[] {
  const caches = project.sandbox.writableDirectories ?? defaultWritableCacheDirectories(platform).map((path) => resolvePath(path, home, home));
  return [...config.claude.writableDirectories, ...caches];
}

export interface EngineSettings {
  readonly platform: string;
  readonly home: string;
  readonly environment: SourceEnvironment;
}

export interface ConfinementSettings extends EngineSettings {
  readonly listening: ListeningPorts;
}

/** The container engine sockets the project's agents and commands may reach: none unless the project grants the engine. */
export function projectEngineSockets(project: ProjectConfig, settings: EngineSettings): EngineSockets {
  return project.sandbox.docker ? engineSocketsOf(settings) : NO_ENGINE_SOCKETS;
}

/** What the writing agents of a project may run besides the built-in commands: the project's own commands and what it declares. */
export function agentShellCommands(project: ProjectConfig): readonly string[] {
  const projectCommands = [...project.setupCommands, ...project.gate.commandsBeforeAcceptance, ...project.gate.commandsAfterAcceptance].map(
    (command) => `${command.run}${COMMAND_WITH_ARGUMENTS}`,
  );
  return [...new Set([...projectCommands, ...project.sandbox.shellCommands, ...(project.sandbox.docker ? CONTAINER_ENGINE_COMMANDS : [])])];
}

export function commandSandbox(config: AgentFactoryConfig, project: ProjectConfig, settings: ConfinementSettings): CommandSandbox {
  return createCommandSandbox(settings.platform, {
    deniedReads: commandDeniedReads(config, project, settings.home),
    writableDirectories: commandWritableDirectories(config, project, settings.platform, settings.home),
    temporaryDirectories: userTemporaryDirectories(settings.platform),
    blockedPorts: () => settings.listening.ports(),
    engineSockets: projectEngineSockets(project, settings),
  });
}

export function knownSecretSource(project: ProjectConfig, runner: CommandRunner, environment: SourceEnvironment, home: string = homedir()): KnownSecretSource {
  return new OperatorSecretInventory(runner, { environment, keychainServices: project.secretScan.keychainServices, home });
}
