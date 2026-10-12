import { describe, expect, it } from 'vitest';
import type { AuditRecord } from '@agent-factory/application';
import { renderAudit } from './audit-view.ts';

const CONCLUDED: AuditRecord = {
  id: 'abc1234',
  commitSha: 'abc1234',
  reason: 'on-demand',
  commitMessage: 'fix: remove the gate',
  authorLogin: 'dev',
  pullRequestNumber: null,
  pullRequestBranch: null,
  state: 'challenge',
  conclusion: {
    runId: 'run-1',
    summary: 'The gate was removed.',
    findings: [{ level: 'idea', statement: 'No gate remains', evidence: '.github/workflows/build.yml:12' }],
    proposedFix: 'Restore the gate.',
  },
  failureCount: 0,
  lastFailure: null,
  draft: { title: 'Audit challenge on abc1234: fix', body: '## Change' },
  publishedIssueNumber: null,
  resolved: false,
};

describe('renderAudit', () => {
  it('shows the verdict, findings with evidence, fix, run figures and the drafted issue', () => {
    expect(renderAudit(CONCLUDED, { costUsd: 0.5, durationMs: 42_000 })).toEqual([
      'Audit abc1234 (on-demand): challenge',
      'Summary: The gate was removed.',
      'Finding 1 [idea]: No gate remains\n  Evidence: .github/workflows/build.yml:12',
      'Proposed fix: Restore the gate.',
      'Run: $0.5000, 42.0s',
      'Drafted issue: Audit challenge on abc1234: fix',
      '## Change',
    ]);
  });

  it('reports the last failure of an audit without conclusion', () => {
    const failed = { ...CONCLUDED, state: 'auditing' as const, conclusion: null, draft: null, lastFailure: 'timeout' };
    expect(renderAudit(failed, null)).toEqual(['Audit abc1234 (on-demand): auditing', 'Last failure: timeout']);
  });
});
