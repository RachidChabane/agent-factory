import { z } from 'zod';

export const ISSUE_STATES = ['open', 'closed'] as const;
export const PULL_REQUEST_STATES = ['open', 'merged', 'closed'] as const;
export type PullRequestState = (typeof PULL_REQUEST_STATES)[number];

const PositiveNumber = z.number().int().positive();
const Label = z.string().trim().min(1);

const Instant = z.iso.datetime({ offset: true });

export const IssueFrontMatterSchema = z.strictObject({
  title: z.string().trim().min(1),
  labels: z.array(Label).default([]),
  state: z.enum(ISSUE_STATES).default('open'),
  blockedBy: z.array(PositiveNumber).default([]),
  /** When the issue was opened; an issue file written by hand without it dates from its last change. */
  createdAt: Instant.optional(),
  updatedAt: Instant.optional(),
});
export type IssueFrontMatter = z.infer<typeof IssueFrontMatterSchema>;

export const PullRequestFileSchema = z.strictObject({
  number: PositiveNumber,
  title: z.string().min(1),
  head: z.string().min(1),
  base: z.string().min(1),
  labels: z.array(Label),
  closes: z.array(PositiveNumber),
  state: z.enum(PULL_REQUEST_STATES),
  author: z.string().min(1),
  createdAt: z.iso.datetime(),
  mergeSha: z.string().nullable(),
  mergedAt: z.iso.datetime().nullable(),
});
export type PullRequestFile = z.infer<typeof PullRequestFileSchema>;

export const CommentsFileSchema = z.array(
  z.strictObject({
    body: z.string(),
    createdAt: z.iso.datetime(),
  }),
);
export type CommentsFile = z.infer<typeof CommentsFileSchema>;

export const LOCAL_DEPLOYMENT_STATES = ['success', 'failure', 'in-progress', 'inactive'] as const;

export const DeploymentsFileSchema = z.array(
  z.strictObject({
    id: z.string().min(1),
    ref: z.string().min(1),
    sha: z.string().min(1),
    createdAt: z.iso.datetime(),
    creator: z.string().nullable(),
    state: z.enum(LOCAL_DEPLOYMENT_STATES),
    logUrl: z.string().nullable(),
    environmentUrl: z.string().nullable(),
  }),
);
export type DeploymentsFile = z.infer<typeof DeploymentsFileSchema>;

export const WorkflowDispatchFileSchema = z.strictObject({
  number: PositiveNumber,
  workflow: z.string().min(1),
  ref: z.string().min(1),
  inputs: z.record(z.string(), z.string()),
  recordedAt: z.iso.datetime(),
});
export type WorkflowDispatchFile = z.infer<typeof WorkflowDispatchFileSchema>;
