import type { GateStepOutcome } from '@agent-factory/domain';
import type { SubagentStatus } from '../../contract/index.ts';
import { SUBAGENT_TOOL_NAMES } from '../../contract/index.ts';
import type { LogEntry } from '../../data/run-log-entries.ts';
import type { RunLogView } from '../../data/run-log-store.ts';
import type { StatusMark } from '../../model/status.ts';
import { formatToolInput, toolInputHints } from '../../model/tool-call.ts';

export type ToolEntry = Extract<LogEntry, { kind: 'tool' }>;
export type TextEntry = Extract<LogEntry, { kind: 'text' }>;
export type GateEntry = Extract<LogEntry, { kind: 'gate' }>;
export type HookEntry = Extract<LogEntry, { kind: 'hook' }>;
export type TaskEntry = Extract<LogEntry, { kind: 'task' }>;

export const LOG_FILTERS = ['all', 'text', 'tools', 'control', 'errors', 'noise'] as const;
export type LogFilter = (typeof LOG_FILTERS)[number];

const SUCCESS_EXIT_CODE = 0;
const FAILED_TASK_STATUS = 'failed';

/** A hook that reported an exit code other than zero failed; one that reported none says nothing either way. */
export function hookFailed(entry: Pick<HookEntry, 'exitCode'>): boolean {
  return entry.exitCode !== null && entry.exitCode !== SUCCESS_EXIT_CODE;
}

export function toolFailed(entry: ToolEntry): boolean {
  return entry.result?.isError === true;
}

const FILTER_PREDICATES: Readonly<Record<LogFilter, (entry: LogEntry) => boolean>> = {
  all: (entry) => entry.kind !== 'noise',
  text: (entry) => entry.kind === 'text',
  tools: (entry) => entry.kind === 'tool' || entry.kind === 'task',
  control: (entry) =>
    entry.kind === 'hook' || entry.kind === 'hook-started' || entry.kind === 'notice' || entry.kind === 'gate' || entry.kind === 'denied' || entry.kind === 'rate-limit',
  errors: (entry) =>
    (entry.kind === 'tool' && toolFailed(entry)) ||
    (entry.kind === 'gate' && !entry.passed) ||
    (entry.kind === 'hook' && hookFailed(entry)) ||
    (entry.kind === 'task' && entry.status === FAILED_TASK_STATUS) ||
    entry.kind === 'denied',
  noise: (entry) => entry.kind === 'noise',
};

function searchableTextOf(entry: LogEntry): string {
  switch (entry.kind) {
    case 'session':
      return entry.model;
    case 'text':
      return entry.text;
    case 'tool':
      return `${entry.toolName} ${formatToolInput(entry.input)} ${entry.result?.content ?? ''}`;
    case 'denied':
      return `${entry.toolName} ${entry.message}`;
    case 'hook':
      return `${entry.hookName ?? ''} ${entry.hookEvent} ${entry.output}`;
    case 'hook-started':
      return `${entry.hookName} ${entry.hookEvent}`;
    case 'task':
      return `${entry.description} ${entry.status ?? ''}`;
    case 'notice':
      return entry.text;
    case 'noise':
      return entry.subtype ?? '';
    case 'gate':
      return entry.steps.map((step) => `${step.name} ${step.detail}`).join(' ');
    case 'rate-limit':
      return '';
    case 'raw':
      return entry.line;
  }
}

/** Entries are replaced, never edited, when a tool result arrives, so their text can be kept per entry. */
const SEARCH_TEXT_CACHE = new WeakMap<LogEntry, string>();

export function searchableText(entry: LogEntry): string {
  const cached = SEARCH_TEXT_CACHE.get(entry);
  if (cached !== undefined) return cached;
  const text = searchableTextOf(entry).toLowerCase();
  SEARCH_TEXT_CACHE.set(entry, text);
  return text;
}

/** The line a system row was parsed from, for the rows that keep one. */
export function rawLineOf(entry: LogEntry): string | null {
  switch (entry.kind) {
    case 'hook':
    case 'hook-started':
    case 'task':
    case 'notice':
    case 'noise':
    case 'raw':
      return entry.line;
    default:
      return null;
  }
}

export function filterLogEntries(entries: readonly LogEntry[], filter: LogFilter, query: string): readonly LogEntry[] {
  const needle = query.trim().toLowerCase();
  const predicate = FILTER_PREDICATES[filter];
  return entries.filter((entry) => predicate(entry) && (needle.length === 0 || searchableText(entry).includes(needle)));
}

export function countLogFilter(entries: readonly LogEntry[], filter: LogFilter): number {
  return entries.filter(FILTER_PREDICATES[filter]).length;
}

export type LogFilterCounts = Readonly<Record<LogFilter, number>>;

export function countLogFilters(entries: readonly LogEntry[]): LogFilterCounts {
  return {
    all: countLogFilter(entries, 'all'),
    text: countLogFilter(entries, 'text'),
    tools: countLogFilter(entries, 'tools'),
    control: countLogFilter(entries, 'control'),
    errors: countLogFilter(entries, 'errors'),
    noise: countLogFilter(entries, 'noise'),
  };
}

export type LogPhase = 'loading' | 'error' | 'no-log' | 'waiting' | 'ready';

export interface LogContext {
  /** Whether the agent can still write to the log. */
  readonly live: boolean;
  /** How many lines the factory says the run logged. */
  readonly recordedLines: number;
}

/** What the log panel shows: lines, or the reason there are none (still loading, failed, nothing recorded, nothing yet). */
export function logPhase(log: Pick<RunLogView, 'status' | 'entries'>, context: LogContext): LogPhase {
  if (log.entries.length > 0) return 'ready';
  if (log.status === 'error') return 'error';
  if (log.status === 'ready') return context.live ? 'waiting' : 'no-log';
  return !context.live && context.recordedLines === 0 ? 'no-log' : 'loading';
}

export interface SubagentNode {
  readonly toolUseId: string;
  readonly description: string;
  readonly agentType: string;
  readonly status: SubagentStatus;
  readonly toolCalls: number;
  readonly lastText: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly children: readonly SubagentNode[];
}

function subagentStatus(entry: ToolEntry): SubagentStatus {
  if (entry.result === null) return 'running';
  return entry.result.isError ? 'failed' : 'done';
}

function parentOf(entry: LogEntry): string | null {
  return 'parentToolUseId' in entry ? entry.parentToolUseId : null;
}

/** The subagents of a run as a tree: each one with the tool calls and the last words of the agent it started. */
export function buildSubagentTree(entries: readonly LogEntry[]): readonly SubagentNode[] {
  const byParent = new Map<string | null, LogEntry[]>();
  for (const entry of entries) {
    const parent = parentOf(entry);
    const siblings = byParent.get(parent);
    if (siblings === undefined) byParent.set(parent, [entry]);
    else siblings.push(entry);
  }
  const build = (parent: string | null): readonly SubagentNode[] =>
    (byParent.get(parent) ?? [])
      .filter((entry): entry is ToolEntry => entry.kind === 'tool' && SUBAGENT_TOOL_NAMES.includes(entry.toolName))
      .map((entry) => {
        const own = byParent.get(entry.toolUseId) ?? [];
        const hints = toolInputHints(entry.input);
        return {
          toolUseId: entry.toolUseId,
          description: hints.primary ?? entry.toolName,
          agentType: hints.subagentType ?? entry.toolName,
          status: subagentStatus(entry),
          toolCalls: own.filter((candidate) => candidate.kind === 'tool').length,
          lastText: own.findLast((candidate): candidate is TextEntry => candidate.kind === 'text')?.text ?? null,
          startedAt: entry.at,
          endedAt: entry.result?.at ?? null,
          children: build(entry.toolUseId),
        };
      });
  return build(null);
}

export function gateHistory(entries: readonly LogEntry[]): readonly GateEntry[] {
  return entries.filter((entry): entry is GateEntry => entry.kind === 'gate');
}

const GATE_STEP_MARKS: Readonly<Record<GateStepOutcome, StatusMark>> = { passed: 'success', failed: 'failed', skipped: 'idle' };

export function gateStepMark(outcome: GateStepOutcome): StatusMark {
  return GATE_STEP_MARKS[outcome];
}

/** The statuses of a background task that mean the same thing under two names. */
const TASK_STATUS_ALIASES: ReadonlyMap<string, string> = new Map([['killed', 'stopped']]);

export function canonicalTaskStatus(status: string): string {
  return TASK_STATUS_ALIASES.get(status) ?? status;
}
