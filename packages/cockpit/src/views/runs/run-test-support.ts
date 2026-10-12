import type { RunLogLine, RunView } from '../../contract/index.ts';
import type { LogEntry } from '../../data/run-log-entries.ts';
import { RunLogEntries } from '../../data/run-log-entries.ts';
import type { RunLogStatus, RunLogView } from '../../data/run-log-store.ts';
import { buildWorld } from '../../test/fixtures/world.ts';
import { TEST_NOW } from '../../test/harness.tsx';

export const LIVE_RUN = 'run_7f3a2c';
export const WAITING_RUN = 'run_5d0911';
export const FINISHED_RUN = 'run_4c9e07';
export const REVIEW_RUN = 'run_a9d3c6';
export const STOPPED_RUN = 'run_62d8f4';
export const FAILED_RUN = 'run_2e6b40';
export const INSTALLATION_RUN = 'run_96e1d0';
export const SHARED_ACCOUNT_RUN = 'run_d09c53';
export const UNKNOWN_ACCOUNT_RUN = 'run_2a9e60';
export const CHALLENGER_RUN = 'run_1c7d84';
export const WAITING_QUESTION_ID = 'decision-run_5d0911';

export function runsPath(runId?: string, project?: string): string {
  const path = runId === undefined ? '/runs' : `/runs/${runId}`;
  return project === undefined ? path : `${path}?project=${project}`;
}

/** The lines the fixture world logged for a run. */
export function logLinesOf(runId: string): readonly RunLogLine[] {
  const lines = buildWorld(TEST_NOW).logs.get(runId);
  if (lines === undefined) throw new Error(`the world holds no log for ${runId}`);
  return lines;
}

export function entriesOfLines(lines: readonly RunLogLine[]): readonly LogEntry[] {
  const entries = new RunLogEntries();
  for (const line of lines) entries.append(line);
  return entries.entries;
}

export function entriesOfRun(runId: string): readonly LogEntry[] {
  return entriesOfLines(logLinesOf(runId));
}

export function logViewOf(entries: readonly LogEntry[], status: RunLogStatus = 'ready', error: string | null = null, lineCount: number = entries.length): RunLogView {
  return { status, version: 1, entries, lineCount, error };
}

/** The log of a run of the world as the cockpit holds it once it is loaded. */
export function logViewOfRun(runId: string, status: RunLogStatus = 'ready', error: string | null = null): RunLogView {
  const lines = logLinesOf(runId);
  return logViewOf(entriesOfLines(lines), status, error, lines.length);
}

const AN_INSTANT = '2026-10-12T09:00:00.000Z';

/** A finished run that touched nothing, to be adjusted by the test that needs a particular one. */
export function aRun(overrides: Partial<RunView> = {}): RunView {
  return {
    id: 'run_000000',
    project: 'storefront',
    role: 'implementer',
    model: 'claude-sonnet-5-5',
    effort: 'high',
    account: 'personal',
    status: 'succeeded',
    outcome: 'success',
    subject: { kind: 'issue', id: '45' },
    attempt: 0,
    currentTool: null,
    branch: null,
    startedAt: AN_INSTANT,
    endedAt: '2026-10-12T09:30:00.000Z',
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    costUsd: 1,
    turns: 3,
    maxTurns: 150,
    maxBudgetUsd: 5,
    lastLine: null,
    logLength: 0,
    subagents: [],
    pendingQuestion: null,
    ...overrides,
  };
}

/** A value a test relies on being there; the failure says what was missing instead of a bare `undefined`. */
export function present<Value>(value: Value | null | undefined, what: string): Value {
  if (value === null || value === undefined) throw new Error(`expected ${what} to exist`);
  return value;
}
