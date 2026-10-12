import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { BARE_REPOSITORY_SUFFIX, type LocalCheckMode } from '@agent-factory/adapters';
import type { NamedCommand } from '@agent-factory/application';
import type {
  AgentRole,
  CommitKind,
  DeploymentEnvironment,
  EffortLevel,
  EscalationProfile,
  IssueType,
  ResourceAdmissionPolicy,
  UsageThresholds,
} from '@agent-factory/domain';
import { FactoryConfigSchema, type GitHubMode, type RawFactoryConfig } from './config-schema.ts';

export const FACTORY_HOME_VARIABLE = 'AGENT_FACTORY_HOME';
export const DEFAULT_FACTORY_HOME_NAME = '.agent-factory';
export const CONFIG_FILE_NAME = 'config.yaml';
const HOME_PREFIX = '~/';
const HOME_ONLY = '~';
const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_SECOND = 1_000;
const HTTP_SCHEME = 'http://';
export const RUN_LOG_DIRECTORY = 'runs';
const UTF8 = 'utf8';
const MISSING_FILE_CODE = 'ENOENT';

type RawNamedCommand = RawFactoryConfig['target']['setupCommands'][number];

export interface RoleSettings {
  readonly model: string;
  readonly effort: EffortLevel;
  readonly maxBudgetUsd: number;
  readonly maxTurns: number;
  readonly timeoutMs: number;
  readonly escalation: EscalationProfile | null;
}

export interface FactoryConfig {
  readonly home: string;
  readonly configPath: string;
  readonly target: {
    readonly owner: string;
    readonly name: string;
    readonly clonePath: string;
    readonly baseBranch: string;
    readonly setupCommands: readonly NamedCommand[];
  };
  readonly worktreePool: { readonly directory: string; readonly size: number };
  readonly concurrency: { readonly issues: number; readonly ceiling: number };
  readonly resources: ResourceAdmissionPolicy;
  readonly roles: Readonly<Partial<Record<AgentRole, RoleSettings>>> & {
    readonly 'acceptance-author': RoleSettings;
    readonly implementer: RoleSettings & { readonly escalation: EscalationProfile };
    readonly reviewer: RoleSettings;
  };
  readonly gate: {
    readonly commandsBeforeAcceptance: readonly NamedCommand[];
    readonly commandsAfterAcceptance: readonly NamedCommand[];
    readonly timeoutMs: number;
    readonly niceness: number | null;
    readonly environmentPassthrough: readonly string[];
    readonly environmentSet: Readonly<Record<string, string>>;
  };
  readonly conventionalCommits: {
    readonly defaultScope: string;
    readonly scopes: Readonly<Partial<Record<IssueType, string>>>;
    readonly types: Readonly<Partial<Record<IssueType, CommitKind>>>;
    readonly deploymentPaths: readonly string[];
  };
  readonly sandbox: { readonly deniedReadPaths: readonly string[]; readonly writableDirectories: readonly string[] };
  readonly secretScan: { readonly keychainServices: readonly string[] };
  readonly github: {
    readonly mode: GitHubMode;
    readonly commitIdentity: { readonly name: string; readonly email: string };
    readonly local: { readonly directory: string; readonly bareRepositoryPath: string; readonly checks: LocalCheckMode };
  };
  readonly claude: {
    readonly command: readonly string[];
    readonly niceness: number | null;
    readonly writableDirectories: readonly string[];
    readonly accounts: readonly ClaudeAccount[];
  };
  readonly budget: { readonly thresholds: UsageThresholds; readonly dailyCapUsd: number | null; readonly perRunCapUsd: number | null };
  readonly daemon: { readonly pollIntervalMs: number; readonly mergeWatchIntervalMs: number; readonly issueRefreshMs: number };
  readonly notifications: { readonly googleChatWebhookVariable: string | null; readonly dedupeWindowMs: number };
  readonly server: { readonly host: string; readonly port: number; readonly publicUrl: string; readonly tailnet: boolean };
  readonly release: { readonly prepHealthChecks: readonly { readonly name: string; readonly url: string }[]; readonly productionWorkflowUrl: string };
  readonly delivery: DeliveryConfig | null;
  readonly directories: FactoryDirectories;
}

export interface DeliveryTarget {
  readonly name: string;
  readonly url: string | null;
}

export interface DeliveryConfig {
  readonly workflow: string;
  readonly environments: Readonly<Partial<Record<DeploymentEnvironment, DeliveryTarget>>>;
}

export interface FactoryDirectories {
  readonly state: string;
  readonly runs: string;
  readonly logs: string;
  readonly evidence: string;
  readonly requests: string;
  readonly knowledge: string;
  readonly checkouts: string;
  readonly runLogs: string;
}

export interface ClaudeAccount {
  readonly name: string;
  readonly configDir: string;
}

export class ConfigMissingError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`No factory configuration at ${path}; copy config/config.example.yaml there and fill it in`);
    this.name = 'ConfigMissingError';
    this.path = path;
  }
}

export class ConfigInvalidError extends Error {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`The factory configuration at ${path} is invalid:\n${detail}`);
    this.name = 'ConfigInvalidError';
    this.path = path;
  }
}

export function factoryHome(environment: Readonly<Record<string, string | undefined>>, userHome: string = homedir()): string {
  const configured = environment[FACTORY_HOME_VARIABLE];
  return configured === undefined || configured === '' ? join(userHome, DEFAULT_FACTORY_HOME_NAME) : resolve(configured);
}

export function resolvePath(path: string, home: string, userHome: string = homedir()): string {
  if (path === HOME_ONLY) return userHome;
  if (path.startsWith(HOME_PREFIX)) return join(userHome, path.slice(HOME_PREFIX.length));
  return isAbsolute(path) ? path : resolve(home, path);
}

function namedCommand(command: RawNamedCommand): NamedCommand {
  return command.network === undefined ? { name: command.name, run: command.run } : { name: command.name, run: command.run, network: { reason: command.network } };
}

function minutes(value: number): number {
  return Math.round(value * MILLISECONDS_PER_MINUTE);
}

function roleSettings(raw: RawFactoryConfig['roles']['reviewer']): RoleSettings {
  return {
    model: raw.model,
    effort: raw.effort,
    maxBudgetUsd: raw.maxBudgetUsd,
    maxTurns: raw.maxTurns,
    timeoutMs: minutes(raw.timeoutMinutes),
    escalation: raw.escalation ?? null,
  };
}

export function resolveConfig(raw: RawFactoryConfig, home: string, configPath: string, userHome: string = homedir()): FactoryConfig {
  const at = (path: string): string => resolvePath(path, home, userHome);
  const optionalRoles = Object.fromEntries(
    (['challenger', 'auditor', 'release-auditor', 'summarizer'] as const).flatMap((role) => {
      const settings = raw.roles[role];
      return settings === undefined ? [] : [[role, roleSettings(settings)]];
    }),
  );
  return {
    home,
    configPath,
    target: { ...raw.target, clonePath: at(raw.target.clonePath), setupCommands: raw.target.setupCommands.map(namedCommand) },
    worktreePool: { directory: at(raw.worktreePool.directory), size: raw.worktreePool.size },
    concurrency: raw.concurrency,
    resources: raw.resources,
    roles: {
      ...optionalRoles,
      'acceptance-author': roleSettings(raw.roles['acceptance-author']),
      implementer: { ...roleSettings(raw.roles.implementer), escalation: raw.roles.implementer.escalation },
      reviewer: roleSettings(raw.roles.reviewer),
    },
    gate: {
      commandsBeforeAcceptance: raw.gate.commandsBeforeAcceptance.map(namedCommand),
      commandsAfterAcceptance: raw.gate.commandsAfterAcceptance.map(namedCommand),
      timeoutMs: minutes(raw.gate.timeoutMinutes),
      niceness: raw.gate.niceness,
      environmentPassthrough: raw.gate.environment.passthrough,
      environmentSet: Object.fromEntries(
        Object.entries(raw.gate.environment.set).map(([name, value]) => [name, value.startsWith(HOME_PREFIX) ? at(value) : value]),
      ),
    },
    conventionalCommits: raw.conventionalCommits,
    sandbox: {
      deniedReadPaths: raw.sandbox.deniedReadPaths.map(at),
      writableDirectories: raw.sandbox.writableDirectories.map(at),
    },
    secretScan: raw.secretScan,
    directories: {
      state: at(raw.directories.state),
      runs: at(raw.directories.runs),
      logs: at(raw.directories.logs),
      evidence: at(raw.directories.evidence),
      requests: at(raw.directories.requests),
      knowledge: at(raw.directories.knowledge),
      checkouts: at(raw.directories.checkouts),
      runLogs: join(at(raw.directories.logs), RUN_LOG_DIRECTORY),
    },
    github: {
      mode: raw.github.mode,
      commitIdentity: raw.github.commitIdentity,
      local: {
        directory: at(raw.github.localDirectory),
        bareRepositoryPath: join(at(raw.github.localDirectory), `${raw.target.name}${BARE_REPOSITORY_SUFFIX}`),
        checks: raw.github.localChecks,
      },
    },
    claude: {
      command: raw.claude.command,
      niceness: raw.claude.niceness,
      writableDirectories: raw.claude.writableDirectories.map(at),
      accounts: raw.claude.accounts.map((account) => ({ name: account.name, configDir: at(account.configDir) })),
    },
    budget: {
      thresholds: {
        session: raw.budget.fiveHourPauseUtilization,
        weekly_all: raw.budget.sevenDayPauseUtilization,
        weekly_scoped: raw.budget.sevenDayPauseUtilization,
      },
      dailyCapUsd: raw.budget.dailyCapUsd,
      perRunCapUsd: raw.budget.perRunCapUsd,
    },
    daemon: {
      pollIntervalMs: Math.round(raw.daemon.pollIntervalSeconds * MILLISECONDS_PER_SECOND),
      mergeWatchIntervalMs: minutes(raw.daemon.mergeWatchIntervalMinutes),
      issueRefreshMs: Math.round(raw.daemon.issueRefreshSeconds * MILLISECONDS_PER_SECOND),
    },
    notifications: {
      googleChatWebhookVariable: raw.notifications.googleChatWebhookUrl?.fromEnvironment ?? null,
      dedupeWindowMs: minutes(raw.notifications.dedupeWindowMinutes),
    },
    server: {
      host: raw.server.host,
      port: raw.server.port,
      publicUrl: raw.server.publicUrl ?? `${HTTP_SCHEME}${raw.server.host}:${raw.server.port}`,
      tailnet: raw.server.tailnet,
    },
    release: raw.release,
    delivery: deliveryConfig(raw.delivery),
  };
}

function deliveryConfig(raw: RawFactoryConfig['delivery']): DeliveryConfig | null {
  if (raw === null) return null;
  const environments = Object.fromEntries(
    Object.entries(raw.environments).flatMap(([environment, target]) => (target === undefined ? [] : [[environment, { name: target.name, url: target.url ?? null }]])),
  );
  return { workflow: raw.workflow, environments };
}

export function parseFactoryConfig(text: string, home: string, configPath: string, userHome: string = homedir()): FactoryConfig {
  let document: unknown;
  try {
    document = parse(text);
  } catch (error) {
    throw new ConfigInvalidError(configPath, error instanceof Error ? error.message : String(error));
  }
  const parsed = FactoryConfigSchema.safeParse(document);
  if (!parsed.success) throw new ConfigInvalidError(configPath, z.prettifyError(parsed.error));
  return resolveConfig(parsed.data, home, configPath, userHome);
}

export async function loadFactoryConfig(environment: Readonly<Record<string, string | undefined>>): Promise<FactoryConfig> {
  const home = factoryHome(environment);
  const configPath = join(home, CONFIG_FILE_NAME);
  let text: string;
  try {
    text = await readFile(configPath, UTF8);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === MISSING_FILE_CODE) throw new ConfigMissingError(configPath);
    throw error;
  }
  return parseFactoryConfig(text, home, configPath);
}
