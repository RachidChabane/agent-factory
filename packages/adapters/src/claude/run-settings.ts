import { join } from 'node:path';
import type { AgentRole } from '@agent-factory/domain';
import { POLICY_ARGUMENT } from '@agent-factory/plugin';
import { referenceCopyRules, type ReferenceMount } from './reference-access.ts';
import { CLAUDE_TOOLS, ROLE_PERMISSIONS, bashRule, builtInToolsOf } from './role-permissions.ts';

export const FROZEN_WRITE_TOOLS_MATCHER = 'Edit|Write|MultiEdit|NotebookEdit';
export const FROZEN_WRITE_GUARD_TIMEOUT_SECONDS = 30;
export const STOP_HOOK_TIMEOUT_MARGIN_SECONDS = 30;
const MILLISECONDS_PER_SECOND = 1_000;
const RECURSIVE_GLOB = '**';
export const PROJECT_SETTINGS_FILES = ['.claude/settings.json', '.claude/settings.local.json'] as const;
const HOOK_TYPE_COMMAND = 'command';

export interface HookScripts {
  readonly stopGate: string;
  readonly frozenWriteGuard: string;
}

export interface RunSettingsInput {
  readonly role: AgentRole;
  readonly extraAllowedTools: readonly string[];
  readonly worktree: string;
  readonly frozenCheckPaths: readonly string[];
  readonly protectedDirectories: readonly string[];
  readonly hookRuntime: string;
  readonly hookScripts: HookScripts;
  readonly policyPath: string;
  readonly gateRequired: boolean;
  readonly gateTimeoutMs: number;
  readonly sandboxAllowedDomains: readonly string[];
  readonly writableDirectories: readonly string[];
  readonly deniedReadPaths: readonly string[];
  readonly readablePaths: readonly string[];
  /** Shell command patterns the project lets its writing roles run, such as `go test *`. */
  readonly shellCommands: readonly string[];
  /** The Unix sockets the run's shell may connect to, the container engine's when the project grants it. */
  readonly unixSockets: readonly string[];
  /** Whether the platform's sandbox can only open every Unix socket or none, as on Linux. */
  readonly socketsAllOrNothing: boolean;
  /** The reference snapshots of the project: every role reads them, the writing roles copy from them, none writes to them. */
  readonly references: readonly ReferenceMount[];
}

export interface CommandHook {
  readonly type: typeof HOOK_TYPE_COMMAND;
  readonly command: string;
  readonly timeout: number;
}

export interface HookMatcher {
  readonly matcher?: string;
  readonly hooks: readonly CommandHook[];
}

export interface ClaudeRunSettings {
  readonly permissions: { readonly allow: readonly string[]; readonly deny: readonly string[] };
  readonly sandbox: {
    readonly enabled: true;
    readonly failIfUnavailable: true;
    readonly autoAllowBashIfSandboxed: false;
    readonly allowUnsandboxedCommands: false;
    readonly filesystem: {
      readonly allowWrite: readonly string[];
      readonly denyRead: readonly string[];
      readonly allowRead: readonly string[];
      readonly denyWrite: readonly string[];
    };
    readonly network: {
      readonly allowedDomains: readonly string[];
      readonly allowUnixSockets?: readonly string[];
      readonly allowAllUnixSockets?: true;
    };
  };
  readonly hooks: { readonly PreToolUse?: readonly HookMatcher[]; readonly Stop?: readonly HookMatcher[] };
}

export interface RenderedRunSettings {
  readonly settings: ClaudeRunSettings;
  readonly availableTools: readonly string[];
  readonly allowedTools: readonly string[];
}

export function renderRunSettings(input: RunSettingsInput): RenderedRunSettings {
  const rolePermissions = ROLE_PERMISSIONS[input.role];
  const projectCommands = rolePermissions.runsProjectCommands ? input.shellCommands.map(bashRule) : [];
  const referencePaths = input.references.map((mount) => mount.path);
  const referenceCopies = rolePermissions.copiesReferences ? referenceCopyRules(input.references) : [];
  const allowedTools = unique([...rolePermissions.allow, ...projectCommands, ...referenceCopies, ...input.extraAllowedTools]);
  const frozenFiles = input.frozenCheckPaths.map((path) => join(input.worktree, path));
  const protectedFiles = [...frozenFiles, ...PROJECT_SETTINGS_FILES.map((path) => join(input.worktree, path))];
  const deny = unique([
    ...rolePermissions.deny,
    ...input.protectedDirectories.flatMap((directory) => [
      absolutePathRule(CLAUDE_TOOLS.read, join(directory, RECURSIVE_GLOB)),
      absolutePathRule(CLAUDE_TOOLS.edit, join(directory, RECURSIVE_GLOB)),
    ]),
    ...input.deniedReadPaths.flatMap((path) => [
      absolutePathRule(CLAUDE_TOOLS.read, path),
      absolutePathRule(CLAUDE_TOOLS.read, join(path, RECURSIVE_GLOB)),
    ]),
    ...protectedFiles.map((file) => absolutePathRule(CLAUDE_TOOLS.edit, file)),
    ...referencePaths.map((path) => absolutePathRule(CLAUDE_TOOLS.edit, join(path, RECURSIVE_GLOB))),
  ]);
  return {
    settings: {
      permissions: { allow: allowedTools, deny },
      sandbox: {
        enabled: true,
        failIfUnavailable: true,
        autoAllowBashIfSandboxed: false,
        allowUnsandboxedCommands: false,
        filesystem: {
          allowWrite: input.writableDirectories,
          denyRead: unique([...input.protectedDirectories, ...input.deniedReadPaths]),
          allowRead: unique([...input.readablePaths, ...input.unixSockets, ...referencePaths]),
          denyWrite: unique([...input.protectedDirectories, ...protectedFiles, ...referencePaths]),
        },
        network: renderNetwork(input),
      },
      hooks: renderHooks(input),
    },
    availableTools: builtInToolsOf(allowedTools),
    allowedTools,
  };
}

function renderNetwork(input: RunSettingsInput): ClaudeRunSettings['sandbox']['network'] {
  if (input.unixSockets.length === 0) return { allowedDomains: input.sandboxAllowedDomains };
  return {
    allowedDomains: input.sandboxAllowedDomains,
    allowUnixSockets: input.unixSockets,
    ...(input.socketsAllOrNothing ? { allowAllUnixSockets: true } : {}),
  };
}

export function absolutePathRule(tool: string, absolutePath: string): string {
  return `${tool}(/${absolutePath})`;
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function renderHooks(input: RunSettingsInput): ClaudeRunSettings['hooks'] {
  const policyArguments = `${POLICY_ARGUMENT} ${shellQuote(input.policyPath)}`;
  const hookCommand = (script: string): string => `${shellQuote(input.hookRuntime)} ${shellQuote(script)} ${policyArguments}`;
  const preToolUse: readonly HookMatcher[] =
    input.frozenCheckPaths.length === 0
      ? []
      : [
          {
            matcher: FROZEN_WRITE_TOOLS_MATCHER,
            hooks: [
              {
                type: HOOK_TYPE_COMMAND,
                command: hookCommand(input.hookScripts.frozenWriteGuard),
                timeout: FROZEN_WRITE_GUARD_TIMEOUT_SECONDS,
              },
            ],
          },
        ];
  const stop: readonly HookMatcher[] = input.gateRequired
    ? [
        {
          hooks: [
            {
              type: HOOK_TYPE_COMMAND,
              command: hookCommand(input.hookScripts.stopGate),
              timeout: Math.ceil(input.gateTimeoutMs / MILLISECONDS_PER_SECOND) + STOP_HOOK_TIMEOUT_MARGIN_SECONDS,
            },
          ],
        },
      ]
    : [];
  return {
    ...(preToolUse.length === 0 ? {} : { PreToolUse: preToolUse }),
    ...(stop.length === 0 ? {} : { Stop: stop }),
  };
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
