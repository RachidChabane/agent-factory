import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AgentRunEvent } from '@agent-factory/application';
import { StopHookPayloadSchema } from '@agent-factory/plugin';
import { describe, expect, it } from 'vitest';
import { PINNED_CLAUDE_VERSION } from '../claude-invocation.ts';
import { outcomeOfResult } from '../run-outcome.ts';
import { parseStreamLine, TRANSPORT_LINE_KEYS } from './stream-parser.ts';
import { AssistantSchema, LineEnvelopeSchema, ThinkingBlockSchema } from './stream-schemas.ts';

function fixtureLines(name: string): readonly string[] {
  const path = fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
}

function eventsOfKind<K extends AgentRunEvent['kind']>(
  events: readonly AgentRunEvent[],
  kind: K,
): readonly Extract<AgentRunEvent, { kind: K }>[] {
  return events.filter((event): event is Extract<AgentRunEvent, { kind: K }> => event.kind === kind);
}

const SESSION_ID = 'fd2f974c-cc7e-42e8-a9ed-eea58626dad3';

describe(`stream-json contract of claude ${PINNED_CLAUDE_VERSION}`, () => {
  const lines = fixtureLines(`stream-${PINNED_CLAUDE_VERSION}-stop-hook-blocks.jsonl`);
  const parsed = lines.map(parseStreamLine);
  const events = parsed.flatMap((line) => line.events);

  function lineKey(line: string): string {
    const envelope = LineEnvelopeSchema.parse(JSON.parse(line));
    return envelope.subtype === undefined ? envelope.type : `${envelope.type}:${envelope.subtype}`;
  }

  function onlyThinking(line: string): boolean {
    const value: unknown = JSON.parse(line);
    const parsed = AssistantSchema.safeParse(value);
    return parsed.success && parsed.data.message.content.every((block) => ThinkingBlockSchema.safeParse(block).success);
  }

  it('turns every recorded line into typed events, except transport lines and thinking-only messages', () => {
    expect(lines).toHaveLength(341);
    lines.forEach((line, index) => {
      const silent = TRANSPORT_LINE_KEYS.includes(lineKey(line)) || TRANSPORT_LINE_KEYS.includes(LineEnvelopeSchema.parse(JSON.parse(line)).type) || onlyThinking(line);
      expect(parsed[index]?.events.length === 0).toBe(silent);
    });
    expect(parsed.filter((line) => line.events.length === 0)).toHaveLength(320);
  });

  it('reports the session start with its model', () => {
    expect(eventsOfKind(events, 'session-started')).toEqual([
      { kind: 'session-started', sessionId: SESSION_ID, model: 'claude-haiku-5-5' },
    ]);
  });

  it('extracts the final result', () => {
    const results = parsed.flatMap((line) => (line.result === null ? [] : [line.result]));
    expect(results).toHaveLength(1);
    const [result] = results;
    expect(result).toMatchObject({
      subtype: 'success',
      is_error: false,
      session_id: SESSION_ID,
      total_cost_usd: 0.00744871,
      duration_ms: 17021,
      num_turns: 7,
      usage: { input_tokens: 20, output_tokens: 2175, cache_read_input_tokens: 195581, cache_creation_input_tokens: 22017 },
    });
    expect(result === undefined ? null : outcomeOfResult(result)).toBe('success');
  });

  it('extracts rate-limit snapshots for both subscription windows', () => {
    expect(eventsOfKind(events, 'rate-limit')).toEqual([
      {
        kind: 'rate-limit',
        snapshots: [
          { window: 'five_hour', utilization: 0.08, resetsAt: new Date(1791598200 * 1000) },
          { window: 'seven_day', utilization: 0.43, resetsAt: new Date(1792069200 * 1000) },
        ],
      },
    ]);
  });

  it('captures the permission denial', () => {
    const denials = eventsOfKind(events, 'permission-denied');
    expect(denials).toHaveLength(1);
    expect(denials[0]?.toolName).toBe('Bash');
    expect(denials[0]?.message).toContain("don't ask mode");
  });

  it('pairs tool calls with their results', () => {
    const calls = eventsOfKind(events, 'tool-call');
    const results = eventsOfKind(events, 'tool-result');
    expect(calls.map((call) => call.toolName)).toEqual(['Write', 'Bash', 'Read']);
    expect(results.map((result) => result.toolUseId)).toEqual(calls.map((call) => call.toolUseId));
    expect(results.map((result) => result.isError)).toEqual([false, true, false]);
    expect(calls[0]?.input).toMatchObject({ content: 'hello\n' });
  });

  it('reports the assistant text of the main conversation', () => {
    const texts = eventsOfKind(events, 'assistant-text');
    expect(texts).toHaveLength(4);
    texts.forEach((text) => expect(text.parentToolUseId).toBeNull());
  });

  it('reports hook responses with their exit codes', () => {
    const hooks = eventsOfKind(events, 'hook');
    expect(hooks.map((hook) => [hook.hookEvent, hook.exitCode])).toEqual([
      ['SessionStart', 0],
      ['SessionStart', 0],
    ]);
  });

  it('keeps notifications and the result line as raw events, never a partial message, a status line or a hook start', () => {
    const raw = eventsOfKind(events, 'raw');
    expect(new Set(raw.map((event) => lineKey(event.line)))).toEqual(
      new Set(['system:ui_status', 'system:notification', 'result:success', 'user']),
    );
  });

  it('reports the session of every line that carries one', () => {
    parsed.forEach((line) => expect(line.sessionId).toBe(SESSION_ID));
  });
});

describe('unknown stream lines', () => {
  it('turns a line type it does not know into a raw event', () => {
    const line = JSON.stringify({ type: 'prompt_suggestion', suggestion: 'run the tests' });
    expect(parseStreamLine(line)).toEqual({ events: [{ kind: 'raw', line }], sessionId: null, result: null, usage: null });
  });

  it('keeps partial message deltas, status lines and thinking-only messages out of the transcript', () => {
    const delta = '{"type":"stream_event","session_id":"s","event":{"type":"content_block_delta","index":0}}';
    const status = '{"type":"system","subtype":"status","status":"requesting","session_id":"s"}';
    const thinking = '{"type":"assistant","session_id":"s","message":{"content":[{"type":"thinking","thinking":"","signature":"x"}]}}';
    expect([delta, status, thinking].map((line) => parseStreamLine(line))).toEqual([
      { events: [], sessionId: 's', result: null, usage: null },
      { events: [], sessionId: 's', result: null, usage: null },
      { events: [], sessionId: 's', result: null, usage: null },
    ]);
  });

  it('keeps an assistant message whose blocks it cannot read as raw', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"server_tool_use","id":"t"}]}}';
    expect(parseStreamLine(line).events).toEqual([{ kind: 'raw', line }]);
  });

  it('turns malformed JSON into a raw event', () => {
    expect(parseStreamLine('{"type":').events).toEqual([{ kind: 'raw', line: '{"type":' }]);
  });

  it('turns a known type with an unexpected shape into a raw event', () => {
    const line = JSON.stringify({ type: 'assistant', message: 'not an object' });
    expect(parseStreamLine(line).events).toEqual([{ kind: 'raw', line }]);
  });

  it('keeps a result line it cannot read as raw without inventing a result', () => {
    const line = JSON.stringify({ type: 'result', subtype: 'success' });
    expect(parseStreamLine(line)).toEqual({ events: [{ kind: 'raw', line }], sessionId: null, result: null, usage: null });
  });
});

describe(`Stop hook input contract of claude ${PINNED_CLAUDE_VERSION}`, () => {
  const payloads = fixtureLines(`stop-hook-inputs-${PINNED_CLAUDE_VERSION}.jsonl`).map((line) =>
    StopHookPayloadSchema.parse(JSON.parse(line)),
  );

  it('parses every recorded Stop payload', () => {
    expect(payloads).toHaveLength(4);
    payloads.forEach((payload) => {
      expect(payload.hook_event_name).toBe('Stop');
      expect(payload.session_id).toBe(SESSION_ID);
      expect(payload.permission_mode).toBe('dontAsk');
      expect(payload.effort?.level).toBe('medium');
      expect(payload.background_tasks).toEqual([]);
      expect(payload.session_crons).toEqual([]);
    });
  });

  it('marks every payload after the first block as stop_hook_active', () => {
    expect(payloads.map((payload) => payload.stop_hook_active)).toEqual([false, true, true, true]);
  });
});
