import { z } from 'zod';
import { GATE_STEP_OUTCOMES } from '@agent-factory/domain';
import { AmountSchema, CountSchema, IsoDateTimeSchema, SubscriptionWindowSchema, TokenUsageSchema } from './primitives.ts';

export const SUBAGENT_TOOL_NAMES: readonly string[] = ['Task', 'Agent'];

export const GateStepViewSchema = z.object({
  name: z.string(),
  outcome: z.enum(GATE_STEP_OUTCOMES),
  detail: z.string(),
});
export type GateStepView = z.infer<typeof GateStepViewSchema>;

export const RunLogEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session-started'), sessionId: z.string(), model: z.string() }),
  z.object({ kind: z.literal('assistant-text'), text: z.string(), parentToolUseId: z.string().nullable() }),
  z.object({
    kind: z.literal('tool-call'),
    toolUseId: z.string().min(1),
    toolName: z.string().min(1),
    input: z.unknown(),
    parentToolUseId: z.string().nullable(),
  }),
  z.object({ kind: z.literal('tool-result'), toolUseId: z.string().min(1), isError: z.boolean(), content: z.string() }),
  z.object({ kind: z.literal('permission-denied'), toolName: z.string(), message: z.string() }),
  z.object({ kind: z.literal('hook'), hookEvent: z.string(), exitCode: z.number().int().nullable(), output: z.string() }),
  z.object({ kind: z.literal('rate-limit'), snapshots: z.array(SubscriptionWindowSchema) }),
  z.object({ kind: z.literal('gate'), passed: z.boolean(), steps: z.array(GateStepViewSchema) }),
  z.object({ kind: z.literal('usage'), usage: TokenUsageSchema, costUsd: AmountSchema, turns: CountSchema }),
  z.object({ kind: z.literal('progress'), usage: TokenUsageSchema, turns: CountSchema }),
  z.object({ kind: z.literal('raw'), line: z.string() }),
]);
export type RunLogEvent = z.infer<typeof RunLogEventSchema>;
export type RunLogEventKind = RunLogEvent['kind'];

export const RunLogLineSchema = z.object({
  runId: z.string().min(1),
  index: CountSchema,
  at: IsoDateTimeSchema,
  event: RunLogEventSchema,
});
export type RunLogLine = z.infer<typeof RunLogLineSchema>;

export const RunLogPageSchema = z.object({
  runId: z.string().min(1),
  total: CountSchema,
  lines: z.array(RunLogLineSchema),
});
export type RunLogPage = z.infer<typeof RunLogPageSchema>;
