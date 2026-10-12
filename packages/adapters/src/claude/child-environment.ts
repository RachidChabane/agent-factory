export const TOOLCHAIN_LOCATION_VARIABLES = [
  'MISE_DATA_DIR',
  'MISE_CONFIG_DIR',
  'MISE_CACHE_DIR',
  'MISE_STATE_DIR',
  'RUSTUP_HOME',
  'CARGO_HOME',
] as const;

export const INHERITED_VARIABLES = ['PATH', 'HOME', 'LANG', 'TERM', 'TMPDIR', 'USER', ...TOOLCHAIN_LOCATION_VARIABLES] as const;

export const CHILD_VARIABLES = {
  githubConfigDirectory: 'GH_CONFIG_DIR',
  claudeConfigDirectory: 'CLAUDE_CONFIG_DIR',
  maxSubagentSpawnDepth: 'CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH',
  maxConcurrentSubagents: 'CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS',
  stopHookBlockCap: 'CLAUDE_CODE_STOP_HOOK_BLOCK_CAP',
  disableAutoMemory: 'CLAUDE_CODE_DISABLE_AUTO_MEMORY',
  disableAutoUpdater: 'DISABLE_AUTOUPDATER',
} as const;

const ENABLED = '1';

/** Variables a project's environment may not pass to an agent: each one would override a setting the factory gives per role. */
export const ROLE_OVERRIDING_VARIABLES: readonly string[] = ['CLAUDE_CODE_EFFORT_LEVEL'];

export const CREDENTIAL_VARIABLE_PATTERNS: readonly RegExp[] = [
  /^GH_/,
  /^GITHUB_/,
  /^SSH_AUTH_SOCK$/,
  /^AWS_/,
  /^AZURE_/,
  /^GOOGLE_/,
  /^GCLOUD_/,
  /^CLOUDSDK_/,
  /^DD_/,
  /^DATADOG_/,
  /^VAULT_/,
  /^AIVEN_/,
  /^ANTHROPIC_/,
  /^CLAUDECODE$/,
  /^CLAUDE_CODE_(SESSION_ID|MESSAGING_|CHILD_SESSION|ENTRYPOINT|EXECPATH)/,
];

export interface ChildEnvironmentOptions {
  readonly toolEnvironment?: Readonly<Record<string, string>>;
  readonly githubConfigDirectory: string;
  readonly claudeConfigDirectory: string | null;
  readonly maxSubagentSpawnDepth: number;
  readonly maxConcurrentSubagents: number;
  readonly stopHookBlockCap: number;
}

export type ChildEnvironment = Readonly<Record<string, string>>;

/** The operator variables every Claude CLI process of the factory inherits: no credential and no session marker. */
export function inheritedEnvironment(source: Readonly<Record<string, string | undefined>>): ChildEnvironment {
  return Object.fromEntries(
    INHERITED_VARIABLES.flatMap((name) => {
      const value = source[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

export function buildChildEnvironment(
  source: Readonly<Record<string, string | undefined>>,
  options: ChildEnvironmentOptions,
): ChildEnvironment {
  const inherited = inheritedEnvironment(source);
  const tools = Object.fromEntries(Object.entries(options.toolEnvironment ?? {}).filter(([name]) => !ROLE_OVERRIDING_VARIABLES.includes(name)));
  return {
    ...inherited,
    ...tools,
    [CHILD_VARIABLES.githubConfigDirectory]: options.githubConfigDirectory,
    ...(options.claudeConfigDirectory === null ? {} : { [CHILD_VARIABLES.claudeConfigDirectory]: options.claudeConfigDirectory }),
    [CHILD_VARIABLES.maxSubagentSpawnDepth]: String(options.maxSubagentSpawnDepth),
    [CHILD_VARIABLES.maxConcurrentSubagents]: String(options.maxConcurrentSubagents),
    [CHILD_VARIABLES.stopHookBlockCap]: String(options.stopHookBlockCap),
    [CHILD_VARIABLES.disableAutoMemory]: ENABLED,
    [CHILD_VARIABLES.disableAutoUpdater]: ENABLED,
  };
}

export function credentialVariablesIn(environment: ChildEnvironment): readonly string[] {
  return Object.keys(environment).filter(
    (name) =>
      name !== CHILD_VARIABLES.githubConfigDirectory &&
      CREDENTIAL_VARIABLE_PATTERNS.some((pattern) => pattern.test(name)),
  );
}
