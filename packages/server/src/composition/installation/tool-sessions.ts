import {
  ToolLoginUnavailableError,
  type CommandRunner,
  type ToolSessionCommands,
  type ToolSessionPurpose,
  type ToolSessionRun,
} from '@agent-factory/application';
import type { ToolCheckConfig } from '../../config/agent-factory-config.ts';
import type { SourceEnvironment } from './installation-context.ts';
import { definedEnvironment } from './tools.ts';

const SHELL = '/bin/sh';
const SHELL_COMMAND_FLAG = '-c';
const MILLISECONDS_PER_SECOND = 1_000;
const EXIT_CODE_OK = 0;

export class ToolKeepAliveUnavailableError extends Error {
  constructor(tool: string) {
    super(`${tool} declares no command that keeps its session alive`);
    this.name = 'ToolKeepAliveUnavailableError';
  }
}

export interface ToolSessionSettings {
  readonly environment: SourceEnvironment;
  /** Where the commands run: the operator's home, as from a terminal. */
  readonly home: string;
}

function seconds(milliseconds: number): number {
  return Math.round(milliseconds / MILLISECONDS_PER_SECOND);
}

/**
 * Runs a tool's declared login and keep-alive as the operator would from a terminal, without one: in their home, with
 * their environment and no standard input, outside the sandbox since a login writes the tool's credentials. What the
 * command prints is never kept, since a login may print the credential it obtained.
 */
export class ConfiguredToolSessions implements ToolSessionCommands {
  private readonly tools: readonly ToolCheckConfig[];
  private readonly runner: CommandRunner;
  private readonly settings: ToolSessionSettings;

  constructor(tools: readonly ToolCheckConfig[], runner: CommandRunner, settings: ToolSessionSettings) {
    this.tools = tools;
    this.runner = runner;
    this.settings = settings;
  }

  async run(tool: string, purpose: ToolSessionPurpose): Promise<ToolSessionRun> {
    const declared = this.tools.find((candidate) => candidate.name === tool);
    const session = purpose === 'login' ? (declared?.login ?? null) : (declared?.keepAlive ?? null);
    if (session === null) throw purpose === 'login' ? new ToolLoginUnavailableError(tool) : new ToolKeepAliveUnavailableError(tool);
    const result = await this.runner.run([SHELL, SHELL_COMMAND_FLAG, session.command], this.settings.home, session.timeoutMs, definedEnvironment(this.settings.environment));
    if (result.timedOut) return { outcome: 'timed-out', detail: `timed out after ${seconds(session.timeoutMs)} s` };
    const ended = `exit code ${result.exitCode} after ${seconds(result.durationMs)} s`;
    return { outcome: result.exitCode === EXIT_CODE_OK ? 'succeeded' : 'failed', detail: ended };
  }

  /** The tools whose session the daemon keeps alive, with how often. */
  keptSessions(): readonly { readonly tool: string; readonly everyMs: number }[] {
    return this.tools.flatMap((tool) => (tool.keepAlive === null ? [] : [{ tool: tool.name, everyMs: tool.keepAlive.everyMs }]));
  }
}
