import type { RunLogLine, RunSubagent, RunView } from '../../contract/index.ts';
import { SUBAGENT_TOOL_NAMES } from '../../contract/index.ts';

const PRIMARY_HINT_KEYS = ['command', 'file_path', 'path', 'pattern', 'description', 'url', 'query', 'prompt'] as const;
const CODE_FENCE = '```';
const LAST_LINE_MAX_LENGTH = 200;
const TOOL_SUMMARY_MAX_LENGTH = 160;
const GATE_PASSED_MARK = 'gate ✓';
const GATE_FAILED_MARK = 'gate ✗';

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .map((candidate) => candidate.trim())
      .find((candidate) => candidate.length > 0) ?? ''
  );
}

function stringField(input: unknown, key: string): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const value: unknown = Reflect.get(input, key);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function primaryHint(input: unknown): string | null {
  for (const key of PRIMARY_HINT_KEYS) {
    const value = stringField(input, key);
    if (value !== null) return value;
  }
  return null;
}

function toolCallSummary(toolName: string, input: unknown): string {
  const primary = primaryHint(input);
  return primary === null ? toolName : `${toolName} · ${truncate(firstLine(primary), TOOL_SUMMARY_MAX_LENGTH)}`;
}

export type FoldedLog = Pick<RunView, 'lastLine' | 'currentTool' | 'subagents' | 'usage' | 'costUsd' | 'turns' | 'logLength'>;

const EMPTY_FOLD: FoldedLog = {
  lastLine: null,
  currentTool: null,
  subagents: [],
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
  costUsd: 0,
  turns: 0,
  logLength: 0,
};

function gateLine(passed: boolean, steps: readonly { readonly outcome: string }[]): string {
  const passedCount = steps.filter((step) => step.outcome === 'passed').length;
  return `${passed ? GATE_PASSED_MARK : GATE_FAILED_MARK} ${passedCount}/${steps.length}`;
}

function withSubagent(subagents: readonly RunSubagent[], entry: RunSubagent): RunSubagent[] {
  return [...subagents.filter((existing) => existing.toolUseId !== entry.toolUseId), entry];
}

function foldLine(state: FoldedLog, line: RunLogLine): FoldedLog {
  const base = { ...state, logLength: Math.max(state.logLength, line.index + 1) };
  const event = line.event;
  switch (event.kind) {
    case 'assistant-text': {
      const text = event.text.trimStart().startsWith(CODE_FENCE) ? '' : firstLine(event.text);
      return text.length === 0 ? base : { ...base, lastLine: truncate(text, LAST_LINE_MAX_LENGTH) };
    }
    case 'tool-call': {
      const next = { ...base, currentTool: event.toolName, lastLine: toolCallSummary(event.toolName, event.input) };
      if (!SUBAGENT_TOOL_NAMES.includes(event.toolName)) return next;
      const subagent: RunSubagent = {
        toolUseId: event.toolUseId,
        description: primaryHint(event.input) ?? event.toolName,
        agentType: stringField(event.input, 'subagent_type') ?? event.toolName,
        status: 'running',
      };
      return { ...next, subagents: withSubagent(base.subagents, subagent) };
    }
    case 'tool-result': {
      const subagents = base.subagents.map((entry) =>
        entry.toolUseId === event.toolUseId ? { ...entry, status: event.isError ? ('failed' as const) : ('done' as const) } : entry,
      );
      return { ...base, currentTool: null, subagents };
    }
    case 'usage':
      return { ...base, usage: event.usage, costUsd: event.costUsd, turns: event.turns };
    case 'progress':
      return { ...base, usage: event.usage, turns: event.turns };
    case 'gate':
      return { ...base, lastLine: gateLine(event.passed, event.steps) };
    case 'session-started':
    case 'permission-denied':
    case 'hook':
    case 'rate-limit':
    case 'raw':
      return base;
  }
}

/** What the cockpit shows of a run, folded from its log in the order the lines arrive. */
export function foldLog(lines: readonly RunLogLine[]): FoldedLog {
  return lines.reduce(foldLine, EMPTY_FOLD);
}
