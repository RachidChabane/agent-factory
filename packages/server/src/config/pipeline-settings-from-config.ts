import type { PipelineSettings, RoleProfile } from '@agent-factory/application';
import { conventionsFromConfig } from './conventions-from-config.ts';
import type { FactoryConfig, RoleSettings } from './factory-config.ts';

function profile(settings: RoleSettings): RoleProfile {
  return {
    model: settings.model,
    effort: settings.effort,
    maxBudgetUsd: settings.maxBudgetUsd,
    maxTurns: settings.maxTurns,
    timeoutMs: settings.timeoutMs,
  };
}

export function checkCommandEnvironment(
  config: FactoryConfig,
  source: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  const inherited = Object.fromEntries(
    config.gate.environmentPassthrough.flatMap((name) => {
      const value = source[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
  return { ...inherited, ...config.gate.environmentSet };
}

export function pipelineSettingsFrom(config: FactoryConfig, source: Readonly<Record<string, string | undefined>>): PipelineSettings {
  return {
    repository: { owner: config.target.owner, name: config.target.name },
    setupCommands: config.target.setupCommands,
    roles: {
      'acceptance-author': profile(config.roles['acceptance-author']),
      implementer: profile(config.roles.implementer),
      reviewer: profile(config.roles.reviewer),
    },
    implementerEscalation: config.roles.implementer.escalation,
    gate: {
      commandsBeforeAcceptance: config.gate.commandsBeforeAcceptance,
      commandsAfterAcceptance: config.gate.commandsAfterAcceptance,
      commandTimeoutMs: config.gate.timeoutMs,
      environment: checkCommandEnvironment(config, source),
      niceness: config.gate.niceness,
    },
    conventions: conventionsFromConfig(config),
    evidenceCacheDirectory: config.directories.evidence,
    resources: config.resources,
  };
}
