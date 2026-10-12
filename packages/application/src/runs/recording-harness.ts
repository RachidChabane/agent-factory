import type { AgentHarness, AgentRunEvent, AgentRunRequest, AgentRunResult, Clock, EventStore, RunLogStore } from '../ports.ts';
import type { TokenUsage } from '@agent-factory/domain';
import { DEFAULT_ACCOUNT_NAME } from '../budget/budget-governor.ts';
import {
  ERROR_OUTCOME,
  RUN_FINISHED_EVENT,
  RUN_STARTED_EVENT,
  runSubject,
  statusOfOutcome,
  type RunFinishedPayload,
  type RunStartedPayload,
} from './run-events.ts';

export const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
const RUNNING_STATUS = 'running';
const FAILED_STATUS = 'failed';

export function startedPayload(request: AgentRunRequest, startedAt: Date, project: string | null = null): RunStartedPayload {
  return {
    id: request.runId,
    project,
    role: request.role,
    model: request.model,
    effort: request.effort,
    status: RUNNING_STATUS,
    outcome: null,
    subject: request.context.subject,
    attempt: request.context.attempt,
    currentTool: null,
    branch: request.context.branch,
    startedAt: startedAt.toISOString(),
    endedAt: null,
    usage: ZERO_USAGE,
    costUsd: 0,
    turns: 0,
    maxTurns: request.maxTurns,
    maxBudgetUsd: request.maxBudgetUsd,
    lastLine: null,
    logLength: 0,
    subagents: [],
    pendingQuestion: null,
    account: request.account ?? DEFAULT_ACCOUNT_NAME,
  };
}

function finishedPayload(request: AgentRunRequest, result: AgentRunResult, endedAt: Date): RunFinishedPayload {
  return {
    status: statusOfOutcome(result.outcome),
    outcome: result.outcome,
    endedAt: endedAt.toISOString(),
    usage: result.usage,
    costUsd: result.costUsd,
    turns: result.turns,
    durationMs: result.durationMs,
    sessionId: result.sessionId,
    account: request.account ?? DEFAULT_ACCOUNT_NAME,
    detail: null,
  };
}

function failedPayload(request: AgentRunRequest, error: unknown, startedAt: Date, endedAt: Date): RunFinishedPayload {
  return {
    status: FAILED_STATUS,
    outcome: ERROR_OUTCOME,
    endedAt: endedAt.toISOString(),
    usage: ZERO_USAGE,
    costUsd: 0,
    turns: 0,
    durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
    sessionId: null,
    account: request.account ?? DEFAULT_ACCOUNT_NAME,
    detail: error instanceof Error ? error.message : String(error),
  };
}

export class RecordingHarness implements AgentHarness {
  private readonly inner: AgentHarness;
  private readonly events: EventStore;
  private readonly clock: Clock;
  private readonly runLogs: RunLogStore;
  private readonly project: string | null;

  /** Records every run in the installation's log, stamped with the project it works for. */
  constructor(inner: AgentHarness, events: EventStore, clock: Clock, runLogs: RunLogStore, project: string | null = null) {
    this.inner = inner;
    this.events = events;
    this.clock = clock;
    this.runLogs = runLogs;
    this.project = project;
  }

  async run(request: AgentRunRequest, onEvent: (event: AgentRunEvent) => void, signal: AbortSignal): Promise<AgentRunResult> {
    const startedAt = this.clock.now();
    await this.events.append(RUN_STARTED_EVENT, runSubject(request.runId), startedPayload(request, startedAt, this.project));
    let logged: Promise<unknown> = Promise.resolve();
    const record = (event: AgentRunEvent): void => {
      logged = logged.then(() => this.runLogs.append(request.runId, event));
      onEvent(event);
    };
    let result: AgentRunResult;
    try {
      result = await this.inner.run(request, record, signal);
    } catch (error) {
      await logged.catch(() => undefined);
      await this.events.append(RUN_FINISHED_EVENT, runSubject(request.runId), failedPayload(request, error, startedAt, this.clock.now()));
      throw error;
    }
    await logged;
    await this.runLogs.append(request.runId, { kind: 'usage', usage: result.usage, costUsd: result.costUsd, turns: result.turns });
    await this.events.append(RUN_FINISHED_EVENT, runSubject(request.runId), finishedPayload(request, result, this.clock.now()));
    return result;
  }
}
