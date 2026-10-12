import type { AuditReason } from '@agent-factory/domain';
import { citedPullRequests, renderCitedPullRequests } from './cited-pull-requests.ts';
import type { AuditConclusion, AuditIssueDraft, AuditRecord } from './audit-projection.ts';

export const AUDIT_ISSUE_TITLE_MAX_LENGTH = 100;
export const SHORT_SHA_LENGTH = 7;
const ELLIPSIS = '...';

export const AUDIT_REASON_DESCRIPTIONS: Readonly<Record<AuditReason, string>> = {
  'direct-push': 'the commit reached the branch without a pull request',
  'bot-author': 'the commit author is a bot account',
  'branch-not-factory': 'the pull request head branch does not start with factory/',
  'missing-factory-label': 'the pull request does not carry the factory label',
  'on-demand': 'an operator asked for this audit',
};

export const RELEASE_IMPACT_TEXT =
  'The release that contains this commit is reported as not promotable until the operator resolves this audit.';
export const NO_PROPOSED_FIX_TEXT = 'No fix is proposed.';
export const NO_FINDINGS_TEXT = 'No finding was recorded.';

export interface AuditIssueRenderer {
  render(audit: AuditRecord, conclusion: AuditConclusion): AuditIssueDraft;
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? '';
}

function fit(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - ELLIPSIS.length)}${ELLIPSIS}`;
}

export class MarkdownAuditIssueRenderer implements AuditIssueRenderer {
  render(audit: AuditRecord, conclusion: AuditConclusion): AuditIssueDraft {
    return { title: this.title(audit), body: [this.change(audit, conclusion), this.findings(conclusion), this.fix(conclusion), this.impact()].join('\n\n') };
  }

  private title(audit: AuditRecord): string {
    const prefix = `Audit ${audit.state} on ${audit.commitSha.slice(0, SHORT_SHA_LENGTH)}: `;
    return prefix + fit(firstLine(audit.commitMessage), AUDIT_ISSUE_TITLE_MAX_LENGTH - prefix.length);
  }

  private change(audit: AuditRecord, conclusion: AuditConclusion): string {
    const pullRequest = audit.pullRequestNumber === null ? this.missingPullRequest(audit) : `#${audit.pullRequestNumber}`;
    return [
      '## Change',
      `- Commit: \`${audit.commitSha}\``,
      `- Pull request: ${pullRequest}`,
      `- Author: ${audit.authorLogin ?? 'unknown'}`,
      `- Audited because: ${AUDIT_REASON_DESCRIPTIONS[audit.reason]}`,
      `- Verdict: ${audit.state}`,
      `- Summary: ${conclusion.summary}`,
    ].join('\n');
  }

  private missingPullRequest(audit: AuditRecord): string {
    const cited = citedPullRequests(audit.commitMessage);
    return cited.length === 0 ? 'none' : `none recorded (the commit message cites ${renderCitedPullRequests(cited)})`;
  }

  private findings(conclusion: AuditConclusion): string {
    const lines =
      conclusion.findings.length === 0
        ? [NO_FINDINGS_TEXT]
        : conclusion.findings.map((finding, index) => `${index + 1}. [${finding.level}] ${finding.statement}\n   Evidence: ${finding.evidence}`);
    return ['## Findings', ...lines].join('\n');
  }

  private fix(conclusion: AuditConclusion): string {
    return ['## Proposed fix', conclusion.proposedFix ?? NO_PROPOSED_FIX_TEXT].join('\n');
  }

  private impact(): string {
    return ['## Release impact', RELEASE_IMPACT_TEXT].join('\n');
  }
}
