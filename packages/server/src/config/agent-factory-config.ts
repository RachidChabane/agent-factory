import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { BARE_REPOSITORY_SUFFIX, type LocalCheckMode } from '@agent-factory/adapters';
import { machineTimeZone, type FilmSettings, type NamedCommand, type ReferenceSource, type StackSettings } from '@agent-factory/application';
import {
  DEFAULT_ISSUE_TYPES,
  NO_DAILY_CAP,
  type AgentRole,
  type BillingMode,
  type DailyCap,
  type EffortLevel,
  type EscalationProfile,
  type IssueTypeDefinition,
  type PauseAbovePressureLevel,
  type PromotionPolicy,
  type ProofStrategy,
  type UsageThresholds,
} from '@agent-factory/domain';
import { NONE, type RawNamedCommand, type RawRole, type RawRoleOverride, type SecretReference } from './schema/common.ts';
import { DEFAULT_ROLES, type RawNotificationChannel, type RawRoles, type RawToolCheck } from './schema/installation.ts';
import type { RawEnvironment, RawIssueType, RawProject } from './schema/project.ts';
import { AgentFactoryConfigSchema, type RawAgentFactoryConfig } from './schema/root.ts';

export const FACTORY_HOME_VARIABLE = 'AGENT_FACTORY_HOME';
export const DEFAULT_FACTORY_HOME_NAME = '.agent-factory';
export const CONFIG_FILE_NAME = 'config.yaml';
export const PROJECTS_DIRECTORY = 'projects';
export const RUN_LOG_DIRECTORY = 'runs';
export const INSTALLATION_DIRECTORIES = { state: 'state', runs: 'runs', logs: 'logs', cache: 'cache' } as const;
export const PROJECT_DIRECTORIES = {
  worktrees: 'worktrees',
  checkouts: 'checkouts',
  logs: 'logs',
  evidence: 'evidence',
  requests: 'requests',
  knowledge: 'knowledge',
  references: 'references',
} as const;
const HOME_PREFIX = '~/';
const HOME_ONLY = '~';
const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_SECOND = 1_000;
const HTTP_SCHEME = 'http://';
const WILDCARD_HOSTS: ReadonlyMap<string, string> = new Map([
  ['0.0.0.0', '127.0.0.1'],
  ['::', '::1'],
]);
const REPOSITORY_SEPARATOR = '/';
const UTF8 = 'utf8';
const MISSING_FILE_CODE = 'ENOENT';

const CHECK_GUIDANCE_BY_PROOF: Readonly<Record<ProofStrategy, string>> = {
  'fails-on-base': "tests in the repository's existing test layout and framework that assert the new behaviour",
  'fails-on-base-when-expressible': 'a test that asserts on the changed configuration or artefact when the criterion can be expressed as one',
  'base-score': "evaluation cases in the repository's evaluation format, one per criterion, with the rubric the score is computed from",
  none: 'none: the existing tests and the gate steps are the proof',
};
const DEFAULT_TYPE_EVIDENCE = ['acceptance-tests', 'diff-stat'] as const;

export interface RoleSettings {
  readonly model: string;
  readonly effort: EffortLevel;
  readonly maxBudgetUsd: number;
  readonly maxTurns: number;
  readonly timeoutMs: number;
  readonly escalation: EscalationProfile | null;
}

export interface RoleSettingsMap {
  readonly 'acceptance-author': RoleSettings;
  readonly implementer: RoleSettings & { readonly escalation: EscalationProfile };
  readonly reviewer: RoleSettings;
  readonly challenger: RoleSettings;
  readonly auditor: RoleSettings;
}

export interface ClaudeAccountConfig {
  readonly name: string;
  readonly configDir: string;
  readonly billing: BillingMode;
}

export interface ToolCheckConfig {
  readonly name: string;
  readonly description: string | null;
  readonly check: readonly string[];
  readonly version: readonly string[] | null;
  readonly connectedPattern: string | null;
  readonly fix: string | null;
  readonly install: string | null;
  readonly timeoutMs: number;
  readonly login: { readonly command: string; readonly timeoutMs: number } | null;
  readonly keepAlive: { readonly command: string; readonly everyMs: number; readonly timeoutMs: number } | null;
}

export type HeaderValue = { readonly kind: 'literal'; readonly value: string } | { readonly kind: 'environment'; readonly variable: string };

export type NotificationChannelConfig =
  | { readonly kind: 'system' }
  | { readonly kind: 'google-chat'; readonly webhookVariable: string }
  | { readonly kind: 'slack'; readonly webhookVariable: string }
  | { readonly kind: 'webhook'; readonly urlVariable: string; readonly headers: Readonly<Record<string, HeaderValue>> };

export type RemoteAccessConfig = { readonly kind: 'none' } | { readonly kind: 'tailscale'; readonly allowedLogins: readonly string[] };

export type ForgeConfig =
  | { readonly kind: 'github'; readonly mergeWithBypass: boolean }
  | { readonly kind: 'local'; readonly directory: string; readonly bareRepositoryPath: string; readonly checks: LocalCheckMode };

export type ReleaseModelConfig = { readonly kind: 'release-please'; readonly tagPattern: string } | { readonly kind: 'tags'; readonly tagPattern: string } | { readonly kind: 'none' };

export type DeploymentSourceConfig = { readonly kind: 'github'; readonly environment: string } | { readonly kind: 'none' };

export interface EnvironmentConfig {
  readonly name: string;
  readonly production: boolean;
  readonly promotion: PromotionPolicy;
  readonly deployments: DeploymentSourceConfig;
  readonly health: readonly { readonly name: string; readonly url: string }[];
  readonly wakeUpMs: number;
  readonly redeploy: { readonly workflow: string; readonly inputs: Readonly<Record<string, string>> } | null;
  readonly workflowUrl: string | null;
}

export type KnowledgeSourceConfig = { readonly kind: 'path'; readonly path: string } | { readonly kind: 'repository'; readonly path: string };

export interface ProjectConfig {
  readonly id: string;
  readonly name: string;
  readonly directory: string;
  readonly forge: ForgeConfig;
  readonly repository: { readonly owner: string; readonly name: string };
  readonly baseBranch: string;
  readonly clonePath: string;
  readonly commitIdentity: { readonly name: string; readonly email: string };
  readonly conventions: {
    readonly branchPrefix: string;
    readonly labels: { readonly factory: string; readonly validated: string; readonly audit: string; readonly typePrefix: string; readonly kindPrefix: string };
    readonly defaultScope: string;
  };
  readonly worktreePool: { readonly directory: string; readonly size: number };
  readonly concurrency: { readonly issues: number; readonly ceiling: number };
  readonly setupCommands: readonly NamedCommand[];
  readonly gate: {
    readonly commandsBeforeAcceptance: readonly NamedCommand[];
    readonly commandsAfterAcceptance: readonly NamedCommand[];
    readonly timeoutMs: number;
    readonly niceness: number | null;
  };
  readonly environment: { readonly passthrough: readonly string[]; readonly set: Readonly<Record<string, string>> };
  readonly stack: StackSettings | null;
  readonly sandbox: {
    readonly deniedReadPaths: readonly string[];
    readonly writableDirectories: readonly string[] | null;
    readonly shellCommands: readonly string[];
    readonly allowedDomains: readonly string[];
    readonly docker: boolean;
  };
  readonly secretScan: { readonly keychainServices: readonly string[] };
  readonly issueTypes: readonly IssueTypeDefinition[];
  readonly roles: RoleSettingsMap;
  readonly prompts: Readonly<Partial<Record<AgentRole, string>>>;
  readonly knowledge: readonly KnowledgeSourceConfig[];
  /** The repositories specifications cite, each with the local clone its snapshot is taken from. */
  readonly references: readonly ReferenceSource[];
  readonly evidence: { readonly maxFileBytes: number; readonly maxTotalBytes: number; readonly films: FilmSettings | null };
  readonly delivery: { readonly release: ReleaseModelConfig; readonly environments: readonly EnvironmentConfig[]; readonly healthIntervalMs: number };
  readonly audits: { readonly ignore: readonly { readonly name: string; readonly branches: readonly string[]; readonly authors: readonly string[] }[] };
  readonly tools: readonly ToolCheckConfig[];
  readonly directories: {
    readonly checkouts: string;
    readonly logs: string;
    readonly evidence: string;
    readonly requests: string;
    readonly knowledge: string;
    /** Where the snapshots of the project's references are kept, one directory per name and ref. */
    readonly references: string;
  };
}

export interface AgentFactoryConfig {
  readonly home: string;
  readonly configPath: string;
  readonly server: { readonly host: string; readonly port: number; readonly publicUrl: string; readonly remoteAccess: RemoteAccessConfig };
  readonly claude: {
    readonly command: readonly string[];
    readonly niceness: number | null;
    readonly writableDirectories: readonly string[];
    readonly accounts: readonly ClaudeAccountConfig[];
    readonly usage: { readonly refreshMs: number; readonly staleAfterMs: number };
  };
  readonly budget: { readonly thresholds: UsageThresholds; readonly dailyCap: DailyCap; readonly perRunCapUsd: number | null };
  readonly resources: { readonly minimumFreeMemoryPercent: number; readonly pauseAbovePressure: PauseAbovePressureLevel; readonly maxConcurrentRuns: number };
  readonly daemon: { readonly pollIntervalMs: number; readonly mergeWatchIntervalMs: number; readonly issueRefreshMs: number };
  readonly notifications: { readonly dedupeWindowMs: number; readonly channels: readonly NotificationChannelConfig[] };
  readonly tools: readonly ToolCheckConfig[];
  /** The roles of a project that overrides none: the built-in defaults under the installation's own. */
  readonly defaultRoles: RoleSettingsMap;
  readonly directories: { readonly state: string; readonly runs: string; readonly logs: string; readonly runLogs: string; readonly cache: string };
  readonly projects: readonly ProjectConfig[];
}

export class ConfigMissingError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`No factory configuration at ${path}; run "agent-factory init" in a repository, or copy config/config.example.yaml there and fill it in`);
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

export class UnknownProjectError extends Error {
  constructor(id: string, known: readonly string[]) {
    super(`no project "${id}" in the configuration; known projects: ${known.join(', ')}`);
    this.name = 'UnknownProjectError';
  }
}

export function factoryHome(environment: Readonly<Record<string, string | undefined>>, userHome: string = homedir()): string {
  const configured = environment[FACTORY_HOME_VARIABLE];
  return configured === undefined || configured === '' ? join(userHome, DEFAULT_FACTORY_HOME_NAME) : resolve(configured);
}

export function resolvePath(path: string, base: string, userHome: string = homedir()): string {
  if (path === HOME_ONLY) return userHome;
  if (path.startsWith(HOME_PREFIX)) return join(userHome, path.slice(HOME_PREFIX.length));
  return isAbsolute(path) ? path : resolve(base, path);
}

function minutes(value: number): number {
  return Math.round(value * MILLISECONDS_PER_MINUTE);
}

function seconds(value: number): number {
  return Math.round(value * MILLISECONDS_PER_SECOND);
}

function namedCommand(command: RawNamedCommand): NamedCommand {
  return command.network === undefined ? { name: command.name, run: command.run } : { name: command.name, run: command.run, network: { reason: command.network } };
}

function stackSettings(raw: NonNullable<RawProject['stack']>): StackSettings {
  return {
    setup: raw.setup.map(namedCommand),
    services: raw.services.map((service) => ({
      name: service.name,
      run: service.run,
      ready: { run: service.ready, timeoutMs: seconds(service.readyTimeoutSeconds) },
      ...(service.network === undefined ? {} : { network: { reason: service.network } }),
    })),
    teardown: raw.teardown.map(namedCommand),
    environment: raw.environment,
    issueTypes: raw.issueTypes,
    stopGraceMs: seconds(raw.stopGraceSeconds),
  };
}

function filmSettings(raw: NonNullable<RawProject['evidence']['films']>, at: (path: string) => string): FilmSettings {
  return {
    command: raw.command,
    workingDirectory: at(raw.workingDirectory),
    environment: raw.environment,
    timeoutMs: minutes(raw.timeoutMinutes),
    replayFile: raw.replayFile,
    timeZone: raw.timeZone ?? machineTimeZone(),
  };
}

function roleSettings(raw: RawRole): RoleSettings {
  return {
    model: raw.model,
    effort: raw.effort,
    maxBudgetUsd: raw.maxBudgetUsd,
    maxTurns: raw.maxTurns,
    timeoutMs: minutes(raw.timeoutMinutes),
    escalation: raw.escalation ?? null,
  };
}

function mergedRole(base: RawRole, override: RawRoleOverride | undefined): RawRole {
  if (override === undefined) return base;
  const merged = { ...base, ...Object.fromEntries(Object.entries(override).filter(([, value]) => value !== undefined)) };
  return merged;
}

function layeredRole(role: keyof typeof DEFAULT_ROLES, defaults: RawRoles, overrides: RawProject['roles']): RawRole {
  return mergedRole(mergedRole(DEFAULT_ROLES[role], defaults[role]), overrides[role]);
}

/** A role of a project: the built-in defaults, then the installation's defaults, then the project's overrides, field by field. */
function resolveRoles(defaults: RawRoles, overrides: RawProject['roles']): RoleSettingsMap {
  const implementer = layeredRole('implementer', defaults, overrides);
  return {
    'acceptance-author': roleSettings(layeredRole('acceptance-author', defaults, overrides)),
    implementer: { ...roleSettings(implementer), escalation: implementer.escalation ?? DEFAULT_ROLES.implementer.escalation },
    reviewer: roleSettings(layeredRole('reviewer', defaults, overrides)),
    challenger: roleSettings(layeredRole('challenger', defaults, overrides)),
    auditor: roleSettings(layeredRole('auditor', defaults, overrides)),
  };
}

function toolCheck(raw: RawToolCheck): ToolCheckConfig {
  return {
    name: raw.name,
    description: raw.description ?? null,
    check: raw.check,
    version: raw.version ?? null,
    connectedPattern: raw.connectedPattern ?? null,
    fix: raw.fix ?? null,
    install: raw.install ?? null,
    timeoutMs: seconds(raw.timeoutSeconds),
    login: raw.login === undefined ? null : { command: raw.login, timeoutMs: seconds(raw.loginTimeoutSeconds) },
    keepAlive: raw.keepAlive === undefined ? null : { command: raw.keepAlive.command, everyMs: minutes(raw.keepAlive.everyMinutes), timeoutMs: seconds(raw.keepAlive.timeoutSeconds) },
  };
}

function headerValue(value: string | SecretReference): HeaderValue {
  return typeof value === 'string' ? { kind: 'literal', value } : { kind: 'environment', variable: value.fromEnvironment };
}

function notificationChannel(raw: RawNotificationChannel): NotificationChannelConfig {
  switch (raw.kind) {
    case 'system':
      return { kind: 'system' };
    case 'google-chat':
      return { kind: 'google-chat', webhookVariable: raw.webhookUrl.fromEnvironment };
    case 'slack':
      return { kind: 'slack', webhookVariable: raw.webhookUrl.fromEnvironment };
    case 'webhook':
      return {
        kind: 'webhook',
        urlVariable: raw.url.fromEnvironment,
        headers: Object.fromEntries(Object.entries(raw.headers).map(([name, value]) => [name, headerValue(value)])),
      };
  }
}

function issueType(raw: RawIssueType, typePrefix: string): IssueTypeDefinition {
  return {
    id: raw.id,
    label: raw.label ?? `${typePrefix}${raw.id}`,
    proof: raw.proof,
    checks: raw.checks ?? CHECK_GUIDANCE_BY_PROOF[raw.proof],
    commit: { type: raw.commit.type, scope: raw.commit.scope ?? null, whenChanged: raw.commit.whenChanged },
    evidence: raw.evidence ?? [...DEFAULT_TYPE_EVIDENCE],
    review: raw.review,
    paths: raw.paths,
  };
}

function presetTypes(typePrefix: string): readonly IssueTypeDefinition[] {
  return DEFAULT_ISSUE_TYPES.map((definition) => ({ ...definition, label: `${typePrefix}${definition.id}` }));
}

function environmentConfig(raw: RawEnvironment): EnvironmentConfig {
  return {
    name: raw.name,
    production: raw.production,
    promotion: raw.promotion,
    deployments: raw.deployments,
    health: raw.health,
    wakeUpMs: seconds(raw.wakeUpSeconds),
    redeploy: raw.redeploy ?? null,
    workflowUrl: raw.workflowUrl ?? null,
  };
}

function repositoryOf(slug: string): { readonly owner: string; readonly name: string } {
  const [owner = '', name = ''] = slug.split(REPOSITORY_SEPARATOR);
  return { owner, name };
}

function capOf(value: number | typeof NONE): number | null {
  return value === NONE ? null : value;
}

function resolveProject(raw: RawProject, config: RawAgentFactoryConfig, home: string, userHome: string): ProjectConfig {
  const directory = join(home, PROJECTS_DIRECTORY, raw.id);
  const at = (path: string): string => resolvePath(path, directory, userHome);
  const repository = repositoryOf(raw.forge.repository);
  const forge: ForgeConfig =
    raw.forge.kind === 'github'
      ? { kind: 'github', mergeWithBypass: raw.forge.mergeWithBypass }
      : { kind: 'local', directory: at(raw.forge.directory), bareRepositoryPath: join(at(raw.forge.directory), `${repository.name}${BARE_REPOSITORY_SUFFIX}`), checks: raw.forge.checks };
  const environment = raw.environment ?? config.defaults.environment;
  const writable = raw.sandbox?.writableDirectories ?? config.defaults.sandbox.writableDirectories;
  return {
    id: raw.id,
    name: raw.name,
    directory,
    forge,
    repository,
    baseBranch: raw.baseBranch,
    clonePath: at(raw.clone),
    commitIdentity: raw.commitIdentity,
    conventions: raw.conventions,
    worktreePool: { directory: join(directory, PROJECT_DIRECTORIES.worktrees), size: raw.worktrees.size },
    concurrency: raw.concurrency,
    setupCommands: raw.setup.map(namedCommand),
    gate: {
      commandsBeforeAcceptance: raw.gate.beforeAcceptance.map(namedCommand),
      commandsAfterAcceptance: raw.gate.afterAcceptance.map(namedCommand),
      timeoutMs: minutes(raw.gate.timeoutMinutes),
      niceness: raw.gate.niceness,
    },
    environment: {
      passthrough: environment.passthrough,
      set: Object.fromEntries(Object.entries(environment.set).map(([name, value]) => [name, value.startsWith(HOME_PREFIX) ? resolvePath(value, home, userHome) : value])),
    },
    stack: raw.stack === undefined ? null : stackSettings(raw.stack),
    sandbox: {
      deniedReadPaths: [...config.defaults.sandbox.deniedReadPaths, ...(raw.sandbox?.deniedReadPaths ?? [])].map((path) => resolvePath(path, home, userHome)),
      writableDirectories: writable === undefined ? null : writable.map((path) => resolvePath(path, home, userHome)),
      shellCommands: [...new Set([...config.defaults.sandbox.shellCommands, ...(raw.sandbox?.shellCommands ?? [])])],
      allowedDomains: [...new Set([...config.defaults.sandbox.allowedDomains, ...(raw.sandbox?.allowedDomains ?? [])])],
      docker: raw.sandbox?.docker ?? config.defaults.sandbox.docker ?? false,
    },
    secretScan: raw.secretScan,
    issueTypes: raw.issueTypes === undefined ? presetTypes(raw.conventions.labels.typePrefix) : raw.issueTypes.map((type) => issueType(type, raw.conventions.labels.typePrefix)),
    roles: resolveRoles(config.defaults.roles, raw.roles),
    prompts: Object.fromEntries(Object.entries(raw.prompts).map(([role, path]) => [role, at(path)])),
    knowledge: raw.knowledge.map((source) => ('path' in source ? { kind: 'path', path: at(source.path) } : { kind: 'repository', path: source.repository })),
    references: raw.references.map((reference) => ({ name: reference.name, repository: reference.repository, ref: reference.ref, source: at(reference.source) })),
    evidence: { maxFileBytes: raw.evidence.maxFileBytes, maxTotalBytes: raw.evidence.maxTotalBytes, films: raw.evidence.films === undefined ? null : filmSettings(raw.evidence.films, at) },
    delivery: { release: raw.delivery.release, environments: raw.delivery.environments.map(environmentConfig), healthIntervalMs: minutes(raw.delivery.healthIntervalMinutes) },
    audits: raw.audits,
    tools: raw.tools.map(toolCheck),
    directories: {
      checkouts: join(directory, PROJECT_DIRECTORIES.checkouts),
      logs: join(directory, PROJECT_DIRECTORIES.logs),
      evidence: join(directory, PROJECT_DIRECTORIES.evidence),
      requests: join(directory, PROJECT_DIRECTORIES.requests),
      knowledge: join(directory, PROJECT_DIRECTORIES.knowledge),
      references: join(directory, PROJECT_DIRECTORIES.references),
    },
  };
}

export function resolveAgentFactoryConfig(raw: RawAgentFactoryConfig, home: string, configPath: string, userHome: string = homedir()): AgentFactoryConfig {
  const at = (path: string): string => resolvePath(path, home, userHome);
  const logs = at(INSTALLATION_DIRECTORIES.logs);
  const dailyCap = capOf(raw.budget.dailyCapUsd);
  return {
    home,
    configPath,
    server: {
      host: raw.server.host,
      port: raw.server.port,
      publicUrl: raw.server.publicUrl ?? serverUrl(raw.server.host, raw.server.port),
      remoteAccess: raw.server.remoteAccess,
    },
    claude: {
      command: raw.claude.command,
      niceness: raw.claude.niceness,
      writableDirectories: raw.claude.writableDirectories.map(at),
      accounts: raw.claude.accounts.map((account) => ({ name: account.name, configDir: at(account.configDir), billing: account.billing })),
      usage: { refreshMs: minutes(raw.claude.usage.refreshMinutes), staleAfterMs: minutes(raw.claude.usage.staleAfterMinutes) },
    },
    budget: {
      thresholds: { session: raw.budget.pauseAt.session, weekly_all: raw.budget.pauseAt.weeklyAll, weekly_scoped: raw.budget.pauseAt.weeklyScoped },
      dailyCap: dailyCap === null ? NO_DAILY_CAP : { kind: 'usd', amount: dailyCap },
      perRunCapUsd: capOf(raw.budget.perRunCapUsd),
    },
    resources: raw.resources,
    daemon: {
      pollIntervalMs: seconds(raw.daemon.pollIntervalSeconds),
      mergeWatchIntervalMs: minutes(raw.daemon.mergeWatchIntervalMinutes),
      issueRefreshMs: seconds(raw.daemon.issueRefreshSeconds),
    },
    notifications: { dedupeWindowMs: minutes(raw.notifications.dedupeWindowMinutes), channels: raw.notifications.channels.map(notificationChannel) },
    tools: raw.tools.map(toolCheck),
    defaultRoles: resolveRoles(raw.defaults.roles, {}),
    directories: {
      state: at(INSTALLATION_DIRECTORIES.state),
      runs: at(INSTALLATION_DIRECTORIES.runs),
      logs,
      runLogs: join(logs, RUN_LOG_DIRECTORY),
      cache: at(INSTALLATION_DIRECTORIES.cache),
    },
    projects: raw.projects.map((project) => resolveProject(project, raw, home, userHome)),
  };
}

function serverUrl(host: string, port: number): string {
  return `${HTTP_SCHEME}${host}:${port}`;
}

/** Why a client cannot find a server configured on port 0, which picks a free port at each start. */
export class UnknownServerPortError extends Error {
  constructor() {
    super('server.port is 0: the factory picks a free port at each start, so no client can know it; give the port with --port, or set server.port');
    this.name = 'UnknownServerPortError';
  }
}

/** The address a client on this machine reaches the server at: a server listening on every address is reached through the loopback. */
export function serverClientUrl(server: { readonly host: string; readonly port: number }): string {
  if (server.port === 0) throw new UnknownServerPortError();
  const host = WILDCARD_HOSTS.get(server.host) ?? server.host;
  return serverUrl(host.includes(':') ? `[${host}]` : host, server.port);
}

/** The configuration served on another port; a public URL derived from the port follows it, an explicit one stays. */
export function withServerPort(config: AgentFactoryConfig, port: number): AgentFactoryConfig {
  const { server } = config;
  const derived = server.publicUrl === serverUrl(server.host, server.port);
  return { ...config, server: { ...server, port, publicUrl: derived ? serverUrl(server.host, port) : server.publicUrl } };
}

export function projectOf(config: AgentFactoryConfig, id: string): ProjectConfig {
  const project = config.projects.find((candidate) => candidate.id === id);
  if (project === undefined) throw new UnknownProjectError(id, config.projects.map((candidate) => candidate.id));
  return project;
}

export function configProblems(document: unknown): readonly string[] {
  const parsed = AgentFactoryConfigSchema.safeParse(document);
  return parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.length === 0 ? '(root)' : issue.path.join('.')}: ${issue.message}`);
}

export function parseAgentFactoryConfig(text: string, home: string, configPath: string, userHome: string = homedir()): AgentFactoryConfig {
  let document: unknown;
  try {
    document = parse(text);
  } catch (error) {
    throw new ConfigInvalidError(configPath, error instanceof Error ? error.message : String(error));
  }
  const parsed = AgentFactoryConfigSchema.safeParse(document);
  if (!parsed.success) throw new ConfigInvalidError(configPath, z.prettifyError(parsed.error));
  return resolveAgentFactoryConfig(parsed.data, home, configPath, userHome);
}

export function configPathOf(home: string): string {
  return join(home, CONFIG_FILE_NAME);
}

export async function loadAgentFactoryConfig(environment: Readonly<Record<string, string | undefined>>, userHome: string = homedir()): Promise<AgentFactoryConfig> {
  const home = factoryHome(environment, userHome);
  const configPath = configPathOf(home);
  let text: string;
  try {
    text = await readFile(configPath, UTF8);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === MISSING_FILE_CODE) throw new ConfigMissingError(configPath);
    throw error;
  }
  return parseAgentFactoryConfig(text, home, configPath, userHome);
}
