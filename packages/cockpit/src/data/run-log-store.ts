import type { RunLogLine } from '../contract/index.ts';
import type { LogEntry } from './run-log-entries.ts';
import { RunLogEntries } from './run-log-entries.ts';

export const RUN_LOG_STATUSES = ['idle', 'loading', 'ready', 'error'] as const;
export type RunLogStatus = (typeof RUN_LOG_STATUSES)[number];

export interface RunLogView {
  readonly status: RunLogStatus;
  readonly version: number;
  readonly entries: readonly LogEntry[];
  readonly lineCount: number;
  readonly error: string | null;
}

export interface AppendResult {
  readonly appended: number;
  readonly gapFrom: number | null;
}

interface RunLogBuffer {
  status: RunLogStatus;
  version: number;
  nextIndex: number;
  error: string | null;
  readonly entries: RunLogEntries;
  view: RunLogView;
}

type Listener = () => void;

const IDLE_VIEW: RunLogView = { status: 'idle', version: 0, entries: [], lineCount: 0, error: null };

function freshBuffer(): RunLogBuffer {
  return { status: 'idle', version: 0, nextIndex: 0, error: null, entries: new RunLogEntries(), view: IDLE_VIEW };
}

export class RunLogStore {
  private readonly buffers = new Map<string, RunLogBuffer>();
  private readonly listeners = new Map<string, Set<Listener>>();

  readonly getView = (runId: string): RunLogView => this.buffers.get(runId)?.view ?? IDLE_VIEW;

  subscribe(runId: string, listener: Listener): () => void {
    const set = this.listeners.get(runId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(runId, set);
    return () => {
      set.delete(listener);
    };
  }

  isTracked(runId: string): boolean {
    const status = this.buffers.get(runId)?.status ?? 'idle';
    return status !== 'idle';
  }

  nextIndex(runId: string): number {
    return this.buffers.get(runId)?.nextIndex ?? 0;
  }

  markLoading(runId: string): void {
    const buffer = this.buffer(runId);
    if (buffer.status === 'ready') return;
    buffer.status = 'loading';
    buffer.error = null;
    this.publish(runId, buffer);
  }

  markReady(runId: string): void {
    const buffer = this.buffer(runId);
    buffer.status = 'ready';
    this.publish(runId, buffer);
  }

  markError(runId: string, error: string): void {
    const buffer = this.buffer(runId);
    buffer.status = 'error';
    buffer.error = error;
    this.publish(runId, buffer);
  }

  append(runId: string, lines: readonly RunLogLine[]): AppendResult {
    const buffer = this.buffer(runId);
    let appended = 0;
    let gapFrom: number | null = null;
    for (const line of lines) {
      if (line.index < buffer.nextIndex) continue;
      if (line.index > buffer.nextIndex) {
        gapFrom = buffer.nextIndex;
        break;
      }
      buffer.entries.append(line);
      buffer.nextIndex += 1;
      appended += 1;
    }
    if (appended > 0) this.publish(runId, buffer);
    return { appended, gapFrom };
  }

  forget(runId: string): void {
    this.buffers.delete(runId);
    this.listeners.delete(runId);
  }

  private buffer(runId: string): RunLogBuffer {
    const existing = this.buffers.get(runId);
    if (existing !== undefined) return existing;
    const created = freshBuffer();
    this.buffers.set(runId, created);
    return created;
  }

  private publish(runId: string, buffer: RunLogBuffer): void {
    buffer.version += 1;
    buffer.view = {
      status: buffer.status,
      version: buffer.version,
      entries: buffer.entries.entries,
      lineCount: buffer.nextIndex,
      error: buffer.error,
    };
    for (const listener of this.listeners.get(runId) ?? []) listener();
  }
}
