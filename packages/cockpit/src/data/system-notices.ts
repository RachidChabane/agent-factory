import { z } from 'zod';

const SYSTEM_TYPE = 'system';
const STREAM_EVENT_TYPE = 'stream_event';
const FAILED_HOOK_EXIT_CODE = 1;
const FAILED_HOOK_OUTCOME = 'error';
const SYSTEM_NOISE_PREFIX = 'système';
const STREAM_NOISE_LABEL = 'flux de jetons';
const NOISE_SEPARATOR = ' · ';

const HookStartedSchema = z.object({
  type: z.literal(SYSTEM_TYPE),
  subtype: z.literal('hook_started'),
  hook_name: z.string(),
  hook_event: z.string(),
});

const HookResponseSchema = z.object({
  type: z.literal(SYSTEM_TYPE),
  subtype: z.literal('hook_response'),
  hook_name: z.string(),
  hook_event: z.string(),
  exit_code: z.number().int().nullish(),
  outcome: z.string().nullish(),
  output: z.string().nullish(),
  stdout: z.string().nullish(),
  stderr: z.string().nullish(),
});

const TaskStartedSchema = z.object({
  type: z.literal(SYSTEM_TYPE),
  subtype: z.literal('task_started'),
  description: z.string(),
  task_type: z.string().nullish(),
});

const TaskNotificationSchema = z.object({
  type: z.literal(SYSTEM_TYPE),
  subtype: z.literal('task_notification'),
  status: z.string(),
  summary: z.string(),
});

const NotificationSchema = z.object({
  type: z.literal(SYSTEM_TYPE),
  subtype: z.literal('notification'),
  text: z.string(),
});

const SystemEnvelopeSchema = z.object({ type: z.literal(SYSTEM_TYPE), subtype: z.string() });
const StreamEnvelopeSchema = z.object({ type: z.literal(STREAM_EVENT_TYPE) });

export type SystemNotice =
  | { readonly kind: 'hook-started'; readonly hookName: string; readonly hookEvent: string }
  | { readonly kind: 'hook-response'; readonly hookName: string; readonly hookEvent: string; readonly exitCode: number | null; readonly output: string }
  | { readonly kind: 'task'; readonly phase: 'started' | 'finished'; readonly description: string; readonly status: string | null }
  | { readonly kind: 'notice'; readonly text: string }
  | { readonly kind: 'noise'; readonly label: string };

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function hookExitCode(exitCode: number | null | undefined, outcome: string | null | undefined): number | null {
  if (exitCode !== null && exitCode !== undefined) return exitCode;
  return outcome === FAILED_HOOK_OUTCOME ? FAILED_HOOK_EXIT_CODE : null;
}

function noticeOf(value: unknown): SystemNotice | null {
  const hookStarted = HookStartedSchema.safeParse(value);
  if (hookStarted.success) return { kind: 'hook-started', hookName: hookStarted.data.hook_name, hookEvent: hookStarted.data.hook_event };
  const hookResponse = HookResponseSchema.safeParse(value);
  if (hookResponse.success) {
    const { hook_name: hookName, hook_event: hookEvent, exit_code: exitCode, outcome, output, stdout, stderr } = hookResponse.data;
    return { kind: 'hook-response', hookName, hookEvent, exitCode: hookExitCode(exitCode, outcome), output: output ?? `${stdout ?? ''}${stderr ?? ''}` };
  }
  const taskStarted = TaskStartedSchema.safeParse(value);
  if (taskStarted.success) return { kind: 'task', phase: 'started', description: taskStarted.data.description, status: null };
  const taskNotification = TaskNotificationSchema.safeParse(value);
  if (taskNotification.success) return { kind: 'task', phase: 'finished', description: taskNotification.data.summary, status: taskNotification.data.status };
  const notification = NotificationSchema.safeParse(value);
  if (notification.success) return { kind: 'notice', text: notification.data.text };
  return null;
}

export function parseSystemNotice(line: string): SystemNotice | null {
  const value = parseJson(line);
  const known = noticeOf(value);
  if (known !== null) return known;
  const system = SystemEnvelopeSchema.safeParse(value);
  if (system.success) return { kind: 'noise', label: `${SYSTEM_NOISE_PREFIX}${NOISE_SEPARATOR}${system.data.subtype}` };
  return StreamEnvelopeSchema.safeParse(value).success ? { kind: 'noise', label: STREAM_NOISE_LABEL } : null;
}
