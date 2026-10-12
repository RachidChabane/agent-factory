import { ClaudeUsageReport, inheritedEnvironment, SpawnCommandRunner } from '@agent-factory/adapters';
import { UsageRefresher, type BudgetGovernor, type Clock, type EventStore, type OperationLog, type UsageReportSource } from '@agent-factory/application';
import type { AgentFactoryConfig } from '../../config/agent-factory-config.ts';
import type { SourceEnvironment } from './installation-context.ts';

export interface UsageSettings {
  readonly clock: Clock;
  readonly environment: SourceEnvironment;
  readonly workingDirectory: string;
}

/**
 * Reads each account's usage from the Claude CLI's own usage report, with only the variables any
 * agent run inherits; stopping the factory stops a read in progress.
 */
export function usageReportSource(config: AgentFactoryConfig, settings: UsageSettings): UsageReportSource {
  return new ClaudeUsageReport((signal) => new SpawnCommandRunner({ abortSignal: signal }), settings.clock, {
    command: config.claude.command,
    accountDirectories: Object.fromEntries(config.claude.accounts.map((account) => [account.name, account.configDir])),
    environment: inheritedEnvironment(settings.environment),
    workingDirectory: settings.workingDirectory,
  });
}

export function usageRefresher(config: AgentFactoryConfig, budget: BudgetGovernor, source: UsageReportSource, events: EventStore, clock: Clock, log: OperationLog): UsageRefresher {
  return new UsageRefresher(budget, source, events, clock, log, { refreshMs: config.claude.usage.refreshMs });
}
