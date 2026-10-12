import { z } from 'zod';
import { LOCAL_CHECK_MODES } from '@agent-factory/adapters';
import {
  COMMIT_KINDS,
  DEFAULT_CONCURRENCY_LIMIT,
  DEFAULT_MINIMUM_FREE_MEMORY_PERCENT,
  DEFAULT_SESSION_PAUSE_RATIO,
  DEFAULT_WEEKLY_PAUSE_RATIO,
  EFFORT_LEVELS,
  isProductionTarget,
  MAX_PERCENT,
  PAUSE_ABOVE_PRESSURE_LEVELS,
} from '@agent-factory/domain';

export const DEFAULT_ISSUE_CONCURRENCY = 1;
export const DEFAULT_PAUSE_ABOVE_PRESSURE = 'normal';
export const DEFAULT_WORKTREE_POOL_SIZE = 3;
export const DEFAULT_GATE_TIMEOUT_MINUTES = 30;
export const DEFAULT_NICENESS = 10;
export const DEFAULT_BASE_BRANCH = 'main';
export const GITHUB_MODES = ['remote', 'local'] as const;
export type GitHubMode = (typeof GITHUB_MODES)[number];
export const DEFAULT_GITHUB_MODE: GitHubMode = 'remote';
export const DEFAULT_LOCAL_GITHUB_DIRECTORY = 'github';
export const DEFAULT_LOCAL_CHECKS = 'none';
export const DEFAULT_CLAUDE_COMMAND: readonly string[] = ['claude'];
export const DEFAULT_ENVIRONMENT_PASSTHROUGH: readonly string[] = [
  'PATH',
  'HOME',
  'LANG',
  'TERM',
  'TMPDIR',
  'USER',
  'MISE_DATA_DIR',
  'MISE_CONFIG_DIR',
  'MISE_CACHE_DIR',
  'MISE_STATE_DIR',
];
export const DEFAULT_DIRECTORIES = {
  state: 'state',
  runs: 'runs',
  logs: 'logs',
  evidence: 'evidence',
  worktrees: 'worktrees',
  requests: 'requests',
  knowledge: 'knowledge',
  checkouts: 'checkouts',
} as const;

export const DEFAULT_POLL_INTERVAL_SECONDS = 30;
export const DEFAULT_MERGE_WATCH_INTERVAL_MINUTES = 10;
export const DEFAULT_ISSUE_REFRESH_SECONDS = 120;
export const DEFAULT_NOTIFICATION_DEDUPE_MINUTES = 30;
export const DEFAULT_SERVER_HOST = '127.0.0.1';
export const DEFAULT_SERVER_PORT = 7430;
const MAX_PORT = 65_535;
const MAX_UTILIZATION = 1;
const ENVIRONMENT_VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ACCOUNT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const CREDENTIAL_VARIABLE_PATTERN = /^(GH|GITHUB|AWS|AZURE|GOOGLE|GCLOUD|VAULT|DD|DATADOG|ANTHROPIC)_|TOKEN|SECRET|PASSWORD|API_KEY/i;
const MAX_NICENESS = 19;
const MIN_NICENESS = 0;

const NonEmptyString = z.string().trim().min(1);
const PathString = NonEmptyString;
const PositiveMinutes = z.number().positive();

const EscalationSchema = z.strictObject({
  model: NonEmptyString,
  effort: z.enum(EFFORT_LEVELS),
});

const RoleSchema = z.strictObject({
  model: NonEmptyString,
  effort: z.enum(EFFORT_LEVELS),
  maxBudgetUsd: z.number().positive(),
  maxTurns: z.number().int().positive(),
  timeoutMinutes: PositiveMinutes,
  escalation: EscalationSchema.optional(),
});

const ImplementerRoleSchema = RoleSchema.extend({ escalation: EscalationSchema });

const NamedCommandSchema = z.strictObject({
  name: NonEmptyString,
  run: NonEmptyString,
  network: NonEmptyString.optional(),
});

export const DEFAULT_SANDBOX_WRITABLE_DIRECTORIES: readonly string[] = ['~/.local/state/mise', '~/Library/Caches/mise', '~/.npm', '~/Library/Caches/node-gyp'];
export const DEFAULT_KEYCHAIN_SERVICES: readonly string[] = ['figma-pat', 'gh:github.com'];
export const DEFAULT_DEPLOYMENT_PATHS: readonly string[] = ['infrastructure/**', 'environments/**'];

const VariableName = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
  .refine((name) => !CREDENTIAL_VARIABLE_PATTERN.test(name), { message: 'credential variables never reach check commands' });

const INVALID_VARIABLE_NAME = 'is not a valid variable name';

const EnvironmentSetSchema = z.record(z.string(), z.string()).superRefine((set, context) => {
  for (const name of Object.keys(set)) {
    const result = VariableName.safeParse(name);
    if (!result.success) context.addIssue({ code: 'custom', path: [name], message: result.error.issues[0]?.message ?? INVALID_VARIABLE_NAME });
  }
});

const ClaudeAccountSchema = z.strictObject({
  name: z.string().regex(ACCOUNT_NAME),
  configDir: PathString,
});

const UtilizationSchema = z.number().positive().max(MAX_UTILIZATION);

const DeliveryEnvironmentSchema = z.strictObject({ name: NonEmptyString, url: z.url().optional() });
const PRODUCTION_LOOKING_NAME = 'names a production environment; only dev and prep are redeployed by the factory';

const DeliverySchema = z
  .strictObject({
    workflow: NonEmptyString,
    environments: z
      .strictObject({
        dev: DeliveryEnvironmentSchema.optional(),
        prep: DeliveryEnvironmentSchema.optional(),
        prod: DeliveryEnvironmentSchema.optional(),
      })
      .prefault({}),
  })
  .superRefine((delivery, context) => {
    for (const environment of ['dev', 'prep'] as const) {
      const target = delivery.environments[environment];
      if (target !== undefined && isProductionTarget(environment, target.name)) {
        context.addIssue({ code: 'custom', path: ['environments', environment, 'name'], message: PRODUCTION_LOOKING_NAME });
      }
    }
  });

export const FactoryConfigSchema = z
  .strictObject({
    target: z.strictObject({
      owner: NonEmptyString,
      name: NonEmptyString,
      clonePath: PathString,
      baseBranch: NonEmptyString.default(DEFAULT_BASE_BRANCH),
      setupCommands: z.array(NamedCommandSchema).default([]),
    }),
    worktreePool: z
      .strictObject({
        directory: PathString.default(DEFAULT_DIRECTORIES.worktrees),
        size: z.number().int().positive().default(DEFAULT_WORKTREE_POOL_SIZE),
      })
      .prefault({}),
    concurrency: z
      .strictObject({
        issues: z.number().int().positive().default(DEFAULT_ISSUE_CONCURRENCY),
        ceiling: z.number().int().positive().default(DEFAULT_CONCURRENCY_LIMIT),
      })
      .prefault({}),
    resources: z
      .strictObject({
        minimumFreeMemoryPercent: z.number().min(0).max(MAX_PERCENT).default(DEFAULT_MINIMUM_FREE_MEMORY_PERCENT),
        pauseAbovePressure: z.enum(PAUSE_ABOVE_PRESSURE_LEVELS).default(DEFAULT_PAUSE_ABOVE_PRESSURE),
      })
      .prefault({}),
    roles: z.strictObject({
      'acceptance-author': RoleSchema,
      implementer: ImplementerRoleSchema,
      reviewer: RoleSchema,
      challenger: RoleSchema.optional(),
      auditor: RoleSchema.optional(),
      'release-auditor': RoleSchema.optional(),
      summarizer: RoleSchema.optional(),
    }),
    gate: z.strictObject({
      commandsBeforeAcceptance: z.array(NamedCommandSchema).default([]),
      commandsAfterAcceptance: z.array(NamedCommandSchema).default([]),
      timeoutMinutes: PositiveMinutes.default(DEFAULT_GATE_TIMEOUT_MINUTES),
      niceness: z.number().int().min(MIN_NICENESS).max(MAX_NICENESS).nullable().default(DEFAULT_NICENESS),
      environment: z
        .strictObject({
          passthrough: z.array(VariableName).default([...DEFAULT_ENVIRONMENT_PASSTHROUGH]),
          set: EnvironmentSetSchema.default({}),
        })
        .prefault({}),
    }),
    conventionalCommits: z.strictObject({
      defaultScope: NonEmptyString,
      scopes: z.record(z.string(), NonEmptyString).default({}),
      types: z.record(z.string(), z.enum(COMMIT_KINDS)).default({}),
      deploymentPaths: z.array(NonEmptyString).default([...DEFAULT_DEPLOYMENT_PATHS]),
    }),
    sandbox: z
      .strictObject({
        deniedReadPaths: z.array(PathString).default([]),
        writableDirectories: z.array(PathString).default([...DEFAULT_SANDBOX_WRITABLE_DIRECTORIES]),
      })
      .prefault({}),
    secretScan: z
      .strictObject({
        keychainServices: z.array(NonEmptyString).default([...DEFAULT_KEYCHAIN_SERVICES]),
      })
      .prefault({}),
    directories: z
      .strictObject({
        state: PathString.default(DEFAULT_DIRECTORIES.state),
        runs: PathString.default(DEFAULT_DIRECTORIES.runs),
        logs: PathString.default(DEFAULT_DIRECTORIES.logs),
        evidence: PathString.default(DEFAULT_DIRECTORIES.evidence),
        requests: PathString.default(DEFAULT_DIRECTORIES.requests),
        knowledge: PathString.default(DEFAULT_DIRECTORIES.knowledge),
        checkouts: PathString.default(DEFAULT_DIRECTORIES.checkouts),
      })
      .prefault({}),
    github: z.strictObject({
      mode: z.enum(GITHUB_MODES).default(DEFAULT_GITHUB_MODE),
      localDirectory: PathString.default(DEFAULT_LOCAL_GITHUB_DIRECTORY),
      localChecks: z.enum(LOCAL_CHECK_MODES).default(DEFAULT_LOCAL_CHECKS),
      commitIdentity: z.strictObject({ name: NonEmptyString, email: z.email() }),
    }),
    claude: z
      .strictObject({
        command: z.array(NonEmptyString).min(1).default([...DEFAULT_CLAUDE_COMMAND]),
        niceness: z.number().int().min(MIN_NICENESS).max(MAX_NICENESS).nullable().default(DEFAULT_NICENESS),
        writableDirectories: z.array(PathString).default([]),
        accounts: z
          .array(ClaudeAccountSchema)
          .default([])
          .refine((accounts) => new Set(accounts.map((account) => account.name)).size === accounts.length, {
            message: 'account names must be unique',
          }),
      })
      .prefault({}),
    budget: z
      .strictObject({
        fiveHourPauseUtilization: UtilizationSchema.default(DEFAULT_SESSION_PAUSE_RATIO),
        sevenDayPauseUtilization: UtilizationSchema.default(DEFAULT_WEEKLY_PAUSE_RATIO),
        dailyCapUsd: z.number().positive().nullable().default(null),
        perRunCapUsd: z.number().positive().nullable().default(null),
      })
      .prefault({}),
    daemon: z
      .strictObject({
        pollIntervalSeconds: z.number().positive().default(DEFAULT_POLL_INTERVAL_SECONDS),
        mergeWatchIntervalMinutes: PositiveMinutes.default(DEFAULT_MERGE_WATCH_INTERVAL_MINUTES),
        issueRefreshSeconds: z.number().positive().default(DEFAULT_ISSUE_REFRESH_SECONDS),
      })
      .prefault({}),
    notifications: z
      .strictObject({
        googleChatWebhookUrl: z.strictObject({ fromEnvironment: z.string().regex(ENVIRONMENT_VARIABLE_NAME) }).nullable().default(null),
        dedupeWindowMinutes: PositiveMinutes.default(DEFAULT_NOTIFICATION_DEDUPE_MINUTES),
      })
      .prefault({}),
    server: z
      .strictObject({
        host: NonEmptyString.default(DEFAULT_SERVER_HOST),
        port: z.number().int().min(0).max(MAX_PORT).default(DEFAULT_SERVER_PORT),
        publicUrl: z.url().nullable().default(null),
        tailnet: z.boolean().default(false),
      })
      .prefault({}),
    release: z
      .strictObject({
        prepHealthChecks: z.array(z.strictObject({ name: NonEmptyString, url: z.url() })).default([]),
        productionWorkflowUrl: z.string().default(''),
      })
      .prefault({}),
    delivery: DeliverySchema.nullable().default(null),
  })
  .superRefine((config, context) => {
    if (config.concurrency.issues > config.concurrency.ceiling) {
      context.addIssue({ code: 'custom', path: ['concurrency', 'issues'], message: 'must not exceed concurrency.ceiling' });
    }
    if (config.concurrency.ceiling > config.worktreePool.size) {
      context.addIssue({ code: 'custom', path: ['concurrency', 'ceiling'], message: 'must not exceed worktreePool.size' });
    }
  });

export type RawFactoryConfig = z.infer<typeof FactoryConfigSchema>;
