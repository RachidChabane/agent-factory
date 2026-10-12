import type { CockpitSnapshot, RunLogLine, RunView } from '../contract/index.ts';
import { SUBAGENT_TOOL_NAMES } from '../contract/index.ts';
import { firstProseLine, toolCallSummary, toolInputHints, truncate } from '../model/tool-call.ts';

const LAST_LINE_MAX_LENGTH = 200;
const GATE_PASSED_LINE = 'gate ✓';
const GATE_FAILED_LINE = 'gate ✗';

function gateLine(passed: boolean, steps: readonly { outcome: string }[]): string {
  const passedCount = steps.filter((step) => step.outcome === 'passed').length;
  return `${passed ? GATE_PASSED_LINE : GATE_FAILED_LINE} ${passedCount}/${steps.length}`;
}

function foldLine(run: RunView, line: RunLogLine): RunView {
  const base = { ...run, logLength: Math.max(run.logLength, line.index + 1) };
  const event = line.event;
  switch (event.kind) {
    case 'assistant-text': {
      const text = firstProseLine(event.text);
      return text.length === 0 ? base : { ...base, lastLine: truncate(text, LAST_LINE_MAX_LENGTH) };
    }
    case 'tool-call': {
      const next = { ...base, currentTool: event.toolName, lastLine: toolCallSummary(event.toolName, event.input) };
      if (!SUBAGENT_TOOL_NAMES.includes(event.toolName)) return next;
      const hints = toolInputHints(event.input);
      const subagent = {
        toolUseId: event.toolUseId,
        description: hints.primary ?? event.toolName,
        agentType: hints.subagentType ?? event.toolName,
        status: 'running' as const,
      };
      return { ...next, subagents: [...base.subagents.filter((entry) => entry.toolUseId !== event.toolUseId), subagent] };
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

export function foldRunLogLines(run: RunView, lines: readonly RunLogLine[]): RunView {
  return lines.reduce(foldLine, run);
}

export function applyRunLogLines(snapshot: CockpitSnapshot, lines: readonly RunLogLine[]): CockpitSnapshot {
  if (lines.length === 0) return snapshot;
  const byRun = new Map<string, RunLogLine[]>();
  for (const line of lines) {
    const bucket = byRun.get(line.runId);
    if (bucket === undefined) byRun.set(line.runId, [line]);
    else bucket.push(line);
  }
  let changed = false;
  const runs = snapshot.runs.map((run) => {
    const bucket = byRun.get(run.id);
    if (bucket === undefined) return run;
    changed = true;
    return foldRunLogLines(run, bucket);
  });
  return changed ? { ...snapshot, runs } : snapshot;
}
