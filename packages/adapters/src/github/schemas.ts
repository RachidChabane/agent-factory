import { z } from 'zod';

export const IssueResponseSchema = z.object({
  id: z.number().int(),
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  labels: z.array(z.object({ name: z.string() })),
  pull_request: z.unknown().optional(),
});
export type IssueResponse = z.infer<typeof IssueResponseSchema>;

export const IssueListPagesSchema = z.array(z.array(IssueResponseSchema));
export const LabelListPagesSchema = z.array(z.array(z.object({ name: z.string() })));

export const PullRequestViewSchema = z.object({
  number: z.number().int(),
  url: z.string(),
  headRefOid: z.string(),
});

export const PullRequestMergeViewSchema = z.object({
  mergeCommit: z.object({ oid: z.string() }).nullable(),
});

export const PullRequestHeadViewSchema = z.object({ headRefOid: z.string() });

export const PullRequestListSchema = z.array(PullRequestViewSchema);

export const CheckRunsPagesSchema = z.array(
  z.object({
    check_runs: z.array(
      z.object({
        name: z.string(),
        status: z.string(),
        conclusion: z.string().nullable(),
        html_url: z.string().nullable(),
      }),
    ),
  }),
);

export const CommitStatusPagesSchema = z.array(
  z.object({
    statuses: z.array(
      z.object({
        context: z.string(),
        state: z.enum(['success', 'failure', 'error', 'pending']),
        target_url: z.string().nullable(),
      }),
    ),
  }),
);

export const CommitSchema = z.object({
  sha: z.string(),
  author: z.object({ login: z.string() }).nullable(),
  commit: z.object({
    message: z.string(),
    committer: z.object({ date: z.coerce.date() }),
  }),
});

export const CommitListSchema = z.array(CommitSchema);

export const CommitPullRequestsSchema = z.array(
  z.object({
    number: z.number().int(),
    merge_commit_sha: z.string().nullable(),
    head: z.object({ ref: z.string() }),
    labels: z.array(z.object({ name: z.string() })),
  }),
);

export const CommitDetailSchema = z.object({
  files: z.array(z.object({ filename: z.string() })).default([]),
});

export const PullRequestDetailsSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullable(),
  user: z.object({ login: z.string() }).nullable(),
});

export const OpenPullRequestListSchema = z.array(
  z.object({
    number: z.number().int(),
    title: z.string(),
    headRefName: z.string(),
    headRefOid: z.string(),
    url: z.string(),
    labels: z.array(z.object({ name: z.string() })),
  }),
);

export const BranchResponseSchema = z.object({ commit: z.object({ sha: z.string() }) });

export const TagListPagesSchema = z.array(z.array(z.object({ name: z.string(), commit: z.object({ sha: z.string() }) })));

export const DeploymentListSchema = z.array(
  z.object({
    id: z.number().int(),
    sha: z.string(),
    ref: z.string(),
    environment: z.string(),
    created_at: z.coerce.date(),
    creator: z.object({ login: z.string() }).nullable(),
  }),
);

export const DEPLOYMENT_STATUS_STATES = ['success', 'failure', 'error', 'in_progress', 'queued', 'pending', 'inactive'] as const;

export const DeploymentStatusListSchema = z.array(
  z.object({
    state: z.enum(DEPLOYMENT_STATUS_STATES),
    log_url: z.string().nullable().optional(),
    target_url: z.string().nullable().optional(),
    environment_url: z.string().nullable().optional(),
  }),
);
