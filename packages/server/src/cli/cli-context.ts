import { homedir } from 'node:os';
import { NodeWorkspaceFiles, SpawnCommandRunner } from '@agent-factory/adapters';
import type { Clock, CommandRunner, WorkspaceFiles } from '@agent-factory/application';
import { loadAgentFactoryConfig, type AgentFactoryConfig } from '../config/agent-factory-config.ts';
import { openEventLog, type EventLog } from '../composition/installation/event-log.ts';
import type { SourceEnvironment } from '../composition/installation/installation-context.ts';
import { openInstallation, type InstallationOverrides, type InstallationRuntime } from '../composition/installation/installation-runtime.ts';
import { SystemClock } from '../composition/system.ts';
import type { CliOutput } from './output.ts';

export interface CliContext {
  readonly environment: SourceEnvironment;
  readonly output: CliOutput;
  readonly runner: CommandRunner;
  readonly files: WorkspaceFiles;
  readonly clock: Clock;
  readonly platform: string;
  /** The operator's home directory, where `~/` paths of the configuration lead. */
  readonly userHome: string;
  /** Where relative paths given on the command line are resolved. */
  readonly workingDirectory: string;
  loadConfig(): Promise<AgentFactoryConfig>;
  openInstallation(config: AgentFactoryConfig, overrides?: InstallationOverrides): Promise<InstallationRuntime>;
  openEventLog(config: AgentFactoryConfig): EventLog;
}

export function defaultCliContext(environment: SourceEnvironment, output: CliOutput): CliContext {
  const userHome = homedir();
  return {
    environment,
    output,
    runner: new SpawnCommandRunner(),
    files: new NodeWorkspaceFiles(),
    clock: new SystemClock(),
    platform: process.platform,
    userHome,
    workingDirectory: process.cwd(),
    loadConfig: () => loadAgentFactoryConfig(environment, userHome),
    openInstallation: (config, overrides = {}) => openInstallation(config, environment, { userHome, ...overrides }),
    openEventLog: (config) => openEventLog(config.directories.state),
  };
}
