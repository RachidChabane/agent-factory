import { describe, expect, it } from 'vitest';
import type { RunLogLine } from '../contract/index.ts';
import { fixtureSnapshot } from '../test/render.tsx';
import { RunLogStore } from './run-log-store.ts';
import { foldRunLogLines } from './run-summary.ts';

const AT = '2026-10-10T09:00:00.000Z';
const PROGRESS = { inputTokens: 12, outputTokens: 640, cacheReadTokens: 9_000, cacheCreationTokens: 1_200 };

describe('foldRunLogLines', () => {
  it('shows the tokens and turns of a running agent as it streams, and its cost once the run reports it', () => {
    const run = fixtureSnapshot().runs[0];
    if (run === undefined) throw new Error('the fixture has no run');
    const progress: RunLogLine = { runId: run.id, index: 0, at: AT, event: { kind: 'progress', usage: PROGRESS, turns: 4 } };
    const live = foldRunLogLines({ ...run, costUsd: 0 }, [progress]);
    expect(live).toMatchObject({ usage: PROGRESS, turns: 4, costUsd: 0 });
    const final = { ...PROGRESS, outputTokens: 700 };
    const finished = foldRunLogLines(live, [{ runId: run.id, index: 1, at: AT, event: { kind: 'usage', usage: final, costUsd: 0.42, turns: 5 } }]);
    expect(finished).toMatchObject({ usage: final, turns: 5, costUsd: 0.42 });
  });

  it('keeps progress out of the log entries', () => {
    const store = new RunLogStore();
    store.append('run', [{ runId: 'run', index: 0, at: AT, event: { kind: 'progress', usage: PROGRESS, turns: 1 } }]);
    expect(store.getView('run').entries).toEqual([]);
  });
});
