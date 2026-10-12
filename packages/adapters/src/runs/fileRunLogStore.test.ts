import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunLogLine } from '@agent-factory/application';
import { FileRunLogStore, UnsafeRunIdError } from './fileRunLogStore.ts';

const AT = new Date('2026-10-10T10:00:00.000Z');
const CLOCK = { now: (): Date => AT };

describe('FileRunLogStore', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'run-logs-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('numbers the lines of a run, replays them after an index and notifies listeners live', async () => {
    const store = new FileRunLogStore(join(directory, 'runs'), CLOCK);
    const seen: RunLogLine[] = [];
    const unsubscribe = store.subscribe((line) => seen.push(line));
    await Promise.all([
      store.append('run-1', { kind: 'session-started', sessionId: 's', model: 'sonnet' }),
      store.append('run-1', { kind: 'assistant-text', text: 'hello', parentToolUseId: null }),
      store.append('run-1', { kind: 'rate-limit', snapshots: [{ window: 'five_hour', utilization: 0.3, resetsAt: AT }] }),
    ]);
    unsubscribe();
    await store.append('run-1', { kind: 'usage', usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheCreationTokens: 0 }, costUsd: 0.1, turns: 1 });
    expect(seen.map((line) => line.index)).toEqual([0, 1, 2]);
    const page = await store.read('run-1', 1);
    expect(page.total).toBe(4);
    expect(page.lines.map((line) => line.event.kind)).toEqual(['rate-limit', 'usage']);
    expect(page.lines[0]?.event).toEqual({ kind: 'rate-limit', snapshots: [{ window: 'five_hour', utilization: 0.3, resetsAt: AT }] });
  });

  it('continues the numbering of a run written by an earlier process', async () => {
    await new FileRunLogStore(directory, CLOCK).append('run-2', { kind: 'raw', line: 'a' });
    const reopened = new FileRunLogStore(directory, CLOCK);
    expect((await reopened.append('run-2', { kind: 'raw', line: 'b' })).index).toBe(1);
    expect((await reopened.read('missing', null)).lines).toEqual([]);
  });

  it('refuses a run identifier that could leave the directory', async () => {
    const store = new FileRunLogStore(directory, CLOCK);
    await expect(store.read('../escape', null)).rejects.toBeInstanceOf(UnsafeRunIdError);
  });
});
