import type { GitHubGateway, PullRequestDetails } from '../ports.ts';
import type { AuditRecord } from './audit-projection.ts';
import { citedPullRequests, renderCitedPullRequests } from './cited-pull-requests.ts';

export const MAX_DIFF_CHARACTERS = 200_000;
export const NO_PULL_REQUEST_TEXT = 'none (the commit reached the branch without a pull request)';
export const UNRECORDED_PULL_REQUEST_TEXT = 'no pull request record is linked to the commit';
export const NO_BODY_TEXT = '(empty)';

export interface ChangeContext {
  readonly commitSha: string;
  readonly commitMessage: string;
  readonly authorLogin: string | null;
  readonly pullRequest: PullRequestDetails | null;
  readonly changedFiles: readonly string[];
  readonly diff: string;
}

export function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARACTERS) return diff;
  const omitted = diff.length - MAX_DIFF_CHARACTERS;
  return `${diff.slice(0, MAX_DIFF_CHARACTERS)}\n[diff truncated: ${omitted} characters omitted]\n`;
}

export async function gatherChangeContext(github: GitHubGateway, audit: AuditRecord): Promise<ChangeContext> {
  const { diff, changedFiles } = await github.commitDiff(audit.commitSha);
  const pullRequest = audit.pullRequestNumber === null ? null : await github.pullRequestDetails(audit.pullRequestNumber);
  return {
    commitSha: audit.commitSha,
    commitMessage: audit.commitMessage,
    authorLogin: audit.authorLogin,
    pullRequest,
    changedFiles,
    diff: truncateDiff(diff),
  };
}

function orEmpty(text: string): string {
  return text.trim() === '' ? NO_BODY_TEXT : text.trim();
}

function renderMissingPullRequest(commitMessage: string): string {
  const cited = citedPullRequests(commitMessage);
  if (cited.length === 0) return NO_PULL_REQUEST_TEXT;
  return `${UNRECORDED_PULL_REQUEST_TEXT}; its message cites ${renderCitedPullRequests(cited)}, whose body and review are not available to this audit`;
}

export function renderChangeDescription(context: ChangeContext): string {
  const pullRequest =
    context.pullRequest === null
      ? renderMissingPullRequest(context.commitMessage)
      : [
          `#${context.pullRequest.number} ${context.pullRequest.title}`,
          `Pull request author: ${context.pullRequest.authorLogin ?? 'unknown'}`,
          `Pull request body:\n${orEmpty(context.pullRequest.body)}`,
        ].join('\n');
  return [
    `Commit: ${context.commitSha}`,
    `Commit author: ${context.authorLogin ?? 'unknown'}`,
    `Commit message:\n${orEmpty(context.commitMessage)}`,
    `Pull request: ${pullRequest}`,
    `Changed files:\n${context.changedFiles.map((file) => `- ${file}`).join('\n')}`,
  ].join('\n\n');
}
