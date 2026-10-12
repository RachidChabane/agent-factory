import type { RunSummary, TokenUsage } from '../metering/metering.ts';
import { stampFields, usageFields, type Stamp, type StreamLine } from './stream-line.ts';
import {
  ASSISTANT_ROLE,
  CONTENT_TYPES,
  DENIAL_REASON_HOOK,
  EMULATED_CLAUDE_VERSION,
  LINE_TYPES,
  MESSAGE_TYPE,
  RESULT_SUBTYPE_SUCCESS,
  SLASH_COMMANDS,
  STOP_REASON_END_TURN,
  SYSTEM_SUBTYPES,
  USER_ROLE,
} from './stream-vocabulary.ts';

const API_KEY_SOURCE = 'none';
const OUTPUT_STYLE = 'default';
const DIRECT_CALLER = { type: 'direct' } as const;
const TERMINAL_REASON_COMPLETED = 'completed';

export interface InitDetails {
  readonly workingDirectory: string;
  readonly tools: readonly string[];
  readonly model: string;
  readonly permissionMode: string;
}

export function initLine(stamp: Stamp, details: InitDetails): StreamLine {
  return {
    type: LINE_TYPES.system,
    subtype: SYSTEM_SUBTYPES.init,
    cwd: details.workingDirectory,
    tools: details.tools,
    mcp_servers: [],
    model: details.model,
    permissionMode: details.permissionMode,
    slash_commands: SLASH_COMMANDS,
    apiKeySource: API_KEY_SOURCE,
    claude_code_version: EMULATED_CLAUDE_VERSION,
    output_style: OUTPUT_STYLE,
    agents: [],
    skills: [],
    plugins: [],
    ...stampFields(stamp),
  };
}

export interface TextBlock {
  readonly type: typeof CONTENT_TYPES.text;
  readonly text: string;
}

export interface ToolUseBlock {
  readonly type: typeof CONTENT_TYPES.toolUse;
  readonly id: string;
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly caller: typeof DIRECT_CALLER;
}

export function textBlock(text: string): TextBlock {
  return { type: CONTENT_TYPES.text, text };
}

export function toolUseBlock(id: string, name: string, input: Readonly<Record<string, unknown>>): ToolUseBlock {
  return { type: CONTENT_TYPES.toolUse, id, name, input, caller: DIRECT_CALLER };
}

export interface AssistantMessage {
  readonly id: string;
  readonly model: string;
  readonly block: TextBlock | ToolUseBlock;
  readonly usage: TokenUsage;
}

export function assistantLine(stamp: Stamp, message: AssistantMessage): StreamLine {
  return {
    type: LINE_TYPES.assistant,
    message: {
      model: message.model,
      id: message.id,
      type: MESSAGE_TYPE,
      role: ASSISTANT_ROLE,
      content: [message.block],
      container: null,
      stop_reason: null,
      stop_sequence: null,
      stop_details: null,
      usage: usageFields(message.usage),
    },
    parent_tool_use_id: null,
    ...stampFields(stamp),
  };
}

export interface ToolResult {
  readonly toolUseId: string;
  readonly content: string;
  readonly failed: boolean;
  readonly detail: unknown;
}

export function toolResultLine(stamp: Stamp, result: ToolResult): StreamLine {
  return {
    type: LINE_TYPES.user,
    message: {
      role: USER_ROLE,
      content: [
        {
          tool_use_id: result.toolUseId,
          type: CONTENT_TYPES.toolResult,
          content: result.content,
          ...(result.failed ? { is_error: true } : {}),
        },
      ],
    },
    parent_tool_use_id: null,
    ...stampFields(stamp),
    tool_use_result: result.detail,
  };
}

export function syntheticUserLine(stamp: Stamp, text: string): StreamLine {
  return {
    type: LINE_TYPES.user,
    message: { role: USER_ROLE, content: [textBlock(text)] },
    parent_tool_use_id: null,
    ...stampFields(stamp),
    isSynthetic: true,
  };
}

export interface PermissionDenial {
  readonly toolName: string;
  readonly toolUseId: string;
  readonly message: string;
}

export function permissionDeniedLine(stamp: Stamp, denial: PermissionDenial): StreamLine {
  return {
    type: LINE_TYPES.system,
    subtype: SYSTEM_SUBTYPES.permissionDenied,
    tool_name: denial.toolName,
    tool_use_id: denial.toolUseId,
    decision_reason_type: DENIAL_REASON_HOOK,
    message: denial.message,
    ...stampFields(stamp),
  };
}

export interface ToolDenialRecord {
  readonly toolName: string;
  readonly toolUseId: string;
  readonly toolInput: Readonly<Record<string, unknown>>;
}

export interface ResultDetails {
  readonly summary: RunSummary;
  readonly resultText: string;
  readonly denials: readonly ToolDenialRecord[];
}

export function resultLine(stamp: Stamp, details: ResultDetails): StreamLine {
  return {
    type: LINE_TYPES.result,
    subtype: RESULT_SUBTYPE_SUCCESS,
    is_error: false,
    api_error_status: null,
    duration_ms: details.summary.durationMs,
    duration_api_ms: details.summary.apiDurationMs,
    num_turns: details.summary.turns,
    result: details.resultText,
    stop_reason: STOP_REASON_END_TURN,
    total_cost_usd: details.summary.costUsd,
    usage: usageFields(details.summary.usage),
    permission_denials: details.denials.map((denial) => ({
      tool_name: denial.toolName,
      tool_use_id: denial.toolUseId,
      tool_input: denial.toolInput,
    })),
    terminal_reason: TERMINAL_REASON_COMPLETED,
    ...stampFields(stamp),
  };
}
