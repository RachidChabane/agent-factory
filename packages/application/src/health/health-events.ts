import { z } from 'zod';

export const HEALTH_SAMPLED_EVENT = 'health.sampled';
export const HEALTH_SUBJECT_PREFIX = 'health/';

export function healthSubject(environment: string): string {
  return `${HEALTH_SUBJECT_PREFIX}${environment}`;
}

export const HealthSampledPayloadSchema = z.object({
  environment: z.string().min(1),
  check: z.string().min(1),
  url: z.string(),
  ok: z.boolean(),
  statusCode: z.number().int().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  detail: z.string(),
});
export type HealthSampledPayload = z.infer<typeof HealthSampledPayloadSchema>;
