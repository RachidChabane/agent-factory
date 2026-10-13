import { z } from 'zod';
import { DEFAULT_MEDIA_UPLOAD_TIMEOUT_SECONDS, uploadCommandProblems } from '@agent-factory/application';
import {
  BILLING_MODES,
  DEFAULT_BILLING_MODE,
  DEFAULT_MINIMUM_FREE_MEMORY_PERCENT,
  DEFAULT_SESSION_PAUSE_RATIO,
  DEFAULT_WEEKLY_PAUSE_RATIO,
  MAX_PERCENT,
  PAUSE_ABOVE_PRESSURE_LEVELS,
} from '@agent-factory/domain';
import {
  ACCOUNT_NAME,
  CheckVariableName,
  DEFAULT_NICENESS,
  EnvironmentSetSchema,
  MAX_PORT,
  Niceness,
  NonEmptyString,
  NONE,
  NoneOrPositive,
  PathString,
  PositiveMinutes,
  PositiveSeconds,
  Ratio,
  RoleOverrideSchema,
  SecretReferenceSchema,
  uniqueBy,
} from './common.ts';

export const DEFAULT_SERVER_HOST = '127.0.0.1';
export const DEFAULT_SERVER_PORT = 7430;
export const DEFAULT_CLAUDE_COMMAND: readonly string[] = ['claude'];
export const DEFAULT_USAGE_REFRESH_MINUTES = 10;
export const DEFAULT_USAGE_STALE_AFTER_MINUTES = 30;
export const DEFAULT_MAX_CONCURRENT_RUNS = 1;
export const DEFAULT_PAUSE_ABOVE_PRESSURE = 'normal';
export const DEFAULT_POLL_INTERVAL_SECONDS = 30;
export const DEFAULT_MERGE_WATCH_INTERVAL_MINUTES = 10;
export const DEFAULT_ISSUE_REFRESH_SECONDS = 120;
/** A forge may take this long after a push to register its checks; a list that stays empty past it means the project has none. */
export const DEFAULT_CHECKS_SETTLE_SECONDS = 120;
export const DEFAULT_NOTIFICATION_DEDUPE_MINUTES = 30;
export const DEFAULT_TOOL_TIMEOUT_SECONDS = 20;
/** A browser login waits for the operator's single sign-on. */
export const DEFAULT_TOOL_LOGIN_TIMEOUT_SECONDS = 300;
export const DEFAULT_KEEP_ALIVE_TIMEOUT_SECONDS = 120;
export const DEFAULT_ENVIRONMENT_PASSTHROUGH: readonly string[] = ['PATH', 'HOME', 'LANG', 'TERM', 'TMPDIR', 'USER'];

export const REMOTE_ACCESS_KINDS = ['none', 'tailscale'] as const;
export const NOTIFICATION_CHANNEL_KINDS = ['system', 'google-chat', 'slack', 'webhook'] as const;
export type NotificationChannelKind = (typeof NOTIFICATION_CHANNEL_KINDS)[number];

const RemoteAccessSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({
    kind: z.literal('tailscale'),
    /** Tailscale logins allowed to use the cockpit; empty accepts every identity of the tailnet. */
    allowedLogins: z.array(NonEmptyString).default([]),
  }),
]);

const ServerSchema = z
  .strictObject({
    host: NonEmptyString.default(DEFAULT_SERVER_HOST),
    port: z.number().int().min(0).max(MAX_PORT).default(DEFAULT_SERVER_PORT),
    publicUrl: z.url().nullable().default(null),
    remoteAccess: RemoteAccessSchema.prefault({ kind: 'none' }),
  })
  .prefault({});

const ClaudeAccountSchema = z.strictObject({
  name: z.string().regex(ACCOUNT_NAME, 'must start with a letter or digit and use letters, digits, dots, dashes or underscores'),
  configDir: PathString,
  billing: z.enum(BILLING_MODES).default(DEFAULT_BILLING_MODE),
});

const ClaudeSchema = z
  .strictObject({
    command: z.array(NonEmptyString).min(1).default([...DEFAULT_CLAUDE_COMMAND]),
    niceness: Niceness.nullable().default(DEFAULT_NICENESS),
    writableDirectories: z.array(PathString).default([]),
    accounts: z
      .array(ClaudeAccountSchema)
      .default([])
      .superRefine((accounts, context) => {
        for (const name of uniqueBy(accounts, (account) => account.name)) context.addIssue({ code: 'custom', message: `account ${name} is declared twice` });
      }),
    usage: z
      .strictObject({
        refreshMinutes: PositiveMinutes.default(DEFAULT_USAGE_REFRESH_MINUTES),
        staleAfterMinutes: PositiveMinutes.default(DEFAULT_USAGE_STALE_AFTER_MINUTES),
      })
      .prefault({}),
  })
  .prefault({});

const BudgetSchema = z
  .strictObject({
    pauseAt: z
      .strictObject({
        session: Ratio.default(DEFAULT_SESSION_PAUSE_RATIO),
        weeklyAll: Ratio.default(DEFAULT_WEEKLY_PAUSE_RATIO),
        weeklyScoped: Ratio.default(DEFAULT_WEEKLY_PAUSE_RATIO),
      })
      .prefault({}),
    dailyCapUsd: NoneOrPositive.default(NONE),
    perRunCapUsd: NoneOrPositive.default(NONE),
  })
  .prefault({});

const ResourcesSchema = z
  .strictObject({
    minimumFreeMemoryPercent: z.number().min(0).max(MAX_PERCENT).default(DEFAULT_MINIMUM_FREE_MEMORY_PERCENT),
    pauseAbovePressure: z.enum(PAUSE_ABOVE_PRESSURE_LEVELS).default(DEFAULT_PAUSE_ABOVE_PRESSURE),
    maxConcurrentRuns: z.number().int().positive().default(DEFAULT_MAX_CONCURRENT_RUNS),
  })
  .prefault({});

const DaemonSchema = z
  .strictObject({
    pollIntervalSeconds: PositiveSeconds.default(DEFAULT_POLL_INTERVAL_SECONDS),
    mergeWatchIntervalMinutes: PositiveMinutes.default(DEFAULT_MERGE_WATCH_INTERVAL_MINUTES),
    issueRefreshSeconds: PositiveSeconds.default(DEFAULT_ISSUE_REFRESH_SECONDS),
    checksSettleSeconds: z.number().min(0).default(DEFAULT_CHECKS_SETTLE_SECONDS),
  })
  .prefault({});

const HeaderValueSchema = z.union([NonEmptyString, SecretReferenceSchema]);

export const NotificationChannelSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('system') }),
  z.strictObject({ kind: z.literal('google-chat'), webhookUrl: SecretReferenceSchema }),
  z.strictObject({ kind: z.literal('slack'), webhookUrl: SecretReferenceSchema }),
  z.strictObject({ kind: z.literal('webhook'), url: SecretReferenceSchema, headers: z.record(z.string(), HeaderValueSchema).default({}) }),
]);
export type RawNotificationChannel = z.infer<typeof NotificationChannelSchema>;

/**
 * How the media of a pull request reach the operator's notices: a command that takes a file and prints a link. It runs
 * outside the sandbox with the operator's environment, like the film command.
 */
const MediaSchema = z.strictObject({
  /** The argument template of the upload command; it holds `{file}`. The last non-empty line it prints is the link. */
  upload: z
    .array(NonEmptyString)
    .min(1)
    .superRefine((command, context) => {
      if (command.length === 0) return;
      for (const problem of uploadCommandProblems(command)) context.addIssue({ code: 'custom', message: problem });
    }),
  timeoutSeconds: PositiveSeconds.default(DEFAULT_MEDIA_UPLOAD_TIMEOUT_SECONDS),
});

const NotificationsSchema = z
  .strictObject({
    dedupeWindowMinutes: PositiveMinutes.default(DEFAULT_NOTIFICATION_DEDUPE_MINUTES),
    channels: z.array(NotificationChannelSchema).default([]),
    media: MediaSchema.optional(),
  })
  .prefault({});

export const ToolCheckSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, 'must be lowercase letters, digits and dashes'),
  description: NonEmptyString.optional(),
  /** The read-only command that succeeds when the tool is installed and logged in. */
  check: z.array(NonEmptyString).min(1),
  version: z.array(NonEmptyString).min(1).optional(),
  /** A regular expression the check's output must match to count as connected. */
  connectedPattern: NonEmptyString.optional(),
  fix: NonEmptyString.optional(),
  install: NonEmptyString.optional(),
  timeoutSeconds: PositiveSeconds.default(DEFAULT_TOOL_TIMEOUT_SECONDS),
  /** A login that needs no terminal, such as a single sign-on in the browser, which the cockpit and `tool-login` start. */
  login: NonEmptyString.optional(),
  loginTimeoutSeconds: PositiveSeconds.default(DEFAULT_TOOL_LOGIN_TIMEOUT_SECONDS),
  /** A command the factory runs on a schedule, while it runs, to keep the tool's session alive. */
  keepAlive: z
    .strictObject({
      command: NonEmptyString,
      everyMinutes: PositiveMinutes,
      timeoutSeconds: PositiveSeconds.default(DEFAULT_KEEP_ALIVE_TIMEOUT_SECONDS),
    })
    .optional(),
});
export type RawToolCheck = z.infer<typeof ToolCheckSchema>;

export const ToolChecksSchema = z
  .array(ToolCheckSchema)
  .default([])
  .superRefine((tools, context) => {
    for (const name of uniqueBy(tools, (tool) => tool.name)) context.addIssue({ code: 'custom', message: `tool ${name} is declared twice` });
  });

/** A host name, or `*.` and a domain for every host under it. */
export const DOMAIN_PATTERN = /^(\*\.)?[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
/** A shell command an agent may start, as a permission pattern such as `go test *`. */
export const SHELL_COMMAND_PATTERN = /^[^()\n]+$/;

export const SandboxSettingsSchema = z.strictObject({
  deniedReadPaths: z.array(PathString).default([]),
  /** Directories confined commands may write besides their worktree; absent means the platform's package caches. */
  writableDirectories: z.array(PathString).optional(),
  /** Shell commands the writing agents may run besides the built-in ones and the project's setup and gate commands. */
  shellCommands: z.array(NonEmptyString.regex(SHELL_COMMAND_PATTERN, 'must be one command pattern, without parentheses or line breaks')).default([]),
  /** Hosts the agents' shell commands may reach, such as a package registry to look versions up. */
  allowedDomains: z.array(z.string().regex(DOMAIN_PATTERN, 'must be a host name, or *. and a domain')).default([]),
  /** Lets agents and gate commands drive the machine's container engine; what runs through the engine is not confined. */
  docker: z.boolean().optional(),
});

export const CheckEnvironmentSchema = z.strictObject({
  passthrough: z.array(CheckVariableName).default([...DEFAULT_ENVIRONMENT_PASSTHROUGH]),
  set: EnvironmentSetSchema.default({}),
});

const OPUS = 'opus';

/** Role defaults: every role on the strongest model, only the effort varies; the implementer starts low and escalates high. */
export const DEFAULT_ROLES = {
  'acceptance-author': { model: OPUS, effort: 'medium', maxBudgetUsd: 8, maxTurns: 120, timeoutMinutes: 30 },
  implementer: { model: OPUS, effort: 'low', maxBudgetUsd: 10, maxTurns: 150, timeoutMinutes: 60, escalation: { model: OPUS, effort: 'high' } },
  reviewer: { model: OPUS, effort: 'medium', maxBudgetUsd: 3, maxTurns: 60, timeoutMinutes: 20 },
  challenger: { model: OPUS, effort: 'high', maxBudgetUsd: 8, maxTurns: 150, timeoutMinutes: 40 },
  auditor: { model: OPUS, effort: 'medium', maxBudgetUsd: 4, maxTurns: 80, timeoutMinutes: 25 },
} as const;

/** Each role of every project: any field left out keeps the built-in default above. */
export const RolesSchema = z
  .strictObject({
    'acceptance-author': RoleOverrideSchema.prefault({}),
    implementer: RoleOverrideSchema.prefault({}),
    reviewer: RoleOverrideSchema.prefault({}),
    challenger: RoleOverrideSchema.prefault({}),
    auditor: RoleOverrideSchema.prefault({}),
  })
  .prefault({});
export type RawRoles = z.infer<typeof RolesSchema>;

const DefaultsSchema = z
  .strictObject({
    roles: RolesSchema,
    sandbox: SandboxSettingsSchema.prefault({}),
    environment: CheckEnvironmentSchema.prefault({}),
  })
  .prefault({});

export const InstallationSections = {
  server: ServerSchema,
  claude: ClaudeSchema,
  budget: BudgetSchema,
  resources: ResourcesSchema,
  daemon: DaemonSchema,
  notifications: NotificationsSchema,
  tools: ToolChecksSchema,
  defaults: DefaultsSchema,
};
