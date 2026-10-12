import { SpawnCommandRunner } from '@agent-factory/adapters';
import {
  attributionRules,
  auditMerge,
  ChallengeRequest,
  CutRelease,
  DEFAULT_RETRY_DELAY_MS,
  evaluateRelease,
  FactoryDaemon,
  IssuePipeline,
  MarkdownAuditIssueRenderer,
  ProjectSchedulingPauses,
  RedeployEnvironment,
  ResumeIssue,
  type AuditRunner,
  type EvaluateReleaseDependencies,
  type IssueDriver,
  type PauseSet,
  type ProjectScheduler,
  type ReleaseEvaluator,
  type RequestChallenger,
  type RequestDecisionSettings,
} from '@agent-factory/application';
import type { RoleSettings } from '../../config/agent-factory-config.ts';
import type { InstallationContext } from '../installation/installation-context.ts';
import { SystemSleeper } from '../system.ts';
import { releaseModel } from './delivery.ts';
import type { ProjectRuntime } from './project-runtime.ts';

export const AUDIT_CHECKOUT_PREFIX = 'audit-';
const NO_APPENDED_SYSTEM_PROMPT = '';
const AUDIT_CHECKOUT_SHA_LENGTH = 12;

export function repositorySlug(project: ProjectRuntime): string {
  return `${project.config.repository.owner}/${project.config.repository.name}`;
}

export function issuePipeline(project: ProjectRuntime, signal: AbortSignal): IssueDriver {
  return new IssuePipeline({ ...project.dependencies, runner: new SpawnCommandRunner({ abortSignal: signal }) }, project.settings, { signal });
}

function profileOf(role: RoleSettings) {
  return { model: role.model, effort: role.effort, maxBudgetUsd: role.maxBudgetUsd, maxTurns: role.maxTurns, timeoutMs: role.timeoutMs };
}

export function requestChallenger(project: ProjectRuntime, installation: InstallationContext): ChallengeRequest {
  const { dependencies } = project;
  return new ChallengeRequest(
    {
      events: dependencies.events,
      harness: dependencies.harness,
      roles: dependencies.roles,
      files: dependencies.files,
      checkouts: project.checkouts,
      knowledge: project.knowledge,
      clock: installation.clock,
      ids: dependencies.ids,
    },
    {
      repository: repositorySlug(project),
      requestsDirectory: project.config.directories.requests,
      profile: profileOf(project.config.roles.challenger),
      conventions: project.conventions,
    },
  );
}

export function auditRunner(project: ProjectRuntime): AuditRunner {
  const { dependencies, checkouts } = project;
  return {
    audit: async (auditId, signal) => {
      const role = project.config.roles.auditor;
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
            settings: { ...profileOf(role), repository: repositorySlug(project), workingDirectory: checkout.path, appendSystemPrompt: NO_APPENDED_SYSTEM_PROMPT },
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

export function releaseDependencies(project: ProjectRuntime): EvaluateReleaseDependencies {
  const { events, github } = project.dependencies;
  return { events, github, health: project.releaseHealth, rules: attributionRules(project.conventions) };
}

export function releaseEvaluator(project: ProjectRuntime): ReleaseEvaluator {
  return { evaluate: (release) => evaluateRelease(releaseDependencies(project), release) };
}

export function releaseCutter(project: ProjectRuntime): CutRelease {
  return new CutRelease(releaseDependencies(project));
}

export function environmentRedeployer(project: ProjectRuntime): RedeployEnvironment {
  return new RedeployEnvironment(project.dependencies, project.delivery);
}

export function issueResumer(project: ProjectRuntime): ResumeIssue {
  return new ResumeIssue(project.dependencies, { conventions: project.conventions, escalation: project.settings.implementerEscalation });
}

export function requestDecisionSettings(project: ProjectRuntime): RequestDecisionSettings {
  return { requestsDirectory: project.config.directories.requests, conventions: project.conventions };
}

/** The daemon of one project, driven by the installation's daemon, obeying the installation's pauses and its own. */
export function projectDaemon(project: ProjectRuntime, installation: InstallationContext, installationPauses: () => PauseSet): FactoryDaemon {
  const { dependencies, config } = project;
  const challenger: RequestChallenger = { challenge: (requestId, signal) => requestChallenger(project, installation).challenge(requestId, signal) };
  return new FactoryDaemon(
    {
      events: dependencies.events,
      states: dependencies.states,
      github: dependencies.github,
      pool: dependencies.pool,
      clock: installation.clock,
      sleeper: new SystemSleeper(),
      pauses: new ProjectSchedulingPauses(dependencies.events, installationPauses),
      notifications: project.notifications,
      log: project.log,
      pipelines: (signal) => issuePipeline(project, signal),
      audits: auditRunner(project),
      challenges: challenger,
      releases: releaseEvaluator(project),
      configuration: null,
    },
    {
      concurrency: config.concurrency.issues,
      poolSize: config.worktreePool.size,
      baseBranch: config.baseBranch,
      conventions: project.conventions,
      releaseModel: releaseModel(config),
      pollIntervalMs: installation.config.daemon.pollIntervalMs,
      mergeWatchIntervalMs: installation.config.daemon.mergeWatchIntervalMs,
      issueRefreshMs: installation.config.daemon.issueRefreshMs,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    },
  );
}

/** What the installation's daemon drives for one project. */
export function projectScheduler(project: ProjectRuntime, daemon: FactoryDaemon): ProjectScheduler {
  return {
    projectId: project.id,
    start: () => daemon.start(),
    tick: (signal) => daemon.tick(signal),
    stop: () => daemon.stop(),
    updateConcurrency: (concurrency) => daemon.updateConcurrency(concurrency),
    isIdle: () => daemon.isIdle(),
  };
}
