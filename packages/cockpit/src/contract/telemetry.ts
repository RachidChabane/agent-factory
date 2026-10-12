import { z } from 'zod';
import { SubscriptionWindowSchema } from './primitives.ts';
import { ResourceSampleSchema } from './snapshot.ts';

export const TelemetrySampleSchema = z.object({
  resources: ResourceSampleSchema,
  subscription: z.array(SubscriptionWindowSchema),
});
export type TelemetrySample = z.infer<typeof TelemetrySampleSchema>;
