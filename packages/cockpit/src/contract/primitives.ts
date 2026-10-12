import { z } from 'zod';
import { ISSUE_TYPE_ID_PATTERN, RATE_LIMIT_WINDOWS } from '@agent-factory/domain';

export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const IsoDateSchema = z.iso.date();
export const CountSchema = z.number().int().nonnegative();
export const AmountSchema = z.number().nonnegative();
export const IssueNumberSchema = z.number().int().positive();
export const PercentSchema = z.number().min(0).max(100);
export const RatioSchema = z.number().nonnegative();

export const TokenUsageSchema = z.object({
  inputTokens: CountSchema,
  outputTokens: CountSchema,
  cacheReadTokens: CountSchema,
  cacheCreationTokens: CountSchema,
});
export type TokenUsageView = z.infer<typeof TokenUsageSchema>;

export const SubscriptionWindowSchema = z.object({
  window: z.enum(RATE_LIMIT_WINDOWS),
  utilization: RatioSchema,
  resetsAt: IsoDateTimeSchema,
});
export type SubscriptionWindowView = z.infer<typeof SubscriptionWindowSchema>;

/** An issue type id of the project's typology. */
export const IssueTypeIdSchema = z.string().regex(ISSUE_TYPE_ID_PATTERN);
