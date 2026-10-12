import { z } from 'zod';
import { USAGE_LIMIT_KINDS, USAGE_SOURCES } from '@agent-factory/domain';

export const USAGE_READ_EVENT = 'usage.read';
export const USAGE_SUBJECT_PREFIX = 'usage/';

export function usageSubject(account: string): string {
  return `${USAGE_SUBJECT_PREFIX}${account}`;
}

export const UsageLimitPayloadSchema = z.object({
  kind: z.enum(USAGE_LIMIT_KINDS),
  scope: z.string().nullable(),
  utilization: z.number().min(0).max(1),
  resetsAt: z.iso.datetime({ offset: true }).nullable(),
});

export const UsageReadPayloadSchema = z.object({
  account: z.string().min(1),
  source: z.enum(USAGE_SOURCES),
  readAt: z.iso.datetime({ offset: true }),
  limits: z.array(UsageLimitPayloadSchema),
});
export type UsageReadPayload = z.infer<typeof UsageReadPayloadSchema>;

export const USAGE_READ_FAILED_EVENT = 'usage.read-failed';

export const UsageReadFailedPayloadSchema = z.object({
  account: z.string().min(1),
  failedAt: z.iso.datetime({ offset: true }),
  reason: z.string().min(1),
});
export type UsageReadFailedPayload = z.infer<typeof UsageReadFailedPayloadSchema>;
