import { stampFields, type Stamp, type StreamLine } from './stream-line.ts';
import { LINE_TYPES, SYSTEM_SUBTYPES, type HookEventName } from './stream-vocabulary.ts';

export interface HookIdentity {
  readonly hookId: string;
  readonly hookName: string;
  readonly hookEvent: HookEventName;
}

export function hookStartedLine(stamp: Stamp, hook: HookIdentity): StreamLine {
  return {
    type: LINE_TYPES.system,
    subtype: SYSTEM_SUBTYPES.hookStarted,
    hook_id: hook.hookId,
    hook_name: hook.hookName,
    hook_event: hook.hookEvent,
    ...stampFields(stamp),
  };
}

export interface HookResponse {
  readonly output: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly outcome: string;
}

export function hookResponseLine(stamp: Stamp, hook: HookIdentity, response: HookResponse): StreamLine {
  return {
    type: LINE_TYPES.system,
    subtype: SYSTEM_SUBTYPES.hookResponse,
    hook_id: hook.hookId,
    hook_name: hook.hookName,
    hook_event: hook.hookEvent,
    output: response.output,
    stdout: response.stdout,
    stderr: response.stderr,
    exit_code: response.exitCode,
    outcome: response.outcome,
    ...stampFields(stamp),
  };
}
