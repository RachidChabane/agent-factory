import { z } from 'zod';
import { ResourcesViewSchema, RunViewSchema, UsageViewSchema } from './snapshot.ts';

/** What changes between events: the machine's resources, the subscription usage and the runs in progress. */
export const TelemetrySampleSchema = z.object({
  resources: ResourcesViewSchema,
  usage: UsageViewSchema,
  runs: z.array(RunViewSchema),
});
export type TelemetrySample = z.infer<typeof TelemetrySampleSchema>;
