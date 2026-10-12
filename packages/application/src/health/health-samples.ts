import type { FactoryEventRecord } from '../ports.ts';
import { HEALTH_SAMPLED_EVENT, HEALTH_SUBJECT_PREFIX, HealthSampledPayloadSchema, type HealthSampledPayload } from './health-events.ts';

export interface HealthSample extends HealthSampledPayload {
  readonly at: Date;
}

/** The samples of each check of each environment since a time, oldest first, keyed by environment then check name. */
export function healthSamplesSince(records: readonly FactoryEventRecord[], since: Date): ReadonlyMap<string, ReadonlyMap<string, readonly HealthSample[]>> {
  const byEnvironment = new Map<string, Map<string, HealthSample[]>>();
  for (const record of records) {
    if (record.type !== HEALTH_SAMPLED_EVENT || !record.subject.startsWith(HEALTH_SUBJECT_PREFIX) || record.occurredAt < since) continue;
    const parsed = HealthSampledPayloadSchema.safeParse(record.payload);
    if (!parsed.success) continue;
    const checks = byEnvironment.get(parsed.data.environment) ?? new Map<string, HealthSample[]>();
    const samples = checks.get(parsed.data.check) ?? [];
    samples.push({ ...parsed.data, at: record.occurredAt });
    checks.set(parsed.data.check, samples);
    byEnvironment.set(parsed.data.environment, checks);
  }
  return byEnvironment;
}
