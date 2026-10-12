import type { AgentRunEvent } from '@agent-factory/application';
import { RATE_LIMIT_WINDOWS, type RateLimitSnapshot } from '@agent-factory/domain';
import {
  AssistantSchema,
  HookResponseSchema,
  LineEnvelopeSchema,
  PermissionDeniedSchema,
  RateLimitEventSchema,
  ResultSchema,
  SystemInitSchema,
  TextBlockSchema,
  ThinkingBlockSchema,
  ToolResultBlockSchema,
  ToolUseBlockSchema,
  UserSchema,
  type ResultLine,
} from './stream-schemas.ts';
import { usageObservationOf, type UsageObservation } from './usage-tally.ts';

export interface ParsedStreamLine {
  readonly events: readonly AgentRunEvent[];
  readonly sessionId: string | null;
  readonly result: ResultLine | null;
  readonly usage: UsageObservation | null;
}

type LineTranslator = (value: unknown) => readonly AgentRunEvent[] | null;

const MILLISECONDS_PER_SECOND = 1_000;
const KEY_SEPARATOR = ':';
const RESULT_LINE_TYPE = 'result';
const NO_EVENTS: readonly AgentRunEvent[] = [];
const NOT_UNDERSTOOD = null;

export const TRANSPORT_LINE_KEYS: readonly string[] = ['stream_event', 'system:status', 'system:thinking_tokens', 'system:hook_started'];

const TRANSLATORS: Readonly<Record<string, LineTranslator>> = {
  'system:init': translateInit,
  'system:hook_response': translateHookResponse,
  'system:permission_denied': translatePermissionDenied,
  assistant: translateAssistant,
  user: translateUser,
  rate_limit_event: translateRateLimit,
};

export function parseStreamLine(line: string): ParsedStreamLine {
  const raw: AgentRunEvent = { kind: 'raw', line };
  const value = parseJson(line);
  const envelope = LineEnvelopeSchema.safeParse(value);
  if (!envelope.success) {
    return { events: [raw], sessionId: null, result: null, usage: null };
  }
  const { type, subtype, session_id: sessionId } = envelope.data;
  const key = subtype === undefined ? type : `${type}${KEY_SEPARATOR}${subtype}`;
  const translator = TRANSLATORS[key] ?? TRANSLATORS[type];
  const transport = TRANSPORT_LINE_KEYS.includes(key) || TRANSPORT_LINE_KEYS.includes(type);
  const events = transport ? NO_EVENTS : (translator?.(value) ?? NOT_UNDERSTOOD);
  return {
    events: events ?? [raw],
    sessionId: sessionId ?? null,
    result: type === RESULT_LINE_TYPE ? (ResultSchema.safeParse(value).data ?? null) : null,
    usage: usageObservationOf(value),
  };
}

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function translateInit(value: unknown): readonly AgentRunEvent[] | null {
  const parsed = SystemInitSchema.safeParse(value);
  if (!parsed.success) {
    return NOT_UNDERSTOOD;
  }
  return [{ kind: 'session-started', sessionId: parsed.data.session_id, model: parsed.data.model }];
}

function translateHookResponse(value: unknown): readonly AgentRunEvent[] | null {
  const parsed = HookResponseSchema.safeParse(value);
  if (!parsed.success) {
    return NOT_UNDERSTOOD;
  }
  const { hook_event: hookEvent, exit_code: exitCode, output, stdout, stderr } = parsed.data;
  return [{ kind: 'hook', hookEvent, exitCode: exitCode ?? null, output: output ?? `${stdout ?? ''}${stderr ?? ''}` }];
}

function translatePermissionDenied(value: unknown): readonly AgentRunEvent[] | null {
  const parsed = PermissionDeniedSchema.safeParse(value);
  if (!parsed.success) {
    return NOT_UNDERSTOOD;
  }
  return [{ kind: 'permission-denied', toolName: parsed.data.tool_name, message: parsed.data.message }];
}

function translateAssistant(value: unknown): readonly AgentRunEvent[] | null {
  const parsed = AssistantSchema.safeParse(value);
  if (!parsed.success) {
    return NOT_UNDERSTOOD;
  }
  const parentToolUseId = parsed.data.parent_tool_use_id ?? null;
  const events = parsed.data.message.content.flatMap((block): readonly AgentRunEvent[] => {
    const text = TextBlockSchema.safeParse(block);
    if (text.success) {
      return [{ kind: 'assistant-text', text: text.data.text, parentToolUseId }];
    }
    const toolUse = ToolUseBlockSchema.safeParse(block);
    if (toolUse.success) {
      const { id, name, input } = toolUse.data;
      return [{ kind: 'tool-call', toolUseId: id, toolName: name, input, parentToolUseId }];
    }
    return NO_EVENTS;
  });
  const onlyThinking = parsed.data.message.content.every((block) => ThinkingBlockSchema.safeParse(block).success);
  return events.length === 0 && !onlyThinking ? NOT_UNDERSTOOD : events;
}

function translateUser(value: unknown): readonly AgentRunEvent[] | null {
  const parsed = UserSchema.safeParse(value);
  if (!parsed.success || typeof parsed.data.message.content === 'string') {
    return NOT_UNDERSTOOD;
  }
  const events = parsed.data.message.content.flatMap((block): readonly AgentRunEvent[] => {
    const toolResult = ToolResultBlockSchema.safeParse(block);
    if (!toolResult.success) {
      return NO_EVENTS;
    }
    const { tool_use_id: toolUseId, is_error: isError, content } = toolResult.data;
    return [{ kind: 'tool-result', toolUseId, isError: isError ?? false, content: flattenToolResult(content) }];
  });
  return events.length === 0 ? NOT_UNDERSTOOD : events;
}

function flattenToolResult(content: string | readonly { type: string; text?: string | undefined }[] | undefined): string {
  if (content === undefined || typeof content === 'string') {
    return content ?? '';
  }
  return content.map((part) => part.text ?? `[${part.type}]`).join('\n');
}

function translateRateLimit(value: unknown): readonly AgentRunEvent[] | null {
  const parsed = RateLimitEventSchema.safeParse(value);
  const windows = parsed.success ? parsed.data.rate_limit_info.unifiedWindows : undefined;
  if (windows === undefined) {
    return NOT_UNDERSTOOD;
  }
  const snapshots = RATE_LIMIT_WINDOWS.flatMap((window): readonly RateLimitSnapshot[] => {
    const usage = windows[window];
    return usage === undefined
      ? []
      : [{ window, utilization: usage.utilization, resetsAt: new Date(usage.resetsAt * MILLISECONDS_PER_SECOND) }];
  });
  return snapshots.length === 0 ? NOT_UNDERSTOOD : [{ kind: 'rate-limit', snapshots }];
}
