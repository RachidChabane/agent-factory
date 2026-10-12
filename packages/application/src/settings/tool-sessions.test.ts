import type { ToolProbeResult } from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryEventStore } from '../audit/testing/fakes.ts';
import { SETTINGS_SUBJECT, TOOL_CHECKED_EVENT } from './settings-events.ts';
import {
  latestToolSessions,
  logInTool,
  TOOL_LOGIN_FINISHED_EVENT,
  TOOL_SESSION_KEPT_EVENT,
  ToolSessionKeepers,
  type ToolSessionCommands,
  type ToolSessionPurpose,
  type ToolSessionRun,
} from './tool-sessions.ts';

const START = Date.parse('2026-10-12T09:00:00.000Z');
const MINUTE = 60_000;
const SILENT = { info: () => undefined, warn: () => undefined };

class ManualClock {
  at = START;
  now(): Date {
    return new Date(this.at);
  }
}

class ScriptedSessions implements ToolSessionCommands {
  readonly runs: (readonly [string, ToolSessionPurpose])[] = [];
  private readonly outcome: ToolSessionRun;

  constructor(outcome: ToolSessionRun = { outcome: 'succeeded', detail: 'exit code 0 after 3 s' }) {
    this.outcome = outcome;
  }

  run(tool: string, purpose: ToolSessionPurpose): Promise<ToolSessionRun> {
    this.runs.push([tool, purpose]);
    return Promise.resolve(this.outcome);
  }
}

function prober(status: ToolProbeResult['status']) {
  return { probe: (tool: string): Promise<ToolProbeResult> => Promise.resolve({ tool, status, version: null, detail: status, fixCommand: null }) };
}

describe('the sessions of the connected tools', () => {
  it('records how a login ended and checks the tool again at once', async () => {
    const events = new InMemoryEventStore();
    const sessions = new ScriptedSessions();
    const outcome = await logInTool({ events, sessions, prober: prober('connected') }, 'vault', 'Alex Morgan', new AbortController().signal);
    expect(sessions.runs).toEqual([['vault', 'login']]);
    expect(outcome.check.status).toBe('connected');
    expect(events.records.map((record) => [record.type, record.subject])).toEqual([
      [TOOL_LOGIN_FINISHED_EVENT, SETTINGS_SUBJECT],
      [TOOL_CHECKED_EVENT, SETTINGS_SUBJECT],
    ]);
    expect(events.records[0]?.payload).toEqual({ tool: 'vault', outcome: 'succeeded', detail: 'exit code 0 after 3 s', operator: 'Alex Morgan' });
  });

  it('keeps each session alive at the first tick, then once per its interval', async () => {
    const clock = new ManualClock();
    const events = new InMemoryEventStore(clock);
    const sessions = new ScriptedSessions();
    const keepers = new ToolSessionKeepers(
      { events, sessions, prober: prober('connected'), clock, log: SILENT },
      { scope: 'the installation', operator: 'Alex Morgan', sessions: [{ tool: 'vault', everyMs: 30 * MINUTE }, { tool: 'cloud', everyMs: 90 * MINUTE }] },
    );
    const signal = new AbortController().signal;
    await keepers.run(signal);
    clock.at += 29 * MINUTE;
    await keepers.run(signal);
    clock.at += MINUTE;
    await keepers.run(signal);
    clock.at += 60 * MINUTE;
    await keepers.run(signal);
    expect(sessions.runs).toEqual([
      ['vault', 'keep-alive'],
      ['cloud', 'keep-alive'],
      ['vault', 'keep-alive'],
      ['vault', 'keep-alive'],
      ['cloud', 'keep-alive'],
    ]);
    expect(events.typesOf(SETTINGS_SUBJECT).filter((type) => type === TOOL_SESSION_KEPT_EVENT)).toHaveLength(5);
  });

  it('says which login and keep-alive each tool had last, with their times', async () => {
    const clock = new ManualClock();
    const events = new InMemoryEventStore(clock);
    await logInTool({ events, sessions: new ScriptedSessions({ outcome: 'timed-out', detail: 'timed out after 300 s' }), prober: prober('unauthenticated') }, 'vault', 'Alex Morgan', new AbortController().signal);
    clock.at += MINUTE;
    await new ToolSessionKeepers({ events, sessions: new ScriptedSessions(), prober: prober('connected'), clock, log: SILENT }, { scope: 'x', operator: 'Alex Morgan', sessions: [{ tool: 'vault', everyMs: MINUTE }] }).run(new AbortController().signal);
    const vault = latestToolSessions(events.records).get('vault');
    expect(vault?.lastLogin).toMatchObject({ outcome: 'timed-out', at: new Date(START) });
    expect(vault?.lastKeepAlive).toMatchObject({ outcome: 'succeeded', at: new Date(START + MINUTE) });
    expect(latestToolSessions(events.records).get('cloud')).toBeUndefined();
  });

  it('runs nothing once the factory stops', async () => {
    const controller = new AbortController();
    controller.abort();
    const sessions = new ScriptedSessions();
    await new ToolSessionKeepers({ events: new InMemoryEventStore(), sessions, prober: prober('connected'), clock: new ManualClock(), log: SILENT }, { scope: 'x', operator: 'a', sessions: [{ tool: 'vault', everyMs: MINUTE }] }).run(controller.signal);
    expect(sessions.runs).toEqual([]);
  });
});
