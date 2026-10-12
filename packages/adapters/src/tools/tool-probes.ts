import { z } from 'zod';
import type { CommandResult, CommandRunner, ToolProber } from '@agent-factory/application';
import type { ToolName, ToolProbeResult, ToolStatus } from '@agent-factory/domain';
import { PINNED_CLAUDE_VERSION } from '../claude/claude-invocation.ts';
import { CommandSpawnError } from '../process/errors.ts';

export const DEFAULT_TOOL_PROBE_TIMEOUT_MS = 20_000;
export const FIGMA_KEYCHAIN_SERVICE = 'figma-pat';
export const SECURITY_EXECUTABLE = '/usr/bin/security';
const EXIT_CODE_SUCCESS = 0;
const MISSING_FILE_CODE = 'ENOENT';
const NEWLINE = '\n';
const VERSION_PATTERN = /\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?/;
const MAX_DETAIL_CHARACTERS = 300;
const MILLISECONDS_PER_SECOND = 1_000;
const VERSION_FLAG = '--version';
const ACTIVE_ACCOUNT = 'ACTIVE';
const LOGGED_IN_PATTERN = /Logged in to /;
export const NO_PROBE_WITHOUT_CONFIGURATION = 'skipped: the configuration did not load';

export interface ToolProbeSettings {
  readonly environment: Readonly<Record<string, string>>;
  readonly ghEnvironment: Readonly<Record<string, string>>;
  readonly claudeCommand: readonly string[];
  readonly sandboxProbe: readonly string[] | null;
  readonly sandboxEnvironment: Readonly<Record<string, string>>;
  readonly workingDirectory: string;
  readonly timeoutMs: number;
}

interface Reading {
  readonly status: ToolStatus;
  readonly detail: string;
}

interface ProbeStrategy {
  readonly tool: ToolName;
  readonly loginCommand: string | null;
  readonly installCommand: string | null;
  command(settings: ToolProbeSettings): readonly string[] | null;
  environment(settings: ToolProbeSettings): Readonly<Record<string, string>>;
  versionCommand(settings: ToolProbeSettings): readonly string[] | null;
  interpret(result: CommandResult): Reading;
}

function firstLine(text: string): string {
  const line = text.split(NEWLINE).map((entry) => entry.trim()).find((entry) => entry !== '') ?? '';
  return line.length > MAX_DETAIL_CHARACTERS ? `${line.slice(0, MAX_DETAIL_CHARACTERS)}…` : line;
}

function outputOf(result: CommandResult): string {
  return `${result.stdout}\n${result.stderr}`;
}

function succeeded(result: CommandResult): boolean {
  return result.exitCode === EXIT_CODE_SUCCESS && !result.timedOut;
}

function exitReading(result: CommandResult, connected: string, refused: ToolStatus = 'unauthenticated'): Reading {
  return succeeded(result) ? { status: 'connected', detail: firstLine(outputOf(result)) || connected } : { status: refused, detail: firstLine(outputOf(result)) };
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const GcloudAccountsSchema = z.array(z.object({ account: z.string(), status: z.string() }));
const GwsStatusSchema = z.object({ token_valid: z.boolean().optional(), has_refresh_token: z.boolean().optional(), user: z.string().nullable().optional() });
const VaultLookupSchema = z.object({ data: z.object({ display_name: z.string().optional(), ttl: z.number().optional() }) });
const AivenUserSchema = z.array(z.object({ user: z.string().optional(), state: z.string().optional() })).or(z.object({ user: z.string().optional() }));

const operatorEnvironment = (settings: ToolProbeSettings): Readonly<Record<string, string>> => settings.environment;
const noVersion = (): null => null;

const STRATEGIES: Readonly<Record<ToolName, ProbeStrategy>> = {
  gh: {
    tool: 'gh',
    loginCommand: 'gh auth login',
    installCommand: 'brew install gh',
    command: () => ['gh', 'auth', 'status'],
    environment: (settings) => settings.ghEnvironment,
    versionCommand: () => ['gh', VERSION_FLAG],
    interpret: (result) => {
      const reading = exitReading(result, 'logged in to GitHub');
      const loggedIn = outputOf(result).split(NEWLINE).find((line) => LOGGED_IN_PATTERN.test(line))?.trim();
      return reading.status === 'connected' && loggedIn !== undefined ? { status: 'connected', detail: loggedIn } : reading;
    },
  },
  claude: {
    tool: 'claude',
    loginCommand: `claude install ${PINNED_CLAUDE_VERSION}`,
    installCommand: `claude install ${PINNED_CLAUDE_VERSION}`,
    command: (settings) => [...settings.claudeCommand, VERSION_FLAG],
    environment: operatorEnvironment,
    versionCommand: noVersion,
    interpret: (result) => {
      const line = firstLine(outputOf(result));
      if (!succeeded(result)) return { status: 'error', detail: line };
      return line.includes(PINNED_CLAUDE_VERSION)
        ? { status: 'connected', detail: line }
        : { status: 'error', detail: `${line} differs from the pinned version ${PINNED_CLAUDE_VERSION}` };
    },
  },
  pup: {
    tool: 'pup',
    loginCommand: 'pup auth login',
    installCommand: null,
    command: () => ['pup', 'auth', 'status', '--no-agent'],
    environment: operatorEnvironment,
    versionCommand: () => ['pup', VERSION_FLAG],
    interpret: (result) => exitReading(result, 'authenticated with Datadog'),
  },
  tuc: {
    tool: 'tuc',
    loginCommand: 'tuc login',
    installCommand: null,
    command: () => ['tuc', 'whoami'],
    environment: operatorEnvironment,
    versionCommand: () => ['tuc', 'version'],
    interpret: (result) => exitReading(result, 'logged in'),
  },
  gcloud: {
    tool: 'gcloud',
    loginCommand: 'gcloud auth login',
    installCommand: 'brew install --cask google-cloud-sdk',
    command: () => ['gcloud', 'auth', 'list', '--format=json'],
    environment: operatorEnvironment,
    versionCommand: () => ['gcloud', VERSION_FLAG],
    interpret: (result) => {
      if (!succeeded(result)) return { status: 'error', detail: firstLine(outputOf(result)) };
      const accounts = GcloudAccountsSchema.safeParse(parsedJson(result.stdout));
      if (!accounts.success) return { status: 'error', detail: 'gcloud auth list returned an unexpected payload' };
      const active = accounts.data.find((entry) => entry.status === ACTIVE_ACCOUNT);
      return active === undefined ? { status: 'unauthenticated', detail: 'no active Google Cloud account' } : { status: 'connected', detail: active.account };
    },
  },
  vault: {
    tool: 'vault',
    loginCommand: 'vault login',
    installCommand: null,
    command: () => ['vault', 'token', 'lookup', '-format=json'],
    environment: operatorEnvironment,
    versionCommand: () => ['vault', 'version'],
    interpret: (result) => {
      if (!succeeded(result)) return { status: 'unauthenticated', detail: firstLine(result.stderr) || 'the Vault token lookup was refused' };
      const lookup = VaultLookupSchema.safeParse(parsedJson(result.stdout));
      if (!lookup.success) return { status: 'connected', detail: 'Vault token valid' };
      const ttl = lookup.data.data.ttl;
      const name = lookup.data.data.display_name ?? 'token';
      return { status: 'connected', detail: ttl === undefined ? name : `${name}, ${ttl} s left` };
    },
  },
  avn: {
    tool: 'avn',
    loginCommand: 'avn user login <email>',
    installCommand: null,
    command: () => ['avn', 'user', 'info', '--json'],
    environment: operatorEnvironment,
    versionCommand: () => ['avn', VERSION_FLAG],
    interpret: (result) => {
      if (!succeeded(result)) return { status: 'unauthenticated', detail: firstLine(outputOf(result)) };
      const user = AivenUserSchema.safeParse(parsedJson(result.stdout));
      const name = user.success ? (Array.isArray(user.data) ? user.data[0]?.user : user.data.user) : undefined;
      return { status: 'connected', detail: name ?? 'logged in to Aiven' };
    },
  },
  gws: {
    tool: 'gws',
    loginCommand: 'gws auth login',
    installCommand: null,
    command: () => ['gws', 'auth', 'status'],
    environment: operatorEnvironment,
    versionCommand: () => ['gws', VERSION_FLAG],
    interpret: (result) => {
      if (!succeeded(result)) return { status: 'unauthenticated', detail: firstLine(outputOf(result)) };
      const status = GwsStatusSchema.safeParse(parsedJson(result.stdout.slice(Math.max(0, result.stdout.indexOf('{')))));
      if (!status.success) return { status: 'error', detail: 'gws auth status returned an unexpected payload' };
      return status.data.token_valid === true || status.data.has_refresh_token === true
        ? { status: 'connected', detail: status.data.user ?? 'Google Workspace credentials valid' }
        : { status: 'unauthenticated', detail: 'no valid Google Workspace credentials' };
    },
  },
  figma: {
    tool: 'figma',
    loginCommand: `security add-generic-password -a "$USER" -s ${FIGMA_KEYCHAIN_SERVICE} -w`,
    installCommand: null,
    command: () => [SECURITY_EXECUTABLE, 'find-generic-password', '-s', FIGMA_KEYCHAIN_SERVICE],
    environment: operatorEnvironment,
    versionCommand: noVersion,
    interpret: (result) =>
      succeeded(result)
        ? { status: 'connected', detail: `the ${FIGMA_KEYCHAIN_SERVICE} keychain item exists` }
        : { status: 'unauthenticated', detail: `no ${FIGMA_KEYCHAIN_SERVICE} keychain item` },
  },
  sandbox: {
    tool: 'sandbox',
    loginCommand: null,
    installCommand: null,
    command: (settings) => settings.sandboxProbe,
    environment: (settings) => settings.sandboxEnvironment,
    versionCommand: noVersion,
    interpret: (result) =>
      succeeded(result)
        ? { status: 'connected', detail: 'setup and gate commands run under sandbox-exec, without credential reads, keychain or network' }
        : { status: 'error', detail: `sandbox-exec refused the generated profile: ${firstLine(outputOf(result))}` },
  },
};

function isMissingExecutable(error: unknown): boolean {
  if (!(error instanceof CommandSpawnError)) return false;
  const cause: unknown = error.cause;
  return cause instanceof Error && 'code' in cause && cause.code === MISSING_FILE_CODE;
}

function versionOf(result: CommandResult): string | null {
  return VERSION_PATTERN.exec(outputOf(result))?.[0] ?? null;
}

export class CliToolProber implements ToolProber {
  private readonly runner: CommandRunner;
  private readonly settings: ToolProbeSettings;

  constructor(runner: CommandRunner, settings: ToolProbeSettings) {
    this.runner = runner;
    this.settings = settings;
  }

  async probe(tool: ToolName): Promise<ToolProbeResult> {
    const strategy = STRATEGIES[tool];
    const command = strategy.command(this.settings);
    if (command === null) return { tool, status: 'error', version: null, detail: NO_PROBE_WITHOUT_CONFIGURATION, fixCommand: null };
    let result: CommandResult;
    try {
      result = await this.runner.run(command, this.settings.workingDirectory, this.settings.timeoutMs, strategy.environment(this.settings));
    } catch (error) {
      return isMissingExecutable(error)
        ? { tool, status: 'missing', version: null, detail: `${command[0] ?? tool} is not installed or not on the PATH`, fixCommand: strategy.installCommand }
        : { tool, status: 'error', version: null, detail: error instanceof Error ? error.message : String(error), fixCommand: null };
    }
    if (result.timedOut) {
      return {
        tool,
        status: 'unauthenticated',
        version: await this.version(strategy),
        detail: `${command.join(' ')} did not answer within ${Math.round(this.settings.timeoutMs / MILLISECONDS_PER_SECOND)} s; it is probably waiting for a login`,
        fixCommand: strategy.loginCommand,
      };
    }
    const reading = strategy.interpret(result);
    return {
      tool,
      status: reading.status,
      version: await this.version(strategy),
      detail: reading.detail,
      fixCommand: reading.status === 'connected' ? null : strategy.loginCommand,
    };
  }

  private async version(strategy: ProbeStrategy): Promise<string | null> {
    const command = strategy.versionCommand(this.settings);
    if (command === null) return null;
    try {
      const result = await this.runner.run(command, this.settings.workingDirectory, this.settings.timeoutMs, strategy.environment(this.settings));
      return succeeded(result) ? versionOf(result) : null;
    } catch {
      return null;
    }
  }
}
