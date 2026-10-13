import type { LocalCheckScheduling } from '@agent-factory/adapters';
import type { AgentFactoryConfig, ProjectConfig } from '../../config/agent-factory-config.ts';
import type {
  AgentHarness,
  AgentRunAdmission,
  BudgetGovernor,
  Clock,
  CommandRunner,
  EventStore,
  FilmLedger,
  MediaLinkCache,
  Notifier,
  OperationLog,
  ResourceGuard,
  RunLogStore,
  RunSlots,
  UsageRefresher,
} from '@agent-factory/application';
import type { ListeningPorts } from '../listening-ports.ts';

export type SourceEnvironment = Readonly<Record<string, string | undefined>>;

/** What a project of the installation shares with the others. */
export interface InstallationContext {
  readonly config: AgentFactoryConfig;
  readonly environment: SourceEnvironment;
  readonly platform: string;
  /** The operator's home directory. */
  readonly userHome: string;
  readonly clock: Clock;
  readonly log: OperationLog;
  readonly runner: CommandRunner;
  /** The installation's log; every project writes its own events under its prefix. */
  readonly events: EventStore;
  readonly runLogs: RunLogStore;
  readonly resources: ResourceGuard;
  readonly admission: AgentRunAdmission;
  readonly budget: BudgetGovernor;
  /** Keeps each account's usage read; every agent run first makes sure it is fresh. */
  readonly usage: UsageRefresher;
  readonly runSlots: RunSlots;
  readonly listeningPorts: ListeningPorts;
  /** Delivers notices to the configured channels, without duplicates. */
  readonly notifier: Notifier;
  /** The links of the media already uploaded, kept by content, whichever project's pull request they belong to. */
  readonly mediaLinks: MediaLinkCache;
  /** Aborted when the installation closes: work the installation started in the background stops with it. */
  readonly lifetime: AbortSignal;
  /** When the gate of a local forge runs once a commit's checks are asked for. */
  readonly localChecks: LocalCheckScheduling;
  /** The films of every project that films, in one queue; null when no project films. */
  readonly filmLedger: FilmLedger | null;
  /** The agent that runs instead of the Claude CLI, in tests and in the demonstration. */
  readonly harnessFor: ((project: ProjectConfig) => AgentHarness) | null;
}
