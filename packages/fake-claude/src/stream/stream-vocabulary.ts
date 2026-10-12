export const LINE_TYPES = {
  system: 'system',
  assistant: 'assistant',
  user: 'user',
  result: 'result',
  rateLimit: 'rate_limit_event',
} as const;

export const SYSTEM_SUBTYPES = {
  init: 'init',
  hookStarted: 'hook_started',
  hookResponse: 'hook_response',
  permissionDenied: 'permission_denied',
} as const;

export const HOOK_EVENTS = {
  preToolUse: 'PreToolUse',
  stop: 'Stop',
} as const;

export type HookEventName = (typeof HOOK_EVENTS)[keyof typeof HOOK_EVENTS];

export const TOOL_NAMES = {
  write: 'Write',
  bash: 'Bash',
} as const;

export const CONTENT_TYPES = {
  text: 'text',
  toolUse: 'tool_use',
  toolResult: 'tool_result',
} as const;

export const MESSAGE_TYPE = 'message';
export const ASSISTANT_ROLE = 'assistant';
export const USER_ROLE = 'user';
export const STOP_REASON_END_TURN = 'end_turn';
export const RESULT_SUBTYPE_SUCCESS = 'success';
export const DENIAL_REASON_HOOK = 'hook';

export const DEFAULT_TOOLS: readonly string[] = ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write'];
export const DEFAULT_MODEL = 'fake-claude';
export const DEFAULT_PERMISSION_MODE = 'default';
export const SLASH_COMMANDS: readonly string[] = ['compact', 'context', 'init', 'usage'];

/** The release of the real CLI whose stream contract this fake follows. */
export const EMULATED_CLAUDE_VERSION = '2.1.296';
