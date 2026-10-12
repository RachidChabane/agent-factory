import { HOOK_EVENTS } from '../stream/stream-vocabulary.ts';

export interface HookContext {
  readonly sessionId: string;
  readonly transcriptPath: string;
  readonly workingDirectory: string;
  readonly permissionMode: string;
  readonly effort: string | null;
  readonly promptId: string;
}

export interface PendingToolCall {
  readonly toolName: string;
  readonly toolInput: Readonly<Record<string, unknown>>;
  readonly toolUseId: string;
}

export interface StopInquiry {
  readonly stopHookActive: boolean;
  readonly lastAssistantMessage: string;
}

type HookPayload = Readonly<Record<string, unknown>>;

function commonFields(context: HookContext): HookPayload {
  return {
    session_id: context.sessionId,
    transcript_path: context.transcriptPath,
    cwd: context.workingDirectory,
    permission_mode: context.permissionMode,
  };
}

export function preToolUsePayload(context: HookContext, call: PendingToolCall): HookPayload {
  return {
    ...commonFields(context),
    hook_event_name: HOOK_EVENTS.preToolUse,
    tool_name: call.toolName,
    tool_input: call.toolInput,
    tool_use_id: call.toolUseId,
  };
}

export function stopPayload(context: HookContext, inquiry: StopInquiry): HookPayload {
  return {
    ...commonFields(context),
    prompt_id: context.promptId,
    ...(context.effort === null ? {} : { effort: { level: context.effort } }),
    hook_event_name: HOOK_EVENTS.stop,
    stop_hook_active: inquiry.stopHookActive,
    last_assistant_message: inquiry.lastAssistantMessage,
    background_tasks: [],
    session_crons: [],
  };
}
