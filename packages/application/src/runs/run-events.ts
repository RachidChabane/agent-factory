import { z } from 'zod';
import { AGENT_ROLES, EFFORT_LEVELS, RATE_LIMIT_WINDOWS } from '@agent-factory/domain';
import { AGENT_RUN_OUTCOMES, RUN_SUBJECT_KINDS, type AgentRunOutcome } from '../ports.ts';

export const RUN_STARTED_EVENT = 'run.started';
export const RUN_FINISHED_EVENT = 'run.finished';
export const RUN_SUBJECT_PREFIX = 'run/';

export const RUN_STATUSES = ['running', 'waiting', 'succeeded', 'failed', 'stopped'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const SUCCESS_OUTCOME: AgentRunOutcome = 'success';
export const ABORTED_OUTCOME: AgentRunOutcome = 'aborted';
export const ERROR_OUTCOME: AgentRunOutcome = 'error';
export const DECISION_REQUESTED_OUTCOME: AgentRunOutcome = 'decision-requested';

export function runSubject(runId: string): string {
  return `${RUN_SUBJECT_PREFIX}${runId}`;
}

export function statusOfOutcome(outcome: AgentRunOutcome): RunStatus {
  if (outcome === SUCCESS_OUTCOME) return 'succeeded';
  if (outcome === ABORTED_OUTCOME) return 'stopped';
  if (outcome === DECISION_REQUESTED_OUTCOME) return 'waiting';
  return 'failed';
}

const IsoTimestamp = z.iso.datetime({ offset: true });
const Count = z.number().int().nonnegative();

export const TokenUsagePayloadSchema = z.object({
  inputTokens: Count,
  outputTokens: Count,
  cacheReadTokens: Count,
  cacheCreationTokens: Count,
});

export const RunSubjectPayloadSchema = z.object({ kind: z.enum(RUN_SUBJECT_KINDS), id: z.string().min(1) });

export const RunStartedPayloadSchema = z.object({
  id: z.string().min(1),
  role: z.enum(AGENT_ROLES),
  model: z.string().min(1),
  effort: z.enum(EFFORT_LEVELS),
  status: z.enum(RUN_STATUSES),
  outcome: z.enum(AGENT_RUN_OUTCOMES).nullable(),
  subject: RunSubjectPayloadSchema,
  attempt: Count,
  currentTool: z.string().nullable(),
  branch: z.string().nullable(),
  startedAt: IsoTimestamp,
  endedAt: IsoTimestamp.nullable(),
  usage: TokenUsagePayloadSchema,
  costUsd: z.number().nonnegative(),
  turns: Count,
  maxTurns: Count,
  maxBudgetUsd: z.number().nonnegative(),
  lastLine: z.string().nullable(),
  logLength: Count,
  subagents: z.array(
    z.object({ toolUseId: z.string(), description: z.string(), agentType: z.string(), status: z.enum(['running', 'done', 'failed']) }),
  ),
  pendingQuestion: z.object({ id: z.string().min(1), text: z.string(), options: z.array(z.string()), askedAt: IsoTimestamp }).nullable(),
  account: z.string().nullable(),
});
export type RunStartedPayload = z.infer<typeof RunStartedPayloadSchema>;

export const RunFinishedPayloadSchema = z.object({
  status: z.enum(RUN_STATUSES),
  outcome: z.enum(AGENT_RUN_OUTCOMES),
  endedAt: IsoTimestamp,
  usage: TokenUsagePayloadSchema,
  costUsd: z.number().nonnegative(),
  turns: Count,
  durationMs: z.number().nonnegative(),
  sessionId: z.string().nullable(),
  account: z.string().nullable(),
  detail: z.string().nullable(),
});
export type RunFinishedPayload = z.infer<typeof RunFinishedPayloadSchema>;

export const RateLimitSnapshotPayloadSchema = z.object({
  window: z.enum(RATE_LIMIT_WINDOWS),
  utilization: z.number().nonnegative(),
  resetsAt: IsoTimestamp,
});
export type RateLimitSnapshotPayload = z.infer<typeof RateLimitSnapshotPayloadSchema>;
