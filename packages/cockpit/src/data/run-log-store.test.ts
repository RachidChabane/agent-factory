import { describe, expect, it } from 'vitest';
import type { RunLogLine } from '../contract/index.ts';
import { RunLogStore } from './run-log-store.ts';

const AT = '2026-10-10T09:00:00.000Z';
const LARGE_LOG_LINES = 50_000;
const LARGE_LOG_BUDGET_MS = 1_500;

function text(index: number): RunLogLine {
  return { runId: 'run', index, at: AT, event: { kind: 'assistant-text', text: `line ${index}`, parentToolUseId: null } };
}

describe('RunLogStore', () => {
  it('pairs a tool result with its call', () => {
    const store = new RunLogStore();
    store.append('run', [
      { runId: 'run', index: 0, at: AT, event: { kind: 'tool-call', toolUseId: 't1', toolName: 'Read', input: { file_path: 'a.ts' }, parentToolUseId: null } },
      { runId: 'run', index: 1, at: AT, event: { kind: 'tool-result', toolUseId: 't1', isError: false, content: 'ok' } },
    ]);
    const view = store.getView('run');
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0]).toMatchObject({ kind: 'tool', summary: 'Read · a.ts', result: { content: 'ok', isError: false } });
    expect(view.lineCount).toBe(2);
  });

  it('ignores duplicates and stops at a gap', () => {
    const store = new RunLogStore();
    store.append('run', [text(0), text(1)]);
    const result = store.append('run', [text(1), text(2), text(4), text(5)]);
    expect(result).toEqual({ appended: 1, gapFrom: 3 });
    expect(store.nextIndex('run')).toBe(3);
  });

  it('publishes a new view object on every change and notifies subscribers', () => {
    const store = new RunLogStore();
    let notified = 0;
    store.subscribe('run', () => {
      notified += 1;
    });
    const before = store.getView('run');
    store.append('run', [text(0)]);
    expect(store.getView('run')).not.toBe(before);
    expect(notified).toBe(1);
    store.append('run', [text(0)]);
    expect(notified).toBe(1);
  });

  it('absorbs a 50 000-line log quickly', () => {
    const store = new RunLogStore();
    const lines = Array.from({ length: LARGE_LOG_LINES }, (_, index) => text(index));
    const started = performance.now();
    for (let offset = 0; offset < lines.length; offset += 500) store.append('run', lines.slice(offset, offset + 500));
    expect(performance.now() - started).toBeLessThan(LARGE_LOG_BUDGET_MS);
    expect(store.getView('run').lineCount).toBe(LARGE_LOG_LINES);
  });
});
