import {
  buildGhEnvironment,
  CliToolProber,
  createCommandSandbox,
  DEFAULT_TOOL_PROBE_TIMEOUT_MS,
  DeclarativeToolProber,
  RoutingToolProber,
  userTemporaryDirectories,
  type DeclaredTool,
} from '@agent-factory/adapters';
import type { CommandRunner, ToolProber } from '@agent-factory/application';
import { BUILT_IN_TOOLS, type BuiltInTool } from '@agent-factory/domain';
import type { AgentFactoryConfig, ProjectConfig, ToolCheckConfig } from '../../config/agent-factory-config.ts';
import type { SourceEnvironment } from './installation-context.ts';

export const SANDBOX_PROBE_EXECUTABLE = '/usr/bin/true';
const GITHUB_ONLY_TOOL: BuiltInTool = 'gh';

/** A tool the cockpit lists and `validate` checks. */
export interface ConfiguredTool {
  readonly name: string;
  readonly description: string | null;
  readonly builtIn: boolean;
  readonly installHint: string | null;
}

export function definedEnvironment(environment: SourceEnvironment): Record<string, string> {
  return Object.fromEntries(Object.entries(environment).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])));
}

function declared(tool: ToolCheckConfig): DeclaredTool {
  return {
    name: tool.name,
    description: tool.description ?? '',
    check: tool.check,
    version: tool.version,
    connectedPattern: tool.connectedPattern,
    fix: tool.fix,
    install: tool.install,
    timeoutMs: tool.timeoutMs,
  };
}

/** The built-in tools the installation needs: gh only when a project's forge is GitHub. */
export function builtInTools(config: AgentFactoryConfig): readonly BuiltInTool[] {
  const github = config.projects.some((project) => project.forge.kind === 'github');
  return BUILT_IN_TOOLS.filter((tool) => tool !== GITHUB_ONLY_TOOL || github);
}

export function installationTools(config: AgentFactoryConfig): readonly ConfiguredTool[] {
  return [
    ...builtInTools(config).map((name) => ({ name, description: null, builtIn: true, installHint: null })),
    ...config.tools.map((tool) => ({ name: tool.name, description: tool.description, builtIn: false, installHint: tool.install })),
  ];
}

export function projectTools(project: ProjectConfig): readonly ConfiguredTool[] {
  return project.tools.map((tool) => ({ name: tool.name, description: tool.description, builtIn: false, installHint: tool.install }));
}

/** The command that proves the command sandbox works on this machine: an empty command, confined. */
export function sandboxProbeCommand(platform: string, directory: string): readonly string[] {
  const sandbox = createCommandSandbox(platform, { deniedReads: [], writableDirectories: [], temporaryDirectories: userTemporaryDirectories(platform), blockedPorts: () => [] });
  return sandbox.confine([SANDBOX_PROBE_EXECUTABLE], { workingDirectory: directory, network: false });
}

export interface ToolProberSettings {
  readonly runner: CommandRunner;
  readonly environment: SourceEnvironment;
  readonly platform: string;
  readonly workingDirectory: string;
}

export function installationToolProber(config: AgentFactoryConfig, settings: ToolProberSettings): ToolProber {
  const environment = definedEnvironment(settings.environment);
  const builtIn = new CliToolProber(settings.runner, {
    environment,
    ghEnvironment: buildGhEnvironment(settings.environment),
    claudeCommand: config.claude.command,
    sandboxProbe: sandboxProbeCommand(settings.platform, settings.workingDirectory),
    sandboxEnvironment: environment,
    workingDirectory: settings.workingDirectory,
    timeoutMs: DEFAULT_TOOL_PROBE_TIMEOUT_MS,
  });
  const declaredTools = new DeclarativeToolProber(settings.runner, { tools: config.tools.map(declared), environment, workingDirectory: settings.workingDirectory });
  return new RoutingToolProber(builtIn, declaredTools);
}

export function projectToolProber(project: ProjectConfig, settings: ToolProberSettings): ToolProber {
  return new DeclarativeToolProber(settings.runner, { tools: project.tools.map(declared), environment: definedEnvironment(settings.environment), workingDirectory: settings.workingDirectory });
}
