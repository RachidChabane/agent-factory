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
  SourceControl,
  SpecReader,
  WorkspaceFiles,
  WorktreePool,
} from '../ports.ts';

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
}
