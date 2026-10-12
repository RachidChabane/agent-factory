import type { AgentRunRequest } from '@agent-factory/application';

export const PINNED_CLAUDE_VERSION = '2.1.296';

export const CLAUDE_FLAGS = {
  print: '--print',
  outputFormat: '--output-format',
  verbose: '--verbose',
  includePartialMessages: '--include-partial-messages',
  includeHookEvents: '--include-hook-events',
  permissionMode: '--permission-mode',
  settingSources: '--setting-sources',
  strictMcpConfig: '--strict-mcp-config',
  model: '--model',
  effort: '--effort',
  maxTurns: '--max-turns',
  maxBudgetUsd: '--max-budget-usd',
  settings: '--settings',
  mcpConfig: '--mcp-config',
  tools: '--tools',
  allowedTools: '--allowedTools',
  appendSystemPromptFile: '--append-system-prompt-file',
  resume: '--resume',
  addDir: '--add-dir',
} as const;

const STREAM_JSON_OUTPUT = 'stream-json';
const DONT_ASK_PERMISSION_MODE = 'dontAsk';
const PROJECT_AND_LOCAL_SETTING_SOURCES = 'project,local';
const LIST_SEPARATOR = ',';

export const CLAUDE_PRINT_MODE_INVOCATION = [
  CLAUDE_FLAGS.print,
  CLAUDE_FLAGS.outputFormat,
  STREAM_JSON_OUTPUT,
  CLAUDE_FLAGS.verbose,
  CLAUDE_FLAGS.includePartialMessages,
  CLAUDE_FLAGS.includeHookEvents,
  CLAUDE_FLAGS.permissionMode,
  DONT_ASK_PERMISSION_MODE,
  CLAUDE_FLAGS.settingSources,
  PROJECT_AND_LOCAL_SETTING_SOURCES,
  CLAUDE_FLAGS.strictMcpConfig,
] as const;

export const CLAUDE_PROMPT_CHANNEL = 'stdin';

export interface ClaudeRunFiles {
  readonly settingsPath: string;
  readonly mcpConfigPath: string;
  readonly appendSystemPromptPath: string;
}

export interface ClaudeToolSelection {
  readonly availableTools: readonly string[];
  readonly allowedTools: readonly string[];
}

export function buildClaudeArguments(
  request: AgentRunRequest,
  files: ClaudeRunFiles,
  tools: ClaudeToolSelection,
  additionalDirectories: readonly string[] = [],
): readonly string[] {
  return [
    ...CLAUDE_PRINT_MODE_INVOCATION,
    CLAUDE_FLAGS.model,
    request.model,
    CLAUDE_FLAGS.effort,
    request.effort,
    CLAUDE_FLAGS.maxTurns,
    String(request.maxTurns),
    CLAUDE_FLAGS.maxBudgetUsd,
    String(request.maxBudgetUsd),
    CLAUDE_FLAGS.settings,
    files.settingsPath,
    CLAUDE_FLAGS.mcpConfig,
    files.mcpConfigPath,
    CLAUDE_FLAGS.tools,
    tools.availableTools.join(LIST_SEPARATOR),
    CLAUDE_FLAGS.allowedTools,
    tools.allowedTools.join(LIST_SEPARATOR),
    CLAUDE_FLAGS.appendSystemPromptFile,
    files.appendSystemPromptPath,
    ...additionalDirectories.flatMap((directory) => [CLAUDE_FLAGS.addDir, directory]),
    ...(request.resumeSessionId === null ? [] : [CLAUDE_FLAGS.resume, request.resumeSessionId]),
  ];
}
