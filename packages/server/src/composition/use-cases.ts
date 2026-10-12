import { SpawnCommandRunner } from '@agent-factory/adapters';
import {
  attributionRules,
  auditMerge,
  ChallengeRequest,
  DEFAULT_RETRY_DELAY_MS,
  evaluateRelease,
  FactoryDaemon,
  IssuePipeline,
  MachineSchedulingPauses,
  MarkdownAuditIssueRenderer,
  type AuditRunner,
  type IssueDriver,
  type ReleaseEvaluator,
  type RequestChallenger,
} from '@agent-factory/application';
import type { RoleSettings } from '../config/factory-config.ts';
import type { FactoryContainer } from './factory-container.ts';
import { SystemSleeper } from './system.ts';

export const AUDIT_CHECKOUT_PREFIX = 'audit-';
const NO_APPENDED_SYSTEM_PROMPT = '';
const AUDIT_CHECKOUT_SHA_LENGTH = 12;

export class RoleNotConfiguredError extends Error {
  constructor(role: string, configPath: string) {
    super(`The ${role} role has no settings in ${configPath}; add roles.${role} to use it`);
    this.name = 'RoleNotConfiguredError';
  }
}

export function repositorySlug(factory: FactoryContainer): string {
  return `${factory.config.target.owner}/${factory.config.target.name}`;
}

export function issuePipeline(factory: FactoryContainer, signal: AbortSignal): IssueDriver {
  const runner = new SpawnCommandRunner({ abortSignal: signal });
  return new IssuePipeline({ ...factory.dependencies, runner }, factory.settings, { signal });
}

function requireRole(factory: FactoryContainer, role: 'challenger' | 'auditor'): RoleSettings {
  const settings = factory.config.roles[role];
  if (settings === undefined) throw new RoleNotConfiguredError(role, factory.config.configPath);
  return settings;
}

export function requestChallenger(factory: FactoryContainer): ChallengeRequest {
  const role = requireRole(factory, 'challenger');
  const { dependencies } = factory;
  return new ChallengeRequest(
    {
      events: dependencies.events,
      harness: dependencies.harness,
      roles: dependencies.roles,
      files: dependencies.files,
      checkouts: factory.checkouts,
      knowledge: factory.knowledge,
      clock: factory.clock,
      ids: dependencies.ids,
    },
    {
      repository: repositorySlug(factory),
      requestsDirectory: factory.config.directories.requests,
      profile: { model: role.model, effort: role.effort, maxBudgetUsd: role.maxBudgetUsd, maxTurns: role.maxTurns, timeoutMs: role.timeoutMs },
      conventions: factory.settings.conventions,
    },
  );
}

export function auditRunner(factory: FactoryContainer): AuditRunner | null {
  if (factory.config.roles.auditor === undefined) return null;
  const { dependencies, checkouts } = factory;
  return {
    audit: async (auditId, signal) => {
      const role = factory.config.roles.auditor;
      if (role === undefined) throw new RoleNotConfiguredError('auditor', factory.config.configPath);
      const checkout = await checkouts.checkout(`${AUDIT_CHECKOUT_PREFIX}${auditId.slice(0, AUDIT_CHECKOUT_SHA_LENGTH)}`, auditId);
      try {
        return await auditMerge(
          {
            events: dependencies.events,
            github: dependencies.github,
            harness: dependencies.harness,
            prompts: dependencies.roles,
            issueRenderer: new MarkdownAuditIssueRenderer(),
            nextRunId: () => dependencies.ids.next(),
            settings: {
              repository: repositorySlug(factory),
              model: role.model,
              effort: role.effort,
              workingDirectory: checkout.path,
              maxBudgetUsd: role.maxBudgetUsd,
              maxTurns: role.maxTurns,
              timeoutMs: role.timeoutMs,
              appendSystemPrompt: NO_APPENDED_SYSTEM_PROMPT,
            },
          },
          auditId,
          signal,
        );
      } finally {
        await checkouts.remove(checkout);
      }
    },
  };
}

export function releaseEvaluator(factory: FactoryContainer): ReleaseEvaluator {
  const { events, github } = factory.dependencies;
  return { evaluate: (release) => evaluateRelease({ events, github, health: factory.health, rules: attributionRules(factory.settings.conventions) }, release) };
}

function optionalChallenger(factory: FactoryContainer): RequestChallenger | null {
  if (factory.config.roles.challenger === undefined) return null;
  return { challenge: (requestId, signal) => requestChallenger(factory).challenge(requestId, signal) };
}

export function createDaemon(factory: FactoryContainer): FactoryDaemon {
  const { config, dependencies } = factory;
  return new FactoryDaemon(
    {
      events: dependencies.events,
      states: dependencies.states,
      github: dependencies.github,
      pool: dependencies.pool,
      clock: factory.clock,
      sleeper: new SystemSleeper(),
      pauses: new MachineSchedulingPauses({ events: dependencies.events, admission: factory.admission, budget: factory.budget, notifications: factory.notifications }),
      notifications: factory.notifications,
      log: factory.log,
      pipelines: (signal) => issuePipeline(factory, signal),
      audits: auditRunner(factory),
      challenges: optionalChallenger(factory),
      releases: releaseEvaluator(factory),
      configuration: factory.configuration,
    },
    {
      concurrency: config.concurrency.issues,
      poolSize: config.worktreePool.size,
      baseBranch: config.target.baseBranch,
      conventions: factory.settings.conventions,
      pollIntervalMs: config.daemon.pollIntervalMs,
      mergeWatchIntervalMs: config.daemon.mergeWatchIntervalMs,
      issueRefreshMs: config.daemon.issueRefreshMs,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    },
  );
}
