import { homedir } from 'node:os';
import {
  BUILT_IN_CREDENTIAL_PATHS,
  concretePaths,
  OperatorSecretInventory,
  parsePathPattern,
  SeatbeltCommandSandbox,
  userTemporaryDirectories,
  type PathPattern,
} from '@agent-factory/adapters';
import { COCKPIT_DEV_SERVER_PORT } from '@agent-factory/cockpit';
import type { CommandRunner, CommandSandbox, KnownSecretSource } from '@agent-factory/application';
import type { FactoryConfig } from '../config/factory-config.ts';
import type { SourceEnvironment } from './factory-container.ts';
import { FACTORY_INSTALL_DIRECTORY } from './install-paths.ts';
import { ListeningPorts } from './listening-ports.ts';

export function credentialPaths(config: FactoryConfig): readonly string[] {
  return [...BUILT_IN_CREDENTIAL_PATHS, ...config.sandbox.deniedReadPaths];
}

export function agentDeniedReadPaths(config: FactoryConfig): readonly string[] {
  return [...credentialPaths(config), config.directories.state, config.directories.logs, config.directories.evidence, config.configPath];
}

export function factoryPrivatePaths(config: FactoryConfig): readonly string[] {
  const { directories } = config;
  return [
    FACTORY_INSTALL_DIRECTORY,
    config.configPath,
    directories.state,
    directories.runs,
    directories.logs,
    directories.evidence,
    directories.requests,
    directories.knowledge,
    directories.checkouts,
    config.github.local.directory,
    ...config.claude.accounts.map((account) => account.configDir),
  ];
}

function commandDeniedReads(config: FactoryConfig, home: string): readonly PathPattern[] {
  const patterns = [...credentialPaths(config), ...factoryPrivatePaths(config)].map((pattern) => parsePathPattern(pattern, home));
  const resolved = concretePaths(patterns).map((path): PathPattern => ({ path, prefix: false }));
  const unique = new Map([...patterns, ...resolved].map((pattern) => [`${pattern.prefix ? '*' : ''}${pattern.path}`, pattern]));
  return [...unique.values()];
}

export function factoryListeningPorts(config: FactoryConfig): readonly number[] {
  return [config.server.port, COCKPIT_DEV_SERVER_PORT];
}

export function commandSandbox(config: FactoryConfig, home: string = homedir(), listening: ListeningPorts = new ListeningPorts(factoryListeningPorts(config))): CommandSandbox {
  return new SeatbeltCommandSandbox({
    deniedReads: commandDeniedReads(config, home),
    writableDirectories: [...config.claude.writableDirectories, ...config.sandbox.writableDirectories],
    temporaryDirectories: userTemporaryDirectories(),
    blockedPorts: () => listening.ports(),
  });
}

export function knownSecretSource(config: FactoryConfig, runner: CommandRunner, environment: SourceEnvironment, home: string = homedir()): KnownSecretSource {
  return new OperatorSecretInventory(runner, { environment, keychainServices: config.secretScan.keychainServices, home });
}
