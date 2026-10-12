import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PINNED_CLAUDE_VERSION } from '../claude-invocation.ts';
import { RunTranscript } from './run-transcript.ts';
import { parseStreamLine } from './stream-parser.ts';
import { UsageTally, usageObservationOf } from './usage-tally.ts';

const MAX_LINE_BYTES = 1024 * 1024;

function assistant(id: string, usage: object, parent: string | null = null): unknown {
  return { type: 'assistant', parent_tool_use_id: parent, message: { id, content: [], usage } };
}

describe('UsageTally', () => {
  it('counts each message once, keeps its largest counts and adds the output its final delta reports', () => {
    const tally = new UsageTally();
    const first = { input_tokens: 2, cache_creation_input_tokens: 1000, cache_read_input_tokens: 0, output_tokens: 8 };
    const observations = [
      usageObservationOf({ type: 'stream_event', event: { type: 'message_start', message: { id: 'm1', usage: first } } }),
      usageObservationOf(assistant('m1', first)),
      usageObservationOf(assistant('m1', first)),
      usageObservationOf({ type: 'stream_event', event: { type: 'message_delta', usage: { output_tokens: 120 } } }),
      usageObservationOf(assistant('m2', { input_tokens: 3, cache_read_input_tokens: 1000, cache_creation_input_tokens: 50, output_tokens: 30 })),
      usageObservationOf(assistant('s1', { input_tokens: 5, output_tokens: 7 }, 'toolu_task')),
    ];
    const changes = observations.map((observation) => (observation === null ? null : tally.observe(observation)));
    expect(changes).toEqual([true, false, false, true, true, true]);
    expect(tally.progress()).toEqual({
      usage: { inputTokens: 10, outputTokens: 157, cacheReadTokens: 1000, cacheCreationTokens: 1050 },
      turns: 2,
    });
  });

  it('ignores a delta before any message started and lines that carry no usage', () => {
    const tally = new UsageTally();
    const delta = usageObservationOf({ type: 'stream_event', event: { type: 'message_delta', usage: { output_tokens: 9 } } });
    expect(delta === null ? null : tally.observe(delta)).toBe(false);
    expect(usageObservationOf({ type: 'user', message: { content: [] } })).toBeNull();
    expect(tally.progress().turns).toBe(0);
  });
});

describe(`live usage of a recorded claude ${PINNED_CLAUDE_VERSION} run`, () => {
  it('reports growing usage while the run streams and reaches the input and cache counts of the result', () => {
    const path = fileURLToPath(new URL(`../fixtures/stream-${PINNED_CLAUDE_VERSION}-stop-hook-blocks.jsonl`, import.meta.url));
    const text = readFileSync(path, 'utf8');
    const progress: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }[] = [];
    const transcript = new RunTranscript(MAX_LINE_BYTES, (event) => {
      if (event.kind === 'progress') progress.push(event.usage);
    }, () => undefined);
    transcript.push(Buffer.from(text));
    transcript.end();
    const result = text.split('\n').filter((line) => line.trim() !== '').map(parseStreamLine).find((line) => line.result !== null)?.result;
    const last = progress.at(-1);
    expect(progress.length).toBeGreaterThan(1);
    progress.slice(1).forEach((usage, index) => expect(usage.outputTokens).toBeGreaterThanOrEqual(progress[index]?.outputTokens ?? 0));
    expect(last).toMatchObject({
      inputTokens: result?.usage?.input_tokens,
      cacheReadTokens: result?.usage?.cache_read_input_tokens,
      cacheCreationTokens: result?.usage?.cache_creation_input_tokens,
    });
    expect(last?.outputTokens).toBeLessThanOrEqual(result?.usage?.output_tokens ?? 0);
  });
});
