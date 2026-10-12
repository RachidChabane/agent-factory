import { z } from 'zod';
import { CountSchema, IsoDateTimeSchema, ProjectIdSchema } from './primitives.ts';

/**
 * One event of the installation's log as the stream sends it: the project it belongs to (null for
 * installation events) and its subject as the project sees it. The cockpit reloads its snapshot
 * after events and uses them for its activity feed.
 */
export const StreamEventSchema = z.object({
  sequence: CountSchema,
  occurredAt: IsoDateTimeSchema,
  type: z.string().min(1),
  project: ProjectIdSchema.nullable(),
  subject: z.string(),
  summary: z.string(),
});
export type StreamEvent = z.infer<typeof StreamEventSchema>;
