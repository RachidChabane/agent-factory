import { isRecord, type JsonRecord } from '../json/json-reader.ts';

export const BLOCKING_EXIT_CODE = 2;
export const SUCCESS_EXIT_CODE = 0;

const PERMISSION_DENY = 'deny';
const STOP_BLOCK = 'block';
const DEFAULT_DENIAL_REASON = 'The tool call was blocked by a PreToolUse hook.';
const DEFAULT_BLOCK_REASON = 'The Stop hook blocked the stop without giving a reason.';

export interface HookExecution {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export type ToolDecision = { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

export type StopDecision = { readonly blocked: false } | { readonly blocked: true; readonly reason: string };

export const TOOL_ALLOWED: ToolDecision = { allowed: true };
export const STOP_ALLOWED: StopDecision = { blocked: false };

export function toolDecisionOf(execution: HookExecution): ToolDecision {
  const jsonReason = jsonDenialReasonOf(execution.stdout);
  if (jsonReason === null && execution.exitCode !== BLOCKING_EXIT_CODE) {
    return TOOL_ALLOWED;
  }
  return { allowed: false, reason: reasonOf(execution, jsonReason, DEFAULT_DENIAL_REASON) };
}

export function stopDecisionOf(execution: HookExecution): StopDecision {
  const jsonReason = jsonBlockReasonOf(execution.stdout);
  if (jsonReason === null && execution.exitCode !== BLOCKING_EXIT_CODE) {
    return STOP_ALLOWED;
  }
  return { blocked: true, reason: reasonOf(execution, jsonReason, DEFAULT_BLOCK_REASON) };
}

export function hookOutcomeOf(execution: HookExecution): 'success' | 'error' {
  return execution.exitCode === SUCCESS_EXIT_CODE ? 'success' : 'error';
}

export function hookOutputOf(execution: HookExecution): string {
  return `${execution.stdout}${execution.stderr}`;
}

function reasonOf(execution: HookExecution, jsonReason: string | null, fallback: string): string {
  const stderrReason = execution.exitCode === BLOCKING_EXIT_CODE ? execution.stderr.trim() : '';
  return [stderrReason, jsonReason ?? '', fallback].find((reason) => reason !== '') ?? fallback;
}

function jsonDenialReasonOf(stdout: string): string | null {
  const specific = recordAt(parseJsonObject(stdout), 'hookSpecificOutput');
  if (specific?.['permissionDecision'] !== PERMISSION_DENY) {
    return null;
  }
  const reason = specific['permissionDecisionReason'];
  return typeof reason === 'string' ? reason.trim() : '';
}

function jsonBlockReasonOf(stdout: string): string | null {
  const output = parseJsonObject(stdout);
  const reason = output?.['reason'];
  return output?.['decision'] === STOP_BLOCK && typeof reason === 'string' ? reason.trim() : null;
}

function parseJsonObject(text: string): JsonRecord | null {
  try {
    const parsed: unknown = JSON.parse(text.trim());
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function recordAt(record: JsonRecord | null, key: string): JsonRecord | null {
  const value = record?.[key];
  return isRecord(value) ? value : null;
}
