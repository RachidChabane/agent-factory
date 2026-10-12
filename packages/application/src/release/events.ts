import { z } from 'zod';
import { MERGE_ATTRIBUTION_KINDS } from '@agent-factory/domain';

export const PULL_REQUEST_OPENED_EVENT = 'pr.opened';
export const RELEASE_EVALUATED_EVENT = 'release.evaluated';

export const PULL_REQUEST_SUBJECT_PREFIX = 'pr/';
export const RELEASE_SUBJECT_PREFIX = 'release/';

export function pullRequestSubject(number: number): string {
  return `${PULL_REQUEST_SUBJECT_PREFIX}${number}`;
}

export function releaseSubject(releaseId: string): string {
  return `${RELEASE_SUBJECT_PREFIX}${releaseId}`;
}

export const PullRequestOpenedPayloadSchema = z.object({
  number: z.number().int(),
  evidenceComplete: z.boolean(),
  issueNumber: z.number().int().positive().optional(),
  headSha: z.string().optional(),
});
export type PullRequestOpenedPayload = z.infer<typeof PullRequestOpenedPayloadSchema>;

export const RELEASE_COMMIT_ATTRIBUTIONS = MERGE_ATTRIBUTION_KINDS;

export const ReleaseCommitPayloadSchema = z.object({
  sha: z.string(),
  message: z.string(),
  author: z.string().nullable(),
  pullRequestNumber: z.number().int().nullable(),
  attribution: z.enum(RELEASE_COMMIT_ATTRIBUTIONS),
});
export type ReleaseCommitPayload = z.infer<typeof ReleaseCommitPayloadSchema>;

export const HealthCheckPayloadSchema = z.object({ name: z.string(), passed: z.boolean(), detail: z.string() });

export const ReleaseEvaluatedPayloadSchema = z.object({
  releaseId: z.string(),
  promotable: z.boolean(),
  blockingReasons: z.array(z.string()),
  commitShas: z.array(z.string()),
  report: z.string(),
  commits: z.array(ReleaseCommitPayloadSchema).default([]),
  health: z.array(HealthCheckPayloadSchema).default([]),
});
export type ReleaseEvaluatedPayload = z.infer<typeof ReleaseEvaluatedPayloadSchema>;
