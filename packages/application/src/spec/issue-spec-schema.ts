import { z } from 'zod';
import { COMMIT_KINDS } from '@agent-factory/domain';

export const IssueSpecSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  type: z.string().min(1),
  need: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  outOfScope: z.array(z.string().min(1)).min(1),
  expectedProof: z.string().min(1),
  dependsOn: z.array(z.number().int().positive()),
  commitKind: z.enum(COMMIT_KINDS).nullable().default(null),
  films: z.array(z.string().min(1)).default([]),
});
