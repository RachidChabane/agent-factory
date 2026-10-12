import { z } from 'zod';
import { USAGE_LIMIT_KINDS, utilizationFromPercent, type AccountIdentity, type UsageLimitReading, type UsageReading } from '@agent-factory/domain';
import type { Clock, CommandRunner, UsageReportSource } from '@agent-factory/application';

/** The CLI's own usage command: answered locally, with no model call and no cost. */
export const USAGE_PROMPT = '/usage';
export const USAGE_REPORT_ARGUMENTS: readonly string[] = ['-p', USAGE_PROMPT, '--output-format', 'stream-json', '--verbose', '--setting-sources', '', '--strict-mcp-config'];
export const USAGE_REPORT_TIMEOUT_MS = 60_000;
/** The CLI's subcommand that names the login, answered locally. */
export const AUTH_STATUS_ARGUMENTS: readonly string[] = ['auth', 'status'];
export const AUTH_STATUS_TIMEOUT_MS = 30_000;
export const REASON_LOGGED_OUT = 'the Claude login is not active; sign in with CLAUDE_CONFIG_DIR=<account directory> claude /login';
const CLAUDE_CONFIG_DIRECTORY_VARIABLE = 'CLAUDE_CONFIG_DIR';
const ASSISTANT_LINE = 'assistant';
const NEWLINE = '\n';
const EXIT_CODE_SUCCESS = 0;

export class UsageReportError extends Error {
  constructor(reason: string) {
    super(`the usage report could not be read: ${reason}`);
    this.name = 'UsageReportError';
  }
}

const LimitSchema = z.object({
  kind: z.string(),
  percent: z.number(),
  resets_at: z.string().nullable().optional(),
  scope: z
    .object({ model: z.object({ display_name: z.string() }).nullable().optional() })
    .nullable()
    .optional(),
});

const UsageReportLineSchema = z.object({
  type: z.literal(ASSISTANT_LINE),
  usage_report: z.object({ rate_limits: z.object({ limits: z.array(LimitSchema) }) }),
});

type ReportedLimit = z.infer<typeof LimitSchema>;

const AuthStatusSchema = z.object({
  loggedIn: z.boolean(),
  email: z.string().nullable().optional(),
  orgName: z.string().nullable().optional(),
  subscriptionType: z.string().nullable().optional(),
});

/** The login `claude auth status` reports, null when it cannot be read; throws when the CLI says no one is logged in. */
export function parseAuthStatus(stdout: string): AccountIdentity | null {
  let json: unknown;
  try {
    json = JSON.parse(stdout.trim());
  } catch {
    return null;
  }
  const parsed = AuthStatusSchema.safeParse(json);
  if (!parsed.success) return null;
  if (!parsed.data.loggedIn) throw new UsageReportError(REASON_LOGGED_OUT);
  return { email: parsed.data.email ?? null, organization: parsed.data.orgName ?? null, plan: parsed.data.subscriptionType ?? null };
}

function limitOf(reported: ReportedLimit): UsageLimitReading | null {
  const kind = USAGE_LIMIT_KINDS.find((candidate) => candidate === reported.kind);
  if (kind === undefined) return null;
  const resetsAt = reported.resets_at === null || reported.resets_at === undefined ? null : new Date(reported.resets_at);
  return {
    kind,
    scope: reported.scope?.model?.display_name ?? null,
    utilization: utilizationFromPercent(reported.percent),
    resetsAt: resetsAt === null || Number.isNaN(resetsAt.getTime()) ? null : resetsAt,
  };
}

/** Finds the usage report in the CLI's stream and classifies its limits by kind; unknown kinds are ignored. */
export function parseUsageReport(stdout: string): readonly UsageLimitReading[] {
  for (const line of stdout.split(NEWLINE)) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const parsed = UsageReportLineSchema.safeParse(json);
    if (parsed.success) return parsed.data.usage_report.rate_limits.limits.flatMap((limit) => limitOf(limit) ?? []);
  }
  throw new UsageReportError('the output carries no usage report; is this Claude Code version recent enough?');
}

export interface ClaudeUsageReportSettings {
  readonly command: readonly string[];
  /** The `CLAUDE_CONFIG_DIR` of each named account; an account without one uses the default login. */
  readonly accountDirectories: Readonly<Record<string, string>>;
  readonly environment: Readonly<Record<string, string>>;
  readonly workingDirectory: string;
  readonly timeoutMs?: number;
}

/** A command runner whose commands stop when the signal aborts. */
export type AbortableRunner = (signal: AbortSignal) => CommandRunner;

/** Reads an account's subscription usage by asking the Claude Code CLI for its usage report. */
export class ClaudeUsageReport implements UsageReportSource {
  private readonly runnerFor: AbortableRunner;
  private readonly clock: Clock;
  private readonly settings: ClaudeUsageReportSettings;

  constructor(runnerFor: AbortableRunner, clock: Clock, settings: ClaudeUsageReportSettings) {
    this.runnerFor = runnerFor;
    this.clock = clock;
    this.settings = settings;
  }

  async read(account: string, signal: AbortSignal): Promise<UsageReading> {
    const directory = this.settings.accountDirectories[account];
    const environment = directory === undefined ? this.settings.environment : { ...this.settings.environment, [CLAUDE_CONFIG_DIRECTORY_VARIABLE]: directory };
    const runner = this.runnerFor(signal);
    const identity = await this.identity(runner, environment);
    const result = await runner.run([...this.settings.command, ...USAGE_REPORT_ARGUMENTS], this.settings.workingDirectory, this.settings.timeoutMs ?? USAGE_REPORT_TIMEOUT_MS, environment);
    if (result.timedOut) throw new UsageReportError('the command timed out, probably waiting for a login');
    if (result.exitCode !== EXIT_CODE_SUCCESS) throw new UsageReportError(`the command exited with ${result.exitCode}: ${result.stderr.trim().split(NEWLINE)[0] ?? ''}`);
    return { account, source: 'usage-report', readAt: this.clock.now(), limits: parseUsageReport(result.stdout), identity };
  }

  /** Who the account is logged in as; a CLI that cannot say leaves it unknown rather than failing the reading. */
  private async identity(runner: CommandRunner, environment: Readonly<Record<string, string>>): Promise<AccountIdentity | null> {
    const status = await runner.run([...this.settings.command, ...AUTH_STATUS_ARGUMENTS], this.settings.workingDirectory, AUTH_STATUS_TIMEOUT_MS, environment).catch(() => null);
    if (status === null || status.timedOut || status.exitCode !== EXIT_CODE_SUCCESS) return null;
    return parseAuthStatus(status.stdout);
  }
}
