import { z } from 'zod';
import { ISSUE_TYPE_ID_PATTERN, RATE_LIMIT_WINDOWS } from '@agent-factory/domain';

export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const IsoDateSchema = z.iso.date();
export const CountSchema = z.number().int().nonnegative();
export const AmountSchema = z.number().nonnegative();
export const IssueNumberSchema = z.number().int().positive();
export const PercentSchema = z.number().min(0).max(100);
export const RatioSchema = z.number().nonnegative();

/** A project id of the installation's configuration. */
export const ProjectIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);

/** An issue type id of the project's typology. */
export const IssueTypeIdSchema = z.string().regex(ISSUE_TYPE_ID_PATTERN);

export const TokenUsageSchema = z.object({
  inputTokens: CountSchema,
  outputTokens: CountSchema,
  cacheReadTokens: CountSchema,
  cacheCreationTokens: CountSchema,
});
export type TokenUsageView = z.infer<typeof TokenUsageSchema>;

/** Token totals stated both ways, so a reader never mistakes one for the other. */
export const TokenTotalsSchema = z.object({
  input: CountSchema,
  output: CountSchema,
  cacheRead: CountSchema,
  cacheCreation: CountSchema,
  withoutCache: CountSchema,
  withCache: CountSchema,
});
export type TokenTotals = z.infer<typeof TokenTotalsSchema>;

export const SubscriptionWindowSchema = z.object({
  window: z.enum(RATE_LIMIT_WINDOWS),
  utilization: RatioSchema,
  resetsAt: IsoDateTimeSchema,
});
export type SubscriptionWindowView = z.infer<typeof SubscriptionWindowSchema>;

/**
 * A value read from outside the event log (the forge, the machine, an HTTP probe): the last
 * value read, when it was read, and the error of the latest attempt when that attempt failed.
 * A failed attempt keeps the previous value and its read time.
 */
export function readingOf<Value extends z.ZodType>(value: Value) {
  return z.object({ value: value.nullable(), readAt: IsoDateTimeSchema.nullable(), error: z.string().nullable() });
}
export interface Reading<Value> {
  readonly value: Value | null;
  readonly readAt: string | null;
  readonly error: string | null;
}
