import { z } from 'zod';
import { ISSUE_TYPES } from '@agent-factory/domain';
import { CHALLENGE_VERDICTS } from './challenge-answer.ts';

export const REQUEST_RECEIVED_EVENT = 'request.received';
export const REQUEST_CHALLENGE_STARTED_EVENT = 'request.challenge-started';
export const REQUEST_CHALLENGE_FAILED_EVENT = 'request.challenge-failed';
export const REQUEST_CHALLENGED_EVENT = 'request.challenged';
export const REQUEST_SPEC_UPDATED_EVENT = 'request.spec-updated';
export const REQUEST_ISSUE_CREATED_EVENT = 'request.issue-created';
export const REQUEST_DECLINED_EVENT = 'request.declined';

export const REQUEST_SUBJECT_PREFIX = 'request/';

export function requestSubject(requestId: string): string {
  return `${REQUEST_SUBJECT_PREFIX}${requestId}`;
}

export const AttachmentPayloadSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  mediaType: z.string().min(1),
});
export type AttachmentPayload = z.infer<typeof AttachmentPayloadSchema>;

export const RequestReceivedPayloadSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  requester: z.string(),
  channel: z.string(),
  body: z.string(),
  attachments: z.array(AttachmentPayloadSchema),
  receivedAt: z.iso.datetime({ offset: true }),
});
export type RequestReceivedPayload = z.infer<typeof RequestReceivedPayloadSchema>;

export const RequestChallengeStartedPayloadSchema = z.object({ runId: z.string().min(1) });
export type RequestChallengeStartedPayload = z.infer<typeof RequestChallengeStartedPayloadSchema>;

export const RequestChallengeFailedPayloadSchema = z.object({ runId: z.string().min(1), reason: z.string() });
export type RequestChallengeFailedPayload = z.infer<typeof RequestChallengeFailedPayloadSchema>;

export const SourcePayloadSchema = z.object({ label: z.string(), reference: z.string() });
export type SourcePayload = z.infer<typeof SourcePayloadSchema>;

export const ChallengeItemPayloadSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  verdict: z.enum(CHALLENGE_VERDICTS),
  currentState: z.string(),
  intent: z.string(),
  idea: z.string(),
  method: z.string(),
  reason: z.string(),
  question: z.string().nullable(),
  sources: z.array(SourcePayloadSchema),
});
export type ChallengeItemPayload = z.infer<typeof ChallengeItemPayloadSchema>;

export const ProposedSpecPayloadSchema = z.object({
  id: z.string().min(1),
  itemIds: z.array(z.string()),
  title: z.string().min(1),
  type: z.enum(ISSUE_TYPES),
  need: z.string(),
  acceptanceCriteria: z.array(z.string()),
  outOfScope: z.array(z.string()),
  expectedProof: z.string(),
  path: z.string().min(1),
  problems: z.array(z.string()),
});
export type ProposedSpecPayload = z.infer<typeof ProposedSpecPayloadSchema>;

export const RequestChallengedPayloadSchema = z.object({
  runId: z.string().min(1),
  completedAt: z.iso.datetime({ offset: true }),
  summary: z.string(),
  items: z.array(ChallengeItemPayloadSchema),
  specs: z.array(ProposedSpecPayloadSchema),
  reply: z.string(),
  reportPath: z.string().min(1),
  replyPath: z.string().min(1),
});
export type RequestChallengedPayload = z.infer<typeof RequestChallengedPayloadSchema>;

export const RequestSpecUpdatedPayloadSchema = z.object({ specId: z.string().min(1), spec: ProposedSpecPayloadSchema });
export type RequestSpecUpdatedPayload = z.infer<typeof RequestSpecUpdatedPayloadSchema>;

export const RequestIssueCreatedPayloadSchema = z.object({
  specId: z.string().min(1),
  issueNumber: z.number().int().positive(),
});
export type RequestIssueCreatedPayload = z.infer<typeof RequestIssueCreatedPayloadSchema>;

export const RequestDeclinedPayloadSchema = z.object({ reason: z.string() });
export type RequestDeclinedPayload = z.infer<typeof RequestDeclinedPayloadSchema>;
