import { homedir } from 'node:os';
import { HOOK_SCRIPTS } from '@agent-factory/plugin';
import { BUILT_IN_CREDENTIAL_PATHS } from '../sandbox/credential-paths.ts';
import type { HookScripts } from './run-settings.ts';

export const CLAUDE_EXECUTABLE = 'claude';
export const NICE_EXECUTABLE = 'nice';
const NICE_ADJUSTMENT_FLAG = '-n';

export const DEFAULT_NICENESS = 10;
export const DEFAULT_TERMINATION_GRACE_MS = 10_000;
export const DEFAULT_GATE_TIMEOUT_MS = 15 * 60 * 1_000;
export const DEFAULT_MAX_SUBAGENT_SPAWN_DEPTH = 1;
export const DEFAULT_MAX_CONCURRENT_SUBAGENTS = 2;
export const DEFAULT_IN_SESSION_CORRECTIONS = 2;
export const DEFAULT_MAX_LINE_BYTES = 8 * 1024 * 1024;

export interface ClaudeHarnessConfig {
  readonly command: readonly string[];
  readonly niceness: number | null;
  readonly runsDirectory: string;
  readonly factoryInstallDirectory: string;
  readonly protectedDirectories: readonly string[];
  readonly writableDirectories: readonly string[];
  readonly toolEnvironment: Readonly<Record<string, string>>;
  readonly accounts: Readonly<Record<string, string>>;
  readonly deniedReadPaths: readonly string[];
  readonly home: string;
  readonly sourceEnvironment: Readonly<Record<string, string | undefined>>;
  readonly maxSubagentSpawnDepth: number;
  readonly maxConcurrentSubagents: number;
  readonly inSessionCorrections: number;
  readonly gateTimeoutMs: number;
  readonly terminationGraceMs: number;
  readonly sandboxAllowedDomains: readonly string[];
  readonly hookRuntime: string;
  readonly hookScripts: HookScripts;
  readonly maxLineBytes: number;
}

export type ClaudeHarnessSettings = Pick<ClaudeHarnessConfig, 'runsDirectory' | 'factoryInstallDirectory'> &
  Partial<ClaudeHarnessConfig>;

export function claudeHarnessConfig(settings: ClaudeHarnessSettings): ClaudeHarnessConfig {
  return {
    command: [CLAUDE_EXECUTABLE],
    niceness: DEFAULT_NICENESS,
    protectedDirectories: [],
    writableDirectories: [],
    toolEnvironment: {},
    accounts: {},
    deniedReadPaths: BUILT_IN_CREDENTIAL_PATHS,
    home: homedir(),
    sourceEnvironment: process.env,
    maxSubagentSpawnDepth: DEFAULT_MAX_SUBAGENT_SPAWN_DEPTH,
    maxConcurrentSubagents: DEFAULT_MAX_CONCURRENT_SUBAGENTS,
    inSessionCorrections: DEFAULT_IN_SESSION_CORRECTIONS,
    gateTimeoutMs: DEFAULT_GATE_TIMEOUT_MS,
    terminationGraceMs: DEFAULT_TERMINATION_GRACE_MS,
    sandboxAllowedDomains: [],
    hookRuntime: process.execPath,
    hookScripts: HOOK_SCRIPTS,
    maxLineBytes: DEFAULT_MAX_LINE_BYTES,
    ...settings,
  };
}

export function launchCommand(config: Pick<ClaudeHarnessConfig, 'command' | 'niceness'>): readonly string[] {
  return config.niceness === null
    ? config.command
    : [NICE_EXECUTABLE, NICE_ADJUSTMENT_FLAG, String(config.niceness), ...config.command];
}
