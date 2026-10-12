import { z } from 'zod';
import { RateLimitSnapshotPayloadSchema } from '../runs/run-events.ts';

export const RATE_LIMIT_OBSERVED_EVENT = 'budget.rate-limit-observed';
export const BUDGET_SUBJECT_PREFIX = 'budget/';

export function budgetSubject(account: string): string {
  return `${BUDGET_SUBJECT_PREFIX}${account}`;
}

export const RateLimitObservedPayloadSchema = z.object({
  account: z.string().min(1),
  snapshots: z.array(RateLimitSnapshotPayloadSchema),
});
export type RateLimitObservedPayload = z.infer<typeof RateLimitObservedPayloadSchema>;
