import { checkTool, logInTool, type EventStore, type ToolProber, type ToolSessionCommands } from '@agent-factory/application';
import type { ToolProbeResult } from '@agent-factory/domain';
import { builtInTools } from '../../composition/installation/tools.ts';
import type { InstallationRuntime } from '../../composition/installation/installation-runtime.ts';
import { projectOf, type AgentFactoryConfig } from '../../config/agent-factory-config.ts';
import type { CliContext } from '../cli-context.ts';
import { PROJECT_OPTION } from '../command-line.ts';
import { EXIT_CODES } from '../output.ts';
import { abortOnShutdown } from '../shutdown.ts';

const CONNECTED = 'connected';

export class UnknownToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownToolError';
  }
}

/** The project whose configuration declares the tool, or null for a tool of the installation itself. */
export function toolOwner(config: AgentFactoryConfig, tool: string, requested: string | null): string | null {
  if (requested !== null) {
    const project = projectOf(config, requested);
    if (!project.tools.some((declared) => declared.name === tool)) throw new UnknownToolError(`${project.id} declares no tool named ${tool}`);
    return project.id;
  }
  if (builtInTools(config).some((name) => name === tool) || config.tools.some((declared) => declared.name === tool)) return null;
  const owners = config.projects.filter((project) => project.tools.some((declared) => declared.name === tool)).map((project) => project.id);
  const [only, ...others] = owners;
  if (only === undefined) throw new UnknownToolError(`no tool named ${tool} is declared by the installation or any project`);
  if (others.length > 0) throw new UnknownToolError(`${tool} is declared by ${owners.join(', ')}; name the project with ${PROJECT_OPTION} <id>`);
  return only;
}

interface ToolScope {
  readonly events: EventStore;
  readonly prober: ToolProber;
  readonly sessions: ToolSessionCommands;
}

function scopeOf(installation: InstallationRuntime, project: string | null): ToolScope {
  if (project === null) return { events: installation.events, prober: installation.tools, sessions: installation.toolSessions };
  return { events: installation.project(project).dependencies.events, prober: installation.projectTools(project), sessions: installation.projectToolSessions(project) };
}

function describe(result: ToolProbeResult): string {
  const version = result.version === null ? '' : ` (${result.version})`;
  const fix = result.status === CONNECTED || result.fixCommand === null ? '' : `; to fix: ${result.fixCommand}`;
  return `${result.tool}: ${result.status}${version}: ${result.detail}${fix}`;
}

/** Checks one connected tool now, or starts its declared login then checks it, and records both as the cockpit does. */
export async function toolCommand(purpose: 'check' | 'login', tool: string, requested: string | null, context: CliContext): Promise<number> {
  const config = await context.loadConfig();
  const owner = toolOwner(config, tool, requested);
  const installation = await context.openInstallation(config, { projects: owner === null ? [] : [owner] });
  const controller = new AbortController();
  const releaseSignals = abortOnShutdown(controller, context.output);
  try {
    const scope = scopeOf(installation, owner);
    if (purpose === 'check') {
      const result = await checkTool(scope.events, scope.prober, tool, installation.operator);
      context.output.line(describe(result));
      return result.status === CONNECTED ? EXIT_CODES.ok : EXIT_CODES.failure;
    }
    const { login, check } = await logInTool(scope, tool, installation.operator, controller.signal);
    context.output.line(`${tool}: login ${login.outcome} (${login.detail})`);
    context.output.line(describe(check));
    return login.outcome === 'succeeded' && check.status === CONNECTED ? EXIT_CODES.ok : EXIT_CODES.failure;
  } finally {
    releaseSignals();
    installation.close();
  }
}
