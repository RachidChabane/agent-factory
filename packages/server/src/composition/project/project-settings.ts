import type { PipelineSettings, ProjectConventions, RoleProfile } from '@agent-factory/application';
import { IssueTypology } from '@agent-factory/domain';
import type { AgentFactoryConfig, ProjectConfig, RoleSettings } from '../../config/agent-factory-config.ts';
import { forgeFileLinks } from './forge.ts';

export type SourceEnvironment = Readonly<Record<string, string | undefined>>;

export function projectConventions(project: ProjectConfig): ProjectConventions {
  const { labels, branchPrefix, defaultScope } = project.conventions;
  return {
    typology: new IssueTypology(project.issueTypes),
    labels: { factory: labels.factory, validated: labels.validated, audit: labels.audit, kindPrefix: labels.kindPrefix },
    branchPrefix,
    defaultScope,
    automations: project.audits.ignore,
  };
}

export function roleProfile(role: RoleSettings): RoleProfile {
  return { model: role.model, effort: role.effort, maxBudgetUsd: role.maxBudgetUsd, maxTurns: role.maxTurns, timeoutMs: role.timeoutMs };
}

/** The environment of check commands: the passed-through variables of the factory's own environment, then the configured values. */
export function checkEnvironment(project: ProjectConfig, source: SourceEnvironment): Readonly<Record<string, string>> {
  const inherited = Object.fromEntries(
    project.environment.passthrough.flatMap((name) => {
      const value = source[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
  return { ...inherited, ...project.environment.set };
}

export function pipelineSettings(config: AgentFactoryConfig, project: ProjectConfig, source: SourceEnvironment): PipelineSettings {
  return {
    repository: project.repository,
    fileLinks: forgeFileLinks(project, config.server.publicUrl),
    setupCommands: project.setupCommands,
    roles: {
      'acceptance-author': roleProfile(project.roles['acceptance-author']),
      implementer: roleProfile(project.roles.implementer),
      reviewer: roleProfile(project.roles.reviewer),
    },
    implementerEscalation: project.roles.implementer.escalation,
    gate: {
      commandsBeforeAcceptance: project.gate.commandsBeforeAcceptance,
      commandsAfterAcceptance: project.gate.commandsAfterAcceptance,
      commandTimeoutMs: project.gate.timeoutMs,
      environment: checkEnvironment(project, source),
      niceness: project.gate.niceness,
    },
    conventions: projectConventions(project),
    evidenceCacheDirectory: project.directories.evidence,
    resources: { minimumFreeMemoryPercent: config.resources.minimumFreeMemoryPercent, pauseAbovePressure: config.resources.pauseAbovePressure },
  };
}
