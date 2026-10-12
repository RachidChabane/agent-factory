export const LOCAL_GITHUB_DIRECTORIES = {
  issues: 'issues',
  pulls: 'pulls',
  comments: 'comments',
  deployments: 'deployments',
  workflowDispatches: 'workflow-dispatches',
} as const;

export const DEPLOYMENTS_FILE_EXTENSION = '.json';
export const WORKFLOW_DISPATCH_FILE_EXTENSION = '.json';
export const SAFE_ENVIRONMENT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const ISSUE_FILE_EXTENSION = '.md';
export const PULL_REQUEST_FILE_EXTENSION = '.json';
export const PULL_REQUEST_BODY_EXTENSION = '.md';
export const COMMENTS_FILE_EXTENSION = '.json';
export const BARE_REPOSITORY_SUFFIX = '.git';

/** none: pull requests carry no check; gate: each commit's checks are the project's own gate, run by the local forge. */
export const LOCAL_CHECK_MODES = ['none', 'gate'] as const;
export type LocalCheckMode = (typeof LOCAL_CHECK_MODES)[number];

export const FIRST_NUMBER = 1;
export const RECENT_COMMIT_LIMIT = 100;
export const MERGE_TREE_MINIMUM_GIT_VERSION: readonly [number, number] = [2, 38];
export const BRANCH_REF_PREFIX = 'refs/heads/';
export const TAG_REF_PREFIX = 'refs/tags/';
export const JSON_INDENT = 2;
