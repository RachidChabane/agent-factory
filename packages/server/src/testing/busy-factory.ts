import { RUN_FINISHED_EVENT, RUN_STARTED_EVENT, RunFinishedPayloadSchema, RunStartedPayloadSchema, runSubject, type EventStore } from '@agent-factory/application';

export const BUSY_RUN_COUNT = 150;
const BUSY_RUN_PREFIX = 'busy-run-';
const BUSY_RUN_STEP_MS = 90_000;
const BUSY_RUN_DURATION_MS = 60_000;
const ISSUE_NUMBER = '42';
const FINISHED_USAGE = { inputTokens: 900, outputTokens: 400, cacheReadTokens: 3000, cacheCreationTokens: 200 };
const NO_USAGE = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

export function busyRunId(index: number): string {
  return `${BUSY_RUN_PREFIX}${index}`;
}

/** The payload that records the start of an implementer run of one project, valid against the schema the log is read with. */
export function runStartedPayload(id: string, project: string, startedAt: Date): unknown {
  return RunStartedPayloadSchema.parse({
    id,
    project,
    role: 'implementer',
    model: 'sonnet',
    effort: 'high',
    status: 'running',
    outcome: null,
    subject: { kind: 'issue', id: ISSUE_NUMBER },
    attempt: 1,
    currentTool: null,
    branch: 'factory/42-link-mockups',
    startedAt: startedAt.toISOString(),
    endedAt: null,
    usage: NO_USAGE,
    costUsd: 0,
    turns: 0,
    maxTurns: 80,
    maxBudgetUsd: 5,
    lastLine: null,
    logLength: 0,
    subagents: [],
    pendingQuestion: null,
    account: null,
  });
}

export function runFinishedPayload(id: string, endedAt: Date): unknown {
  return RunFinishedPayloadSchema.parse({
    status: 'succeeded',
    outcome: 'success',
    endedAt: endedAt.toISOString(),
    usage: FINISHED_USAGE,
    costUsd: 0.4,
    turns: 11,
    durationMs: BUSY_RUN_DURATION_MS,
    sessionId: `session-${id}`,
    account: null,
    detail: null,
  });
}

/** Records many finished runs of a project in the log, as a factory that has been at work for a long time holds. */
export async function appendBusyRuns(events: EventStore, project: string, count: number = BUSY_RUN_COUNT): Promise<void> {
  const base = Date.now() - count * BUSY_RUN_STEP_MS;
  for (let index = 0; index < count; index += 1) {
    const id = busyRunId(index);
    const startedAt = new Date(base + index * BUSY_RUN_STEP_MS);
    await events.append(RUN_STARTED_EVENT, runSubject(id), runStartedPayload(id, project, startedAt));
    await events.append(RUN_FINISHED_EVENT, runSubject(id), runFinishedPayload(id, new Date(startedAt.getTime() + BUSY_RUN_DURATION_MS)));
  }
}

/** Records the start of a run that is still going, which the cockpit counts among the live ones. */
export async function appendLiveRun(events: EventStore, project: string, id: string): Promise<void> {
  await events.append(RUN_STARTED_EVENT, runSubject(id), runStartedPayload(id, project, new Date()));
}
