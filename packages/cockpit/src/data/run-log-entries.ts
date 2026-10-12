import type { GateStepView, RunLogLine, SubscriptionWindowView } from '../contract/index.ts';
import { toolCallSummary } from '../model/tool-call.ts';
import { parseSystemNotice, type SystemNotice } from './system-notices.ts';

export interface ToolResultEntry {
  readonly isError: boolean;
  readonly content: string;
  readonly at: string;
}

interface EntryBase {
  readonly index: number;
  readonly at: string;
}

export type LogEntry =
  | (EntryBase & { readonly kind: 'session'; readonly model: string; readonly sessionId: string })
  | (EntryBase & { readonly kind: 'text'; readonly text: string; readonly parentToolUseId: string | null })
  | (EntryBase & {
      readonly kind: 'tool';
      readonly toolUseId: string;
      readonly toolName: string;
      readonly input: unknown;
      readonly summary: string;
      readonly parentToolUseId: string | null;
      readonly result: ToolResultEntry | null;
    })
  | (EntryBase & { readonly kind: 'denied'; readonly toolName: string; readonly message: string })
  | (EntryBase & { readonly kind: 'hook'; readonly hookName: string | null; readonly hookEvent: string; readonly exitCode: number | null; readonly output: string; readonly line: string | null })
  | (EntryBase & { readonly kind: 'hook-started'; readonly hookName: string; readonly hookEvent: string; readonly line: string })
  | (EntryBase & { readonly kind: 'task'; readonly phase: 'started' | 'finished'; readonly description: string; readonly status: string | null; readonly line: string })
  | (EntryBase & { readonly kind: 'notice'; readonly text: string; readonly line: string })
  | (EntryBase & { readonly kind: 'noise'; readonly label: string; readonly line: string })
  | (EntryBase & { readonly kind: 'gate'; readonly passed: boolean; readonly steps: readonly GateStepView[] })
  | (EntryBase & { readonly kind: 'rate-limit'; readonly snapshots: readonly SubscriptionWindowView[] })
  | (EntryBase & { readonly kind: 'raw'; readonly line: string });

export type LogEntryKind = LogEntry['kind'];

export class RunLogEntries {
  readonly entries: LogEntry[] = [];
  private readonly toolEntries = new Map<string, number>();

  append(line: RunLogLine): void {
    const base = { index: line.index, at: line.at };
    const event = line.event;
    switch (event.kind) {
      case 'session-started':
        this.entries.push({ ...base, kind: 'session', model: event.model, sessionId: event.sessionId });
        return;
      case 'assistant-text':
        this.entries.push({ ...base, kind: 'text', text: event.text, parentToolUseId: event.parentToolUseId });
        return;
      case 'tool-call':
        this.toolEntries.set(event.toolUseId, this.entries.length);
        this.entries.push({
          ...base,
          kind: 'tool',
          toolUseId: event.toolUseId,
          toolName: event.toolName,
          input: event.input,
          summary: toolCallSummary(event.toolName, event.input),
          parentToolUseId: event.parentToolUseId,
          result: null,
        });
        return;
      case 'tool-result':
        this.attachResult(event.toolUseId, { isError: event.isError, content: event.content, at: line.at }, line);
        return;
      case 'permission-denied':
        this.entries.push({ ...base, kind: 'denied', toolName: event.toolName, message: event.message });
        return;
      case 'hook':
        this.entries.push({ ...base, kind: 'hook', hookName: null, hookEvent: event.hookEvent, exitCode: event.exitCode, output: event.output, line: null });
        return;
      case 'gate':
        this.entries.push({ ...base, kind: 'gate', passed: event.passed, steps: event.steps });
        return;
      case 'rate-limit':
        this.entries.push({ ...base, kind: 'rate-limit', snapshots: event.snapshots });
        return;
      case 'raw':
        this.appendRaw(base, event.line);
        return;
      case 'usage':
      case 'progress':
        return;
    }
  }

  private appendRaw(base: { readonly index: number; readonly at: string }, line: string): void {
    const notice = parseSystemNotice(line);
    this.entries.push(notice === null ? { ...base, kind: 'raw', line } : noticeEntry(base, notice, line));
  }

  private attachResult(toolUseId: string, result: ToolResultEntry, line: RunLogLine): void {
    const position = this.toolEntries.get(toolUseId);
    const entry = position === undefined ? undefined : this.entries[position];
    if (position === undefined || entry === undefined || entry.kind !== 'tool') {
      this.entries.push({ index: line.index, at: line.at, kind: 'raw', line: result.content });
      return;
    }
    this.entries[position] = { ...entry, result };
  }
}

function noticeEntry(base: { readonly index: number; readonly at: string }, notice: SystemNotice, line: string): LogEntry {
  switch (notice.kind) {
    case 'hook-started':
      return { ...base, kind: 'hook-started', hookName: notice.hookName, hookEvent: notice.hookEvent, line };
    case 'hook-response':
      return { ...base, kind: 'hook', hookName: notice.hookName, hookEvent: notice.hookEvent, exitCode: notice.exitCode, output: notice.output, line };
    case 'task':
      return { ...base, kind: 'task', phase: notice.phase, description: notice.description, status: notice.status, line };
    case 'notice':
      return { ...base, kind: 'notice', text: notice.text, line };
    case 'noise':
      return { ...base, kind: 'noise', label: notice.label, line };
  }
}
