import { buildGhEnvironment, CliToolProber, DEFAULT_TOOL_PROBE_TIMEOUT_MS } from '@agent-factory/adapters';
import {
  DEFAULT_PREFLIGHT_DRY_TIMEOUT_MS,
  DEFAULT_PREFLIGHT_SETUP_TIMEOUT_MS,
  DEFAULT_PREFLIGHT_STEP_TIMEOUT_MS,
  GatePreflight,
  ShellCommands,
  type CommandRunner,
} from '@agent-factory/application';
import { DEFAULT_CLAUDE_COMMAND } from '../config/config-schema.ts';
import type { FactoryConfig } from '../config/factory-config.ts';
import { checkCommandEnvironment } from '../config/pipeline-settings-from-config.ts';
import { commandSandbox } from './confinement.ts';
import type { SourceEnvironment } from './factory-container.ts';
import { baseWorkspaces } from './base-workspaces.ts';

export const SANDBOX_PROBE_EXECUTABLE = '/usr/bin/true';

export function definedEnvironment(environment: SourceEnvironment): Record<string, string> {
  return Object.fromEntries(Object.entries(environment).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])));
}

export function sandboxProbeCommand(config: FactoryConfig): readonly string[] {
  return commandSandbox(config).confine([SANDBOX_PROBE_EXECUTABLE], { workingDirectory: config.worktreePool.directory, network: false });
}

export function toolProber(config: FactoryConfig | null, environment: SourceEnvironment, runner: CommandRunner, workingDirectory: string): CliToolProber {
  return new CliToolProber(runner, {
    environment: definedEnvironment(environment),
    ghEnvironment: buildGhEnvironment(environment),
    claudeCommand: config?.claude.command ?? DEFAULT_CLAUDE_COMMAND,
    sandboxProbe: config === null ? null : sandboxProbeCommand(config),
    sandboxEnvironment: config === null ? definedEnvironment(environment) : checkCommandEnvironment(config, environment),
    workingDirectory: config?.home ?? workingDirectory,
    timeoutMs: DEFAULT_TOOL_PROBE_TIMEOUT_MS,
  });
}

export function gatePreflight(config: FactoryConfig, environment: SourceEnvironment, runner: CommandRunner): GatePreflight {
  const shell = new ShellCommands(runner, commandSandbox(config), checkCommandEnvironment(config, environment), config.gate.timeoutMs, config.gate.niceness);
  return new GatePreflight(
    { workspaces: baseWorkspaces(config, environment, runner), shell },
    {
      setupCommands: config.target.setupCommands,
      commandsBeforeAcceptance: config.gate.commandsBeforeAcceptance,
      commandsAfterAcceptance: config.gate.commandsAfterAcceptance,
      stepTimeoutMs: DEFAULT_PREFLIGHT_STEP_TIMEOUT_MS,
      dryTimeoutMs: DEFAULT_PREFLIGHT_DRY_TIMEOUT_MS,
      setupTimeoutMs: Math.min(config.gate.timeoutMs, DEFAULT_PREFLIGHT_SETUP_TIMEOUT_MS),
    },
  );
}
