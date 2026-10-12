import { z } from 'zod';

export const STOP_HOOK_EVENT = 'Stop';
export const PRE_TOOL_USE_HOOK_EVENT = 'PreToolUse';

export const StopHookPayloadSchema = z.object({
  session_id: z.string(),
  hook_event_name: z.literal(STOP_HOOK_EVENT),
  stop_hook_active: z.boolean(),
  prompt_id: z.string().optional(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  permission_mode: z.string().optional(),
  effort: z.object({ level: z.string() }).optional(),
  last_assistant_message: z.string().optional(),
  background_tasks: z.array(z.unknown()).optional(),
  session_crons: z.array(z.unknown()).optional(),
});

export type StopHookPayload = z.infer<typeof StopHookPayloadSchema>;

export const PreToolUseHookPayloadSchema = z.object({
  hook_event_name: z.literal(PRE_TOOL_USE_HOOK_EVENT),
  tool_name: z.string(),
  tool_input: z.object({
    file_path: z.string().optional(),
    notebook_path: z.string().optional(),
  }),
  session_id: z.string().optional(),
  cwd: z.string().optional(),
});

export type PreToolUseHookPayload = z.infer<typeof PreToolUseHookPayloadSchema>;

export const BLOCKING_HOOK_EXIT_CODE = 2;

export const StopHookBlockOutputSchema = z.object({
  decision: z.literal('block'),
  reason: z.string(),
});

export type StopHookBlockOutput = z.infer<typeof StopHookBlockOutputSchema>;

export function isStopBlock(exitCode: number | null, output: string): boolean {
  if (exitCode === BLOCKING_HOOK_EXIT_CODE) {
    return true;
  }
  try {
    return StopHookBlockOutputSchema.safeParse(JSON.parse(output.trim())).success;
  } catch {
    return false;
  }
}

export interface PreToolUseDenyOutput {
  readonly hookSpecificOutput: {
    readonly hookEventName: typeof PRE_TOOL_USE_HOOK_EVENT;
    readonly permissionDecision: 'deny';
    readonly permissionDecisionReason: string;
  };
}

export function stopHookBlock(reason: string): StopHookBlockOutput {
  return { decision: 'block', reason };
}

export function preToolUseDeny(reason: string): PreToolUseDenyOutput {
  return {
    hookSpecificOutput: {
      hookEventName: PRE_TOOL_USE_HOOK_EVENT,
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}
