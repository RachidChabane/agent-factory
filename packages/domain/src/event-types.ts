export const ISSUE_TRANSITIONED_EVENT = 'issue.transitioned';
export const ISSUE_SUBJECT_PREFIX = 'issue/';

export function issueSubject(issueNumber: number): string {
  return `${ISSUE_SUBJECT_PREFIX}${issueNumber}`;
}
