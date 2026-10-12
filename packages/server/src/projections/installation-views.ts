import type {
  InstallationSettingsView,
  NamedCommandView,
  PauseView,
  ProjectSettingsView,
  RoleSetting,
  ToolSessionView,
  ToolView,
  UsageAccountView,
  UsageView,
} from '@agent-factory/cockpit';
import {
  CONFIGURATION_RELOAD_FAILED_EVENT,
  CONFIGURATION_RELOADED_EVENT,
  ConfigurationReloadedPayloadSchema,
  ConfigurationReloadFailedPayloadSchema,
  DAEMON_STARTED_EVENT,
  DAEMON_SUBJECT,
  SCHEDULER_PAUSED_EVENT,
  SCHEDULER_RESUMED_EVENT,
  SchedulerPausedPayloadSchema,
  SchedulerResumedPayloadSchema,
  SETTINGS_SUBJECT,
  USAGE_READ_EVENT,
  USAGE_READ_FAILED_EVENT,
  USAGE_SUBJECT_PREFIX,
  UsageReadFailedPayloadSchema,
  UsageReadPayloadSchema,
  type AccountUsage,
  type CheckedTool,
  type FactoryEventRecord,
  type NamedCommand,
  type RecordedToolSession,
  type ToolSessionHistory,
} from '@agent-factory/application';
import { AGENT_ROLES, type PauseCause } from '@agent-factory/domain';
import type { AgentFactoryConfig, ProjectConfig, RoleSettings, RoleSettingsMap } from '../config/agent-factory-config.ts';
import type { ConfiguredTool } from '../composition/installation/tools.ts';
import { isChannelConfigured } from '../composition/installation/notifications.ts';
import { iso } from './event-index.ts';

const MILLISECONDS_PER_MINUTE = 60_000;
const DEFAULT_ACCOUNT = 'default';
const SUBSCRIPTION_BILLING = 'subscription';
const CONFIGURED_ROLES = ['acceptance-author', 'implementer', 'reviewer', 'challenger', 'auditor'] as const satisfies readonly (keyof RoleSettingsMap)[];

/** The pauses in force, from the scheduler events of one log, with when and why each began. */
export function pauseViews(records: readonly FactoryEventRecord[], scope: PauseView['scope']): PauseView[] {
  const active = new Map<PauseCause, PauseView>();
  for (const record of records) {
    if (record.subject !== DAEMON_SUBJECT) continue;
    if (record.type === SCHEDULER_PAUSED_EVENT) {
      const paused = SchedulerPausedPayloadSchema.parse(record.payload);
      active.set(paused.cause, { scope, cause: paused.cause, reason: paused.reason, since: iso(record.occurredAt), resumesAt: paused.resumesAt });
    } else if (record.type === SCHEDULER_RESUMED_EVENT) {
      active.delete(SchedulerResumedPayloadSchema.parse(record.payload).cause);
    }
  }
  return [...active.values()];
}

interface AccountReads {
  readonly lastReadAt: Date | null;
  readonly lastFailure: { readonly at: Date; readonly reason: string } | null;
  readonly identity: UsageAccountView['identity'];
}

function accountReads(records: readonly FactoryEventRecord[], account: string): AccountReads {
  let lastReadAt: Date | null = null;
  let lastFailure: AccountReads['lastFailure'] = null;
  let identity: AccountReads['identity'] = null;
  for (const record of records) {
    if (!record.subject.startsWith(USAGE_SUBJECT_PREFIX)) continue;
    if (record.type === USAGE_READ_EVENT) {
      const read = UsageReadPayloadSchema.safeParse(record.payload);
      if (read.success && read.data.account === account) {
        lastReadAt = new Date(read.data.readAt);
        lastFailure = null;
        identity = read.data.identity ?? identity;
      }
    } else if (record.type === USAGE_READ_FAILED_EVENT) {
      const failed = UsageReadFailedPayloadSchema.safeParse(record.payload);
      if (failed.success && failed.data.account === account) lastFailure = { at: new Date(failed.data.failedAt), reason: failed.data.reason };
    }
  }
  return { lastReadAt, lastFailure, identity };
}

export function usageView(config: AgentFactoryConfig, usage: readonly AccountUsage[], records: readonly FactoryEventRecord[]): UsageView {
  const billingOf = new Map(config.claude.accounts.map((account) => [account.name, account.billing]));
  const accounts: UsageAccountView[] = usage.map((account) => {
    const reads = accountReads(records, account.account);
    const newest = [...account.limits].sort((left, right) => right.readAt.getTime() - left.readAt.getTime())[0];
    return {
      name: account.account,
      billing: billingOf.get(account.account) ?? SUBSCRIPTION_BILLING,
      identity: reads.identity,
      limits: account.limits.map((limit) => ({
        kind: limit.kind,
        scope: limit.scope,
        utilization: limit.utilization,
        resetsAt: limit.resetsAt === null ? null : iso(limit.resetsAt),
        freshness: limit.freshness,
        pauseAt: config.budget.thresholds[limit.kind],
      })),
      source: newest?.source ?? null,
      readAt: newest === undefined ? (reads.lastReadAt === null ? null : iso(reads.lastReadAt)) : iso(newest.readAt),
      lastFailure: reads.lastFailure === null ? null : { at: iso(reads.lastFailure.at), reason: reads.lastFailure.reason },
    };
  });
  return {
    accounts: accounts.length === 0 ? [{ name: DEFAULT_ACCOUNT, billing: SUBSCRIPTION_BILLING, identity: null, limits: [], source: null, readAt: null, lastFailure: null }] : accounts,
    refreshMinutes: Math.round(config.claude.usage.refreshMs / MILLISECONDS_PER_MINUTE),
    staleAfterMinutes: Math.round(config.claude.usage.staleAfterMs / MILLISECONDS_PER_MINUTE),
  };
}

/** Every configured tool, with its latest check when it has one. */
function sessionView(session: RecordedToolSession | null): ToolSessionView | null {
  return session === null ? null : { at: iso(session.at), outcome: session.outcome, detail: session.detail, operator: session.operator };
}

export function toolViews(
  configured: readonly ConfiguredTool[],
  checks: ReadonlyMap<string, CheckedTool>,
  sessions: ReadonlyMap<string, ToolSessionHistory>,
  scope: ToolView['scope'],
): ToolView[] {
  return configured.map((tool) => {
    const check = checks.get(tool.name) ?? null;
    const history = sessions.get(tool.name) ?? null;
    return {
      name: tool.name,
      scope,
      builtIn: tool.builtIn,
      description: tool.description,
      status: check?.status ?? null,
      version: check?.version ?? null,
      detail: check?.detail ?? null,
      fixCommand: check?.fixCommand ?? null,
      installHint: tool.installHint,
      checkedAt: check === null ? null : iso(check.checkedAt),
      loginCommand: tool.loginCommand,
      lastLogin: sessionView(history?.lastLogin ?? null),
      keepAlive:
        tool.keepAlive === null
          ? null
          : { command: tool.keepAlive.command, everyMinutes: tool.keepAlive.everyMs / MILLISECONDS_PER_MINUTE, last: sessionView(history?.lastKeepAlive ?? null) },
    };
  });
}

function roleSetting(role: (typeof AGENT_ROLES)[number], settings: RoleSettings): RoleSetting {
  return {
    role,
    model: settings.model,
    effort: settings.effort,
    maxBudgetUsd: settings.maxBudgetUsd,
    maxTurns: settings.maxTurns,
    timeoutMinutes: Math.round(settings.timeoutMs / MILLISECONDS_PER_MINUTE),
  };
}

function roleSettings(roles: RoleSettingsMap): RoleSetting[] {
  return CONFIGURED_ROLES.map((role) => roleSetting(role, roles[role]));
}

/** The models the configuration names, which the cockpit offers when a role changes. */
function models(config: AgentFactoryConfig): string[] {
  const named = config.projects.flatMap((project) =>
    CONFIGURED_ROLES.flatMap((role) => [project.roles[role].model, ...(project.roles[role].escalation === null ? [] : [project.roles[role].escalation?.model ?? ''])]),
  );
  return [...new Set(named.filter((model) => model !== ''))].sort();
}

/** What the reloads since the factory started left pending: settings waiting for a restart, and a refused file newer than the last reload. */
function configurationState(config: AgentFactoryConfig, records: readonly FactoryEventRecord[]): InstallationSettingsView['configuration'] {
  const startedAt = records.findLastIndex((record) => record.subject === DAEMON_SUBJECT && record.type === DAEMON_STARTED_EVENT);
  let restartRequired: readonly string[] = [];
  let reloadFailure: InstallationSettingsView['configuration']['reloadFailure'] = null;
  for (const record of records.slice(startedAt + 1)) {
    if (record.subject !== SETTINGS_SUBJECT) continue;
    if (record.type === CONFIGURATION_RELOADED_EVENT) {
      restartRequired = ConfigurationReloadedPayloadSchema.parse(record.payload).restartRequired;
      reloadFailure = null;
    } else if (record.type === CONFIGURATION_RELOAD_FAILED_EVENT) {
      reloadFailure = { at: iso(record.occurredAt), reason: ConfigurationReloadFailedPayloadSchema.parse(record.payload).reason };
    }
  }
  return { path: config.configPath, restartRequired: [...restartRequired], reloadFailure };
}

export function installationSettingsView(config: AgentFactoryConfig, environment: Readonly<Record<string, string | undefined>>, records: readonly FactoryEventRecord[]): InstallationSettingsView {
  return {
    models: models(config),
    defaultRoles: roleSettings(config.defaultRoles),
    resources: {
      minimumFreeMemoryPercent: config.resources.minimumFreeMemoryPercent,
      pauseAbovePressure: config.resources.pauseAbovePressure,
      maxConcurrentRuns: config.resources.maxConcurrentRuns,
    },
    notifications: config.notifications.channels.map((channel) => ({ kind: channel.kind, configured: isChannelConfigured(channel, environment) })),
    remoteAccess: config.server.remoteAccess.kind,
    configuration: configurationState(config, records),
  };
}

function commandView(command: NamedCommand): NamedCommandView {
  return { name: command.name, run: command.run, network: command.network?.reason ?? null };
}

export function projectSettingsView(project: ProjectConfig): ProjectSettingsView {
  const { conventions } = project;
  return {
    roles: roleSettings(project.roles),
    overriddenPrompts: AGENT_ROLES.filter((role) => project.prompts[role] !== undefined),
    concurrency: { issues: project.concurrency.issues, ceiling: project.concurrency.ceiling },
    setup: project.setupCommands.map(commandView),
    gate: {
      beforeAcceptance: project.gate.commandsBeforeAcceptance.map(commandView),
      afterAcceptance: project.gate.commandsAfterAcceptance.map(commandView),
      timeoutMinutes: Math.round(project.gate.timeoutMs / MILLISECONDS_PER_MINUTE),
    },
    environmentVariables: [...project.environment.passthrough, ...Object.keys(project.environment.set)].sort(),
    labels: { factory: conventions.labels.factory, validated: conventions.labels.validated, audit: conventions.labels.audit, kindPrefix: conventions.labels.kindPrefix },
    branchPrefix: conventions.branchPrefix,
    automations: project.audits.ignore.map((automation) => ({ name: automation.name, branches: [...automation.branches], authors: [...automation.authors] })),
    releaseModel: project.delivery.release.kind,
  };
}
