import { ExpectationFailed, expectMatch } from './expectations.ts';
import { LINE_SEPARATOR } from './format.ts';

const FIELD_SEPARATOR = ': ';
/** The mark `validate` puts before a required check that failed. */
const VALIDATION_FAILURE_MARK = 'FAIL';
const ISSUE_CREATED_LINE = /^(?<project>[^\s#]+)#(?<issue>\d+) created on /m;
const PULL_REQUEST_OPEN_LINE = /^(?<project>[^\s#]+)#(?<issue>\d+): pull request #(?<pullRequest>\d+) is open: /m;
const PULL_REQUEST_MERGED_LINE = /^Pull request #(?<pullRequest>\d+) of (?<project>[^\s#]+)#(?<issue>\d+) merged as (?<sha>[0-9a-f]{40})$/m;

/** The fields `status <issue>` prints, by the label that starts their line. */
export const STATUS_FIELDS = {
  state: 'State',
  beforeProof: 'Before proof',
  lastGate: 'Last gate',
  mergedAs: 'Merged as',
} as const;

function captured(match: RegExpExecArray, group: string): string {
  const value = match.groups?.[group];
  if (value === undefined) throw new ExpectationFailed(`the output names the ${group}`, `a ${group}`, match[0]);
  return value;
}

export function createdIssueNumber(output: string): number {
  const match = expectMatch('the command reports the issue it created', ISSUE_CREATED_LINE, output);
  return Number(captured(match, 'issue'));
}

export interface OpenedPullRequest {
  readonly issue: number;
  readonly pullRequest: number;
}

export function openedPullRequest(output: string): OpenedPullRequest {
  const match = expectMatch('the command reports the pull request it opened', PULL_REQUEST_OPEN_LINE, output);
  return { issue: Number(captured(match, 'issue')), pullRequest: Number(captured(match, 'pullRequest')) };
}

export interface MergedPullRequest extends OpenedPullRequest {
  readonly mergeSha: string;
}

export function mergedPullRequest(output: string): MergedPullRequest {
  const match = expectMatch('the command reports the merge it made', PULL_REQUEST_MERGED_LINE, output);
  return { issue: Number(captured(match, 'issue')), pullRequest: Number(captured(match, 'pullRequest')), mergeSha: captured(match, 'sha') };
}

/** The lines of a `validate` run that report a required check as failed. */
export function validationFailures(output: string): readonly string[] {
  return output.split(LINE_SEPARATOR).filter((line) => line.startsWith(`${VALIDATION_FAILURE_MARK} `));
}

/** The `Label: value` lines of `status <issue>`, by label. */
export function statusFields(output: string): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  for (const line of output.split(LINE_SEPARATOR)) {
    const separator = line.indexOf(FIELD_SEPARATOR);
    if (separator > 0) fields.set(line.slice(0, separator), line.slice(separator + FIELD_SEPARATOR.length));
  }
  return fields;
}
