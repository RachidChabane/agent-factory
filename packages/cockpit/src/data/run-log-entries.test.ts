import { describe, expect, it } from 'vitest';
import { RunLogLineSchema } from '../contract/index.ts';
import { z } from 'zod';
import systemLines from './__fixtures__/run-log-system-lines.json' with { type: 'json' };
import { RunLogEntries } from './run-log-entries.ts';
import { parseSystemNotice } from './system-notices.ts';

const lines = z.array(RunLogLineSchema).parse(systemLines);

function entriesOf(rawLines: readonly string[]): RunLogEntries {
  const entries = new RunLogEntries();
  rawLines.forEach((line, index) => entries.append({ runId: 'run-1', index, at: '2026-10-10T04:00:00.000Z', event: { kind: 'raw', line } }));
  return entries;
}

describe('RunLogEntries system lines', () => {
  const entries = new RunLogEntries();
  lines.forEach((line) => entries.append(line));
  const kinds = entries.entries.map((entry) => entry.kind);

  it('types every system line of a real run instead of leaving it raw', () => {
    expect(kinds).toEqual(['noise', 'hook-started', 'hook', 'noise', 'task', 'task', 'notice', 'noise']);
  });

  it('names the hook that started and the hook that answered', () => {
    expect(entries.entries[1]).toMatchObject({ kind: 'hook-started', hookName: 'PreToolUse:Edit', hookEvent: 'PreToolUse' });
    expect(entries.entries[2]).toMatchObject({ kind: 'hook', hookName: 'SessionStart:startup', hookEvent: 'SessionStart', exitCode: 0 });
  });

  it('pairs a task start with its finish by description and status', () => {
    expect(entries.entries[4]).toMatchObject({ kind: 'task', phase: 'started', description: 'mise run lint', status: null });
    expect(entries.entries[5]).toMatchObject({ kind: 'task', phase: 'finished', description: 'mise run lint', status: 'failed' });
  });

  it('keeps the raw line of every typed entry for the raw view', () => {
    for (const entry of entries.entries) expect('line' in entry && entry.line?.startsWith('{')).toBe(true);
  });

  it('keeps unparseable lines and non-system json as raw', () => {
    expect(entriesOf(['not json', '{"type":"assistant"}']).entries.map((entry) => entry.kind)).toEqual(['raw', 'raw']);
  });

  it('marks a hook that errored as failed', () => {
    const line = '{"type":"system","subtype":"hook_response","hook_name":"Stop","hook_event":"Stop","outcome":"error","stderr":"blocked"}';
    expect(entriesOf([line]).entries[0]).toMatchObject({ kind: 'hook', exitCode: 1, output: 'blocked' });
  });

  it('hides an unknown system subtype as noise labelled with its subtype', () => {
    expect(parseSystemNotice('{"type":"system","subtype":"compact_boundary","session_id":"s"}')).toEqual({ kind: 'noise', label: 'système · compact_boundary' });
  });

  it('keeps a known subtype whose payload is malformed out of the typed rows', () => {
    expect(parseSystemNotice('{"type":"system","subtype":"task_started"}')).toEqual({ kind: 'noise', label: 'système · task_started' });
  });
});
