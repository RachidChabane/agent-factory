import type { CommandRunner, ToolProber } from '@agent-factory/application';
import { isBuiltInTool, type BuiltInTool, type ToolName, type ToolProbeResult } from '@agent-factory/domain';
import { PINNED_CLAUDE_VERSION } from '../claude/claude-invocation.ts';
import { exitReading, firstLine, outputOf, succeeded, ToolProbeEngine, type ProbeStrategy } from './tool-probe-engine.ts';

export const DEFAULT_TOOL_PROBE_TIMEOUT_MS = 20_000;
export const NO_PROBE_WITHOUT_CONFIGURATION = 'skipped: the configuration did not load';

const NEWLINE = '\n';
const VERSION_FLAG = '--version';
const LOGGED_IN_PATTERN = /Logged in to /;
const GIT_VERSION_COMMAND: readonly string[] = ['git', VERSION_FLAG];

export interface ToolProbeSettings {
  readonly environment: Readonly<Record<string, string>>;
  readonly ghEnvironment: Readonly<Record<string, string>>;
  readonly claudeCommand: readonly string[];
  readonly sandboxProbe: readonly string[] | null;
  readonly sandboxEnvironment: Readonly<Record<string, string>>;
  readonly workingDirectory: string;
  readonly timeoutMs: number;
}

type StrategyFactory = (settings: ToolProbeSettings) => ProbeStrategy | null;

const BUILT_IN_STRATEGIES: Readonly<Record<BuiltInTool, StrategyFactory>> = {
  git: (settings) => ({
    tool: 'git',
    loginCommand: null,
    installCommand: null,
    command: GIT_VERSION_COMMAND,
    versionCommand: GIT_VERSION_COMMAND,
    environment: settings.environment,
    timeoutMs: settings.timeoutMs,
    interpret: (result) => exitReading(result, 'git is installed', 'error'),
  }),
  gh: (settings) => ({
    tool: 'gh',
    loginCommand: 'gh auth login',
    installCommand: 'brew install gh',
    command: ['gh', 'auth', 'status'],
    versionCommand: ['gh', VERSION_FLAG],
    environment: settings.ghEnvironment,
    timeoutMs: settings.timeoutMs,
    interpret: (result) => {
      const reading = exitReading(result, 'logged in to GitHub');
      const loggedIn = outputOf(result).split(NEWLINE).find((line) => LOGGED_IN_PATTERN.test(line))?.trim();
      return reading.status === 'connected' && loggedIn !== undefined ? { status: 'connected', detail: loggedIn } : reading;
    },
  }),
  claude: (settings) => ({
    tool: 'claude',
    loginCommand: `claude install ${PINNED_CLAUDE_VERSION}`,
    installCommand: `claude install ${PINNED_CLAUDE_VERSION}`,
    command: [...settings.claudeCommand, VERSION_FLAG],
    versionCommand: null,
    environment: settings.environment,
    timeoutMs: settings.timeoutMs,
    interpret: (result) => {
      const line = firstLine(outputOf(result));
      if (!succeeded(result)) return { status: 'error', detail: line };
      return line.includes(PINNED_CLAUDE_VERSION)
        ? { status: 'connected', detail: line }
        : { status: 'error', detail: `${line} differs from the pinned version ${PINNED_CLAUDE_VERSION}` };
    },
  }),
  sandbox: (settings) =>
    settings.sandboxProbe === null
      ? null
      : {
          tool: 'sandbox',
          loginCommand: null,
          installCommand: null,
          command: settings.sandboxProbe,
          versionCommand: null,
          environment: settings.sandboxEnvironment,
          timeoutMs: settings.timeoutMs,
          interpret: (result) =>
            succeeded(result)
              ? { status: 'connected', detail: 'setup and gate commands run confined: no credential reads, no writes outside their worktree, no network unless declared' }
              : { status: 'error', detail: `the command sandbox refused to run the probe: ${firstLine(outputOf(result))}` },
        },
};

export class CliToolProber implements ToolProber {
  private readonly engine: ToolProbeEngine;
  private readonly settings: ToolProbeSettings;

  constructor(runner: CommandRunner, settings: ToolProbeSettings) {
    this.engine = new ToolProbeEngine(runner, settings.workingDirectory);
    this.settings = settings;
  }

  async probe(tool: ToolName): Promise<ToolProbeResult> {
    if (!isBuiltInTool(tool)) return { tool, status: 'error', version: null, detail: `${tool} is not a built-in tool`, fixCommand: null };
    const strategy = BUILT_IN_STRATEGIES[tool](this.settings);
    if (strategy === null) return { tool, status: 'error', version: null, detail: NO_PROBE_WITHOUT_CONFIGURATION, fixCommand: null };
    return this.engine.probe(strategy);
  }
}
