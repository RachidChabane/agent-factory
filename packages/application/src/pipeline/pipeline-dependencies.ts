import type {
  AgentHarness,
  BaseCheckouts,
  CommandRunner,
  CommandSandbox,
  EventStore,
  GitHubGateway,
  IdGenerator,
  IssueStateStore,
  KnownSecretSource,
  LogArchive,
  ResourceGuard,
  RolePromptCatalog,
  ServiceProcesses,
  SourceControl,
  SpecReader,
  WorkspaceFiles,
  WorktreePool,
} from '../ports.ts';
import type { StackSlots } from './issue-stack.ts';

export interface PipelineDependencies {
  readonly github: GitHubGateway;
  readonly specReader: SpecReader;
  readonly pool: WorktreePool;
  readonly sourceControl: SourceControl;
  readonly harness: AgentHarness;
  readonly roles: RolePromptCatalog;
  readonly runner: CommandRunner;
  readonly sandbox: CommandSandbox;
  readonly knownSecrets: KnownSecretSource;
  readonly events: EventStore;
  readonly states: IssueStateStore;
  readonly files: WorkspaceFiles;
  readonly logs: LogArchive;
  readonly resources: ResourceGuard;
  readonly ids: IdGenerator;
  readonly baseWorkspaces: BaseCheckouts;
  /** The long-running processes of the project's stack. */
  readonly services: ServiceProcesses;
  /** The stack slots of the project, shared by the issues it runs at once. */
  readonly stackSlots: StackSlots;
}
