import {
  DEFAULT_PREFLIGHT_DRY_TIMEOUT_MS,
  DEFAULT_PREFLIGHT_SETUP_TIMEOUT_MS,
  DEFAULT_PREFLIGHT_STEP_TIMEOUT_MS,
  GatePreflight,
  ShellCommands,
  type CommandRunner,
} from '@agent-factory/application';
import type { AgentFactoryConfig, ProjectConfig } from '../../config/agent-factory-config.ts';
import { factoryPorts, ListeningPorts } from '../listening-ports.ts';
import { baseWorkspaces } from './base-workspaces.ts';
import { commandSandbox } from './confinement.ts';
import { projectGitEnvironment } from './forge.ts';
import { checkEnvironment, type SourceEnvironment } from './project-settings.ts';

export interface PreflightSettings {
  readonly runner: CommandRunner;
  readonly environment: SourceEnvironment;
  readonly platform: string;
  readonly home: string;
}

/** Runs a project's setup and gate commands on a clean checkout of its base, confined as the pipeline confines them. */
export function projectGatePreflight(config: AgentFactoryConfig, project: ProjectConfig, settings: PreflightSettings): GatePreflight {
  const { runner, environment, platform, home } = settings;
  const sandbox = commandSandbox(config, project, { platform, home, environment, listening: new ListeningPorts(factoryPorts(config.server.port)) });
  const shell = new ShellCommands(runner, sandbox, checkEnvironment(project, environment), project.gate.timeoutMs, project.gate.niceness);
  return new GatePreflight(
    { workspaces: baseWorkspaces(project, runner, projectGitEnvironment(project, environment)), shell },
    {
      setupCommands: project.setupCommands,
      commandsBeforeAcceptance: project.gate.commandsBeforeAcceptance,
      commandsAfterAcceptance: project.gate.commandsAfterAcceptance,
      stepTimeoutMs: DEFAULT_PREFLIGHT_STEP_TIMEOUT_MS,
      dryTimeoutMs: DEFAULT_PREFLIGHT_DRY_TIMEOUT_MS,
      setupTimeoutMs: Math.min(project.gate.timeoutMs, DEFAULT_PREFLIGHT_SETUP_TIMEOUT_MS),
    },
  );
}
