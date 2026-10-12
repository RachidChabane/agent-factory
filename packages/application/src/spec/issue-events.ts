import { z } from 'zod';

/** The factory opened an issue on the forge, from a spec file or an accepted proposed spec. */
export const ISSUE_CREATED_EVENT = 'issue.created';
/** The operator validated the spec of an issue, which lets the factory take it. */
export const ISSUE_SPEC_VALIDATED_EVENT = 'issue.spec-validated';

/** Events after which the issues waiting on the forge have to be read again. */
export const PENDING_ISSUE_EVENTS: readonly string[] = [ISSUE_CREATED_EVENT, ISSUE_SPEC_VALIDATED_EVENT];

export const IssueCreatedPayloadSchema = z.object({
  title: z.string(),
  labels: z.array(z.string()),
  requestId: z.string().nullable(),
  specId: z.string().nullable(),
});
export type IssueCreatedPayload = z.infer<typeof IssueCreatedPayloadSchema>;
