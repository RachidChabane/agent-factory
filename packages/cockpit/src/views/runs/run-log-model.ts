import { SUBAGENT_TOOL_NAMES } from '../../contract/index.ts';
import type { LogEntry } from '../../data/run-log-entries.ts';
import { formatToolInput } from '../../model/tool-call.ts';

export const LOG_FILTERS = ['all', 'text', 'tools', 'control', 'errors', 'noise'] as const;
export type LogFilter = (typeof LOG_FILTERS)[number];

export const LOG_FILTER_LABELS: Readonly<Record<LogFilter, string>> = {
  all: 'Tout',
  text: 'Texte',
  tools: 'Outils',
  control: 'Hooks & gate',
  errors: 'Erreurs',
  noise: 'Bruit',
};

const FAILED_TASK_STATUS = 'failed';

const FILTER_PREDICATES: Readonly<Record<LogFilter, (entry: LogEntry) => boolean>> = {
  all: (entry) => entry.kind !== 'noise',
  text: (entry) => entry.kind === 'text',
  tools: (entry) => entry.kind === 'tool' || entry.kind === 'task',
  control: (entry) => entry.kind === 'hook' || entry.kind === 'hook-started' || entry.kind === 'notice' || entry.kind === 'gate' || entry.kind === 'denied' || entry.kind === 'rate-limit',
  errors: (entry) =>
    (entry.kind === 'tool' && entry.result?.isError === true) ||
    (entry.kind === 'gate' && !entry.passed) ||
    (entry.kind === 'hook' && entry.exitCode !== null && entry.exitCode !== 0) ||
    (entry.kind === 'task' && entry.status === FAILED_TASK_STATUS) ||
    entry.kind === 'denied',
  noise: (entry) => entry.kind === 'noise',
};

function searchableText(entry: LogEntry): string {
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
      return entry.label;
    case 'gate':
      return entry.steps.map((step) => `${step.name} ${step.detail}`).join(' ');
    case 'rate-limit':
      return '';
    case 'raw':
      return entry.line;
  }
}

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
  const needle = query.trim().toLocaleLowerCase('fr-FR');
  const predicate = FILTER_PREDICATES[filter];
  return entries.filter(
    (entry) => predicate(entry) && (needle.length === 0 || searchableText(entry).toLocaleLowerCase('fr-FR').includes(needle)),
  );
}

export function countLogFilter(entries: readonly LogEntry[], filter: LogFilter): number {
  return entries.filter(FILTER_PREDICATES[filter]).length;
}

export interface SubagentNode {
  readonly toolUseId: string;
  readonly description: string;
  readonly agentType: string;
  readonly status: 'running' | 'done' | 'failed';
  readonly toolCalls: number;
  readonly lastText: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly children: readonly SubagentNode[];
}

type DescriptionKey = 'description' | 'subagent_type';

function readHint(input: unknown, key: DescriptionKey): string | null {
  if (typeof input !== 'object' || input === null || !(key in input)) return null;
  const value: unknown = Reflect.get(input, key);
  return typeof value === 'string' ? value : null;
}

export function buildSubagentTree(entries: readonly LogEntry[]): readonly SubagentNode[] {
  const build = (parent: string | null): readonly SubagentNode[] =>
    entries
      .filter((entry): entry is Extract<LogEntry, { kind: 'tool' }> => entry.kind === 'tool' && entry.parentToolUseId === parent && SUBAGENT_TOOL_NAMES.includes(entry.toolName))
      .map((entry) => {
        const own = entries.filter((candidate) => 'parentToolUseId' in candidate && candidate.parentToolUseId === entry.toolUseId);
        const texts = own.filter((candidate): candidate is Extract<LogEntry, { kind: 'text' }> => candidate.kind === 'text');
        return {
          toolUseId: entry.toolUseId,
          description: readHint(entry.input, 'description') ?? entry.summary,
          agentType: readHint(entry.input, 'subagent_type') ?? entry.toolName,
          status: entry.result === null ? 'running' : entry.result.isError ? 'failed' : 'done',
          toolCalls: own.filter((candidate) => candidate.kind === 'tool').length,
          lastText: texts.at(-1)?.text ?? null,
          startedAt: entry.at,
          endedAt: entry.result?.at ?? null,
          children: build(entry.toolUseId),
        };
      });
  return build(null);
}

export function latestGate(entries: readonly LogEntry[]): Extract<LogEntry, { kind: 'gate' }> | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.kind === 'gate') return entry;
  }
  return null;
}

export function gateHistory(entries: readonly LogEntry[]): readonly Extract<LogEntry, { kind: 'gate' }>[] {
  return entries.filter((entry): entry is Extract<LogEntry, { kind: 'gate' }> => entry.kind === 'gate');
}
