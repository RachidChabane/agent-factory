import { NodeWorkspaceFiles, SpawnCommandRunner } from '@agent-factory/adapters';
import type { Clock, CommandRunner, WorkspaceFiles } from '@agent-factory/application';
import { SystemClock } from '../composition/system.ts';
import { loadFactoryConfig, type FactoryConfig } from '../config/factory-config.ts';
import { openEventLog, type EventLog } from '../composition/event-log.ts';
import { openFactory, type FactoryContainer, type SourceEnvironment } from '../composition/factory-container.ts';
import type { CliOutput } from './output.ts';

export interface CliContext {
  readonly environment: SourceEnvironment;
  readonly output: CliOutput;
  readonly runner: CommandRunner;
  readonly files: WorkspaceFiles;
  readonly clock: Clock;
  loadConfig(): Promise<FactoryConfig>;
  openFactory(config: FactoryConfig): Promise<FactoryContainer>;
  openEventLog(config: FactoryConfig): EventLog;
}

export function defaultCliContext(environment: SourceEnvironment, output: CliOutput): CliContext {
  return {
    environment,
    output,
    runner: new SpawnCommandRunner(),
    files: new NodeWorkspaceFiles(),
    clock: new SystemClock(),
    loadConfig: () => loadFactoryConfig(environment),
    openFactory: (config) => openFactory(config, environment),
    openEventLog,
  };
}
