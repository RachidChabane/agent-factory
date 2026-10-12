import { describe, expect, it } from 'vitest';
import { AUDIT_ISSUE_TITLE_MAX_LENGTH, MarkdownAuditIssueRenderer } from './audit-issue-renderer.ts';
import type { AuditConclusion, AuditRecord } from './audit-projection.ts';

const AUDIT: AuditRecord = {
  id: '0123456789abcdef',
  commitSha: '0123456789abcdef',
  reason: 'direct-push',
  commitMessage: 'Tweak the build image workflow\n\nlonger description',
  authorLogin: 'alice',
  pullRequestNumber: null,
  state: 'challenge',
  conclusion: null,
  failureCount: 0,
  lastFailure: null,
  draft: null,
  publishedIssueNumber: null,
  resolved: false,
};

const CONCLUSION: AuditConclusion = {
  runId: 'run-1',
  summary: 'The change has no recorded need and no test.',
  findings: [
    { level: 'intent', statement: 'No issue or pull request body states the need.', evidence: 'commit 0123456' },
    { level: 'method', statement: 'No test covers the new branch.', evidence: '.github/workflows/build.yml:54' },
  ],
  proposedFix: 'Open a pull request that states the need and adds a workflow test.',
};

const GOLDEN_BODY = `## Change
- Commit: \`0123456789abcdef\`
- Pull request: none
- Author: alice
- Audited because: the commit reached the branch without a pull request
- Verdict: challenge
- Summary: The change has no recorded need and no test.

## Findings
1. [intent] No issue or pull request body states the need.
   Evidence: commit 0123456
2. [method] No test covers the new branch.
   Evidence: .github/workflows/build.yml:54

## Proposed fix
Open a pull request that states the need and adds a workflow test.

## Release impact
The release that contains this commit is reported as not promotable until the operator resolves this audit.`;

describe('MarkdownAuditIssueRenderer', () => {
  const renderer = new MarkdownAuditIssueRenderer();

  it('says when the commit message cites a pull request that has no record', () => {
    const merge = { ...AUDIT, commitMessage: 'Merge pull request #271 from example-org/roadmap' };
    expect(renderer.render(merge, CONCLUSION).body).toContain('- Pull request: none recorded (the commit message cites #271)');
  });

  it('renders the title and body', () => {
    expect(renderer.render(AUDIT, CONCLUSION)).toEqual({
      title: 'Audit challenge on 0123456: Tweak the build image workflow',
      body: GOLDEN_BODY,
    });
  });

  it('bounds the title length', () => {
    const draft = renderer.render({ ...AUDIT, commitMessage: 'x'.repeat(300) }, CONCLUSION);
    expect(draft.title).toHaveLength(AUDIT_ISSUE_TITLE_MAX_LENGTH);
    expect(draft.title.endsWith('...')).toBe(true);
  });

  it('states when no fix is proposed and links the pull request', () => {
    const draft = renderer.render({ ...AUDIT, pullRequestNumber: 42, reason: 'missing-factory-label' }, { ...CONCLUSION, proposedFix: null, findings: [] });
    expect(draft.body).toContain('- Pull request: #42');
    expect(draft.body).toContain('does not carry the factory label');
    expect(draft.body).toContain('No finding was recorded.');
    expect(draft.body).toContain('No fix is proposed.');
  });
});
