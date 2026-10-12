import { dig, digString, parseJsonLines, type JsonObject } from './json-navigation.ts';
import type { Sandbox } from './sandbox.ts';
import { readFileSync } from 'node:fs';

export interface HookSpec {
  readonly matcher?: string;
  readonly command: string;
  readonly timeout?: number;
}

export interface HookSettings {
  readonly preToolUse?: readonly HookSpec[];
  readonly stop?: readonly HookSpec[];
}

function groupOf(spec: HookSpec): object {
  return {
    ...(spec.matcher === undefined ? {} : { matcher: spec.matcher }),
    hooks: [{ type: 'command', command: spec.command, ...(spec.timeout === undefined ? {} : { timeout: spec.timeout }) }],
  };
}

export async function writeSettings(sandbox: Sandbox, hooks: HookSettings): Promise<string> {
  const settings = {
    permissions: { allow: ['Read', 'Write'], deny: [] },
    hooks: {
      ...(hooks.preToolUse === undefined ? {} : { PreToolUse: hooks.preToolUse.map(groupOf) }),
      ...(hooks.stop === undefined ? {} : { Stop: hooks.stop.map(groupOf) }),
    },
  };
  return sandbox.writeText('settings.json', JSON.stringify(settings, null, 2));
}

/** A hook that appends the payload it receives to `payloadLog`, then runs `decision` (shell). */
export async function writeRecordingHook(sandbox: Sandbox, name: string, payloadLog: string, decision: string): Promise<string> {
  const script = await sandbox.writeScript(name, `cat >> '${payloadLog}'\n${decision}`);
  return `sh '${script}'`;
}

export function recordedPayloads(payloadLog: string): readonly JsonObject[] {
  return parseJsonLines(readFileSync(payloadLog, 'utf8'));
}

export const DENY_WRITE_OUTPUT =
  '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"this path is frozen"}}';
export const DENY_WRITE_DECISION = `printf '%s' '${DENY_WRITE_OUTPUT}'`;
export const BLOCK_STOP_DECISION = `printf '%s' '{"decision":"block","reason":"the gate is red"}'`;
export const EXIT_TWO_DECISION = `echo 'stderr says no' >&2; exit 2`;
export const ALLOW_DECISION = 'true';

export function payloadFieldsOf(payloads: readonly JsonObject[], ...path: readonly string[]): readonly unknown[] {
  return payloads.map((payload) => dig(payload, ...path));
}

export function hookNameOf(line: JsonObject): string {
  return digString(line, 'hook_name');
}
