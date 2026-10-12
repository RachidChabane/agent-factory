import { describe, expect, it } from 'vitest';
import type { RunLogEvent, RunLogLine } from '../../contract/index.ts';
import type { RunLogView } from '../../data/run-log-store.ts';
import {
  buildSubagentTree,
  canonicalTaskStatus,
  countLogFilter,
  countLogFilters,
  filterLogEntries,
  gateHistory,
  gateStepMark,
  hookFailed,
  logPhase,
  rawLineOf,
  searchableText,
} from './run-log-model.ts';
import { entriesOfLines, entriesOfRun, FINISHED_RUN, LIVE_RUN, logViewOf, REVIEW_RUN, WAITING_RUN } from './run-test-support.ts';

const AT = '2026-10-12T09:00:00.000Z';
const LARGE_LOG_LINES = 50_000;
const LARGE_LOG_BUDGET_MS = 1_500;

function lineOf(index: number, event: RunLogEvent): RunLogLine {
  return { runId: 'run_000000', index, at: AT, event };
}

const indexes = (entries: readonly { readonly index: number }[]) => entries.map((entry) => entry.index);

describe('log filters', () => {
  const entries = entriesOfRun(FINISHED_RUN);

  it('counts the entries each filter keeps', () => {
    expect(countLogFilters(entries)).toEqual({ all: 33, text: 9, tools: 13, control: 10, errors: 5, noise: 1 });
    expect(countLogFilter(entries, 'text')).toBe(9);
  });

  it('keeps the noise out of the full log and under its own filter', () => {
    expect(filterLogEntries(entries, 'all', '').some((entry) => entry.kind === 'noise')).toBe(false);
    expect(filterLogEntries(entries, 'noise', '').map((entry) => entry.kind)).toEqual(['noise']);
  });

  it('keeps the tool calls and the background tasks under the tools filter, subagent calls included', () => {
    expect(indexes(filterLogEntries(entries, 'tools', ''))).toEqual([5, 8, 10, 11, 13, 19, 22, 24, 31, 36, 40, 42, 51]);
  });

  it('keeps hooks, notices, the gate, refusals and the subscription windows under the hooks and gate filter', () => {
    expect(indexes(filterLogEntries(entries, 'control', ''))).toEqual([4, 7, 21, 26, 30, 35, 47, 48, 53, 54]);
  });

  it('keeps what went wrong under the errors filter: a tool error, a failed gate, a failed hook, a refusal', () => {
    expect(indexes(filterLogEntries(entries, 'errors', ''))).toEqual([30, 31, 36, 47, 48]);
  });

  it('keeps the live run free of errors', () => {
    expect(countLogFilter(entriesOfRun(LIVE_RUN), 'errors')).toBe(0);
  });

  it('judges a hook by its exit code, and says nothing of one that reported none', () => {
    expect(hookFailed({ exitCode: 2 })).toBe(true);
    expect(hookFailed({ exitCode: 0 })).toBe(false);
    expect(hookFailed({ exitCode: null })).toBe(false);
  });
});

describe('log search', () => {
  const entries = entriesOfRun(FINISHED_RUN);

  it('looks in tool inputs and results, whatever the case', () => {
    expect(indexes(filterLogEntries(entries, 'all', 'PROMO-MESSAGES'))).toEqual([5, 19, 36, 40, 42]);
  });

  it('looks in the details of the gate and in the output of hooks', () => {
    expect(indexes(filterLogEntries(entries, 'all', 'fragment'))).toEqual([47, 48]);
  });

  it('combines the search with the filter', () => {
    expect(indexes(filterLogEntries(entries, 'errors', 'fragment'))).toEqual([47, 48]);
    expect(filterLogEntries(entries, 'text', 'fragment')).toEqual([]);
  });

  it('ignores blank search text', () => {
    expect(filterLogEntries(entries, 'all', '   ')).toHaveLength(33);
  });

  it('finds the result of a tool call once it arrives, not before', () => {
    const call = lineOf(0, { kind: 'tool-call', toolUseId: 't1', toolName: 'Bash', input: { command: 'pnpm test' }, parentToolUseId: null });
    const result = lineOf(1, { kind: 'tool-result', toolUseId: 't1', isError: false, content: 'ELEVEN tests passed' });
    const pending = entriesOfLines([call]);
    expect(filterLogEntries(pending, 'all', 'eleven')).toEqual([]);
    const answered = entriesOfLines([call, result]);
    expect(filterLogEntries(answered, 'all', 'eleven')).toHaveLength(1);
  });

  it('describes a noise line by its subtype, and a token stream by nothing', () => {
    const noise = entriesOfLines([
      lineOf(0, { kind: 'raw', line: '{"type":"system","subtype":"compact_boundary"}' }),
      lineOf(1, { kind: 'raw', line: '{"type":"stream_event","event":{}}' }),
    ]);
    expect(noise.map(searchableText)).toEqual(['compact_boundary', '']);
  });
});

describe('rawLineOf', () => {
  it('gives the source line of the system rows that keep one', () => {
    const entries = entriesOfRun(FINISHED_RUN);
    const hookStarted = entries.find((entry) => entry.kind === 'hook-started');
    const noise = entries.find((entry) => entry.kind === 'noise');
    expect(hookStarted === undefined ? null : rawLineOf(hookStarted)).toContain('"subtype":"hook_started"');
    expect(noise === undefined ? null : rawLineOf(noise)).toContain('"subtype":"init"');
  });

  it('gives none for the rows built from a typed event', () => {
    const entries = entriesOfRun(FINISHED_RUN);
    for (const kind of ['tool', 'text', 'gate', 'denied', 'session', 'rate-limit'] as const) {
      const entry = entries.find((candidate) => candidate.kind === kind);
      expect(entry === undefined ? 'missing' : rawLineOf(entry)).toBeNull();
    }
  });
});

describe('buildSubagentTree', () => {
  it('lists the subagents a run started with the calls they made and the last thing they said', () => {
    const [node, ...others] = buildSubagentTree(entriesOfRun(FINISHED_RUN));
    expect(others).toEqual([]);
    expect(node).toMatchObject({
      description: 'Find where a rejected promo code is turned into a message',
      agentType: 'Explore',
      status: 'done',
      toolCalls: 2,
      children: [],
    });
    expect(node?.lastText).toContain('An expired code and a code nobody issued');
    expect(node?.endedAt).not.toBeNull();
  });

  it('shows subagents that are still going as running, with no end', () => {
    const tree = buildSubagentTree(entriesOfRun(LIVE_RUN));
    expect(tree.map((node) => node.status)).toEqual(['running', 'running']);
    expect(tree.map((node) => node.toolCalls)).toEqual([2, 2]);
    expect(tree.every((node) => node.endedAt === null)).toBe(true);
    expect(tree[1]?.lastText).toBeNull();
  });

  it('is empty for a run that started none', () => {
    expect(buildSubagentTree(entriesOfRun(REVIEW_RUN))).toEqual([]);
  });

  it('nests a subagent started by another one and marks a failed one', () => {
    const entries = entriesOfLines([
      lineOf(0, { kind: 'tool-call', toolUseId: 'outer', toolName: 'Task', input: { description: 'Explore the repository', subagent_type: 'Explore' }, parentToolUseId: null }),
      lineOf(1, { kind: 'tool-call', toolUseId: 'inner', toolName: 'Agent', input: { description: 'Read the routes' }, parentToolUseId: 'outer' }),
      lineOf(2, { kind: 'tool-result', toolUseId: 'inner', isError: true, content: 'out of budget' }),
      lineOf(3, { kind: 'tool-result', toolUseId: 'outer', isError: false, content: 'done' }),
    ]);
    const [outer] = buildSubagentTree(entries);
    expect(outer).toMatchObject({ description: 'Explore the repository', status: 'done', toolCalls: 1 });
    expect(outer?.children).toHaveLength(1);
    expect(outer?.children[0]).toMatchObject({ description: 'Read the routes', agentType: 'Agent', status: 'failed' });
  });

  it('falls back on the tool name when a subagent call names neither a description nor a type', () => {
    const entries = entriesOfLines([lineOf(0, { kind: 'tool-call', toolUseId: 'bare', toolName: 'Task', input: {}, parentToolUseId: null })]);
    expect(buildSubagentTree(entries)[0]).toMatchObject({ description: 'Task', agentType: 'Task', status: 'running' });
  });
});

describe('gateHistory', () => {
  it('lists every pass of the gate in the order it ran', () => {
    expect(gateHistory(entriesOfRun(FINISHED_RUN)).map((gate) => gate.passed)).toEqual([false, true]);
    expect(gateHistory(entriesOfRun(WAITING_RUN)).map((gate) => gate.passed)).toEqual([false]);
    expect(gateHistory(entriesOfRun(LIVE_RUN))).toEqual([]);
  });
});

describe('logPhase', () => {
  const view = (status: RunLogView['status'], entryCount = 0): Pick<RunLogView, 'status' | 'entries'> => logViewOf(entriesOfRun(REVIEW_RUN).slice(0, entryCount), status);

  it('shows the lines as soon as there is one, even while more load or after a failure', () => {
    expect(logPhase(view('ready', 3), { live: false, recordedLines: 3 })).toBe('ready');
    expect(logPhase(view('loading', 3), { live: true, recordedLines: 3 })).toBe('ready');
    expect(logPhase(view('error', 3), { live: false, recordedLines: 3 })).toBe('ready');
  });

  it('waits while the first page of a log the run has is loading', () => {
    expect(logPhase(view('idle'), { live: false, recordedLines: 15 })).toBe('loading');
    expect(logPhase(view('loading'), { live: false, recordedLines: 15 })).toBe('loading');
    expect(logPhase(view('loading'), { live: true, recordedLines: 0 })).toBe('loading');
  });

  it('reports a failure to load when nothing was loaded', () => {
    expect(logPhase(view('error'), { live: false, recordedLines: 15 })).toBe('error');
  });

  it('says no log was recorded for a finished run that has none, without waiting for the page', () => {
    expect(logPhase(view('idle'), { live: false, recordedLines: 0 })).toBe('no-log');
    expect(logPhase(view('loading'), { live: false, recordedLines: 0 })).toBe('no-log');
    expect(logPhase(view('ready'), { live: false, recordedLines: 0 })).toBe('no-log');
  });

  it('says a live run has not written anything yet once its log is known to be empty', () => {
    expect(logPhase(view('ready'), { live: true, recordedLines: 0 })).toBe('waiting');
  });
});

describe('gateStepMark', () => {
  it('shows a passed step as a success, a failed one as a failure and a skipped one as idle', () => {
    expect(gateStepMark('passed')).toBe('success');
    expect(gateStepMark('failed')).toBe('failed');
    expect(gateStepMark('skipped')).toBe('idle');
  });
});

describe('canonicalTaskStatus', () => {
  it('gives a killed task the name of a stopped one and leaves other statuses as they are', () => {
    expect(canonicalTaskStatus('killed')).toBe('stopped');
    expect(canonicalTaskStatus('failed')).toBe('failed');
    expect(canonicalTaskStatus('constructor')).toBe('constructor');
  });
});

describe('a log of 50 000 lines', () => {
  const lines = Array.from({ length: LARGE_LOG_LINES }, (_, index) => lineOf(index, { kind: 'assistant-text', text: `line ${index}`, parentToolUseId: null }));
  const entries = entriesOfLines(lines);

  it('is filtered, searched and counted quickly', () => {
    const started = performance.now();
    expect(countLogFilters(entries).text).toBe(LARGE_LOG_LINES);
    expect(filterLogEntries(entries, 'text', 'line 4999')).toHaveLength(11);
    expect(performance.now() - started).toBeLessThan(LARGE_LOG_BUDGET_MS);
  });

  it('is read for its subagents quickly', () => {
    const started = performance.now();
    expect(buildSubagentTree(entries)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(LARGE_LOG_BUDGET_MS);
  });
});
