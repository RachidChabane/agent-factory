export const GH_EXECUTABLE = 'gh';
export const GITHUB_WEB_ORIGIN = 'https://github.com';
export const GH_COMMAND_TIMEOUT_MS = 60_000;
export const GH_ENVIRONMENT_PASSTHROUGH: readonly string[] = [
  'PATH',
  'HOME',
  'XDG_CONFIG_HOME',
  'GH_CONFIG_DIR',
  'GH_HOST',
  'GH_TOKEN',
  'GITHUB_TOKEN',
];
export const GH_FIXED_ENVIRONMENT: Readonly<Record<string, string>> = {
  GH_PROMPT_DISABLED: '1',
  GH_NO_UPDATE_NOTIFIER: '1',
  NO_COLOR: '1',
};
export const PAGE_SIZE = 100;
export const MAX_COMMIT_PAGES = 10;
export const LISTED_ISSUE_STATE = 'open';
export const EXIT_CODE_OK = 0;

export const CHECK_RUN_COMPLETED_STATUS = 'completed';
export const DIFF_MEDIA_TYPE = 'application/vnd.github.diff';
export const ACCEPT_HEADER = 'Accept';
export const OPEN_PULL_REQUEST_STATE = 'open';
export const PULL_REQUEST_REF_FIELDS = 'number,url,headRefOid';
export const OPEN_PULL_REQUEST_LIST_LIMIT = 1000;
export const OPEN_PULL_REQUEST_SUMMARY_FIELDS = 'number,title,headRefName,headRefOid,url,labels,createdAt';
export const NOT_FOUND_STDERR_MARKER = 'HTTP 404';
export const LATEST_DEPLOYMENT_STATUS_COUNT = 1;
export const WORKFLOW_DISPATCH_FIELD_FLAG = '--raw-field';
