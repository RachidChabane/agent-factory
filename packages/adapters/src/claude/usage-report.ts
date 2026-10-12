import { z } from 'zod';
import { USAGE_LIMIT_KINDS, utilizationFromPercent, type UsageLimitReading, type UsageReading } from '@agent-factory/domain';
import type { Clock, CommandRunner, UsageReportSource } from '@agent-factory/application';

/** The CLI's own usage command: answered locally, with no model call and no cost. */
export const USAGE_PROMPT = '/usage';
export const USAGE_REPORT_ARGUMENTS: readonly string[] = ['-p', USAGE_PROMPT, '--output-format', 'stream-json', '--verbose', '--setting-sources', '', '--strict-mcp-config'];
export const USAGE_REPORT_TIMEOUT_MS = 60_000;
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

/** Reads an account's subscription usage by asking the Claude Code CLI for its usage report. */
export class ClaudeUsageReport implements UsageReportSource {
  private readonly runner: CommandRunner;
  private readonly clock: Clock;
  private readonly settings: ClaudeUsageReportSettings;

  constructor(runner: CommandRunner, clock: Clock, settings: ClaudeUsageReportSettings) {
    this.runner = runner;
    this.clock = clock;
    this.settings = settings;
  }

  async read(account: string): Promise<UsageReading> {
    const directory = this.settings.accountDirectories[account];
    const environment = directory === undefined ? this.settings.environment : { ...this.settings.environment, [CLAUDE_CONFIG_DIRECTORY_VARIABLE]: directory };
    const result = await this.runner.run(
      [...this.settings.command, ...USAGE_REPORT_ARGUMENTS],
      this.settings.workingDirectory,
      this.settings.timeoutMs ?? USAGE_REPORT_TIMEOUT_MS,
      environment,
    );
    if (result.timedOut) throw new UsageReportError('the command timed out, probably waiting for a login');
    if (result.exitCode !== EXIT_CODE_SUCCESS) throw new UsageReportError(`the command exited with ${result.exitCode}: ${result.stderr.trim().split(NEWLINE)[0] ?? ''}`);
    return { account, source: 'usage-report', readAt: this.clock.now(), limits: parseUsageReport(result.stdout) };
  }
}
