export const DEFAULT_POOL_SIZE = 3;
export const DEFAULT_REMOTE_NAME = 'origin';
export const DEFAULT_PRESERVED_DIRECTORIES: readonly string[] = ['node_modules', '.venv'];
export const GIT_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
export const LEASE_FILE_NAME = 'leases.json';
export const SLOT_DIRECTORY_PREFIX = 'slot-';
export const FACTORY_BRANCH_PREFIX = 'factory/';
export const SHA256_ALGORITHM = 'sha256';
export const BASE_COPY_DIRECTORY_PREFIX = 'factory-base-copy-';
export const SCRATCH_INDEX_FILE_NAME = 'index';
export const NUL = '\0';
export const GIT_ENVIRONMENT_PASSTHROUGH: readonly string[] = [
  'PATH',
  'HOME',
  'LANG',
  'SSH_AUTH_SOCK',
  'GIT_SSH_COMMAND',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_NOSYSTEM',
];
export const DISABLED_HOOKS_PATH = '/dev/null';
export const GIT_FIXED_ENVIRONMENT: Readonly<Record<string, string>> = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.hooksPath',
  GIT_CONFIG_VALUE_0: DISABLED_HOOKS_PATH,
};
