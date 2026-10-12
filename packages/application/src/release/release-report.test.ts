import { describe, expect, it } from 'vitest';
import { renderReleaseAuditReport, type ReleaseAuditReportInput } from './release-report.ts';

const BLOCKED: ReleaseAuditReportInput = {
  releaseId: 'v1.4.0',
  changes: [
    { sha: '1111111aaaa', message: 'feat: add widget\n\nbody', pullRequestNumber: 10, attribution: { kind: 'factory-merge' } },
    { sha: '2222222bbbb', message: 'fix: patch build', pullRequestNumber: null, attribution: { kind: 'audit', reason: 'direct-push' } },
  ],
  evidence: [
    { number: 10, evidenceComplete: true, recorded: true },
    { number: 11, evidenceComplete: false, recorded: false },
  ],
  audits: [{ commitSha: '2222222bbbb', state: 'challenge', summary: 'No test covers the patch.', resolved: false, issueNumber: 77 }],
  health: [
    { environment: 'staging', name: 'ui', url: 'https://staging.example.com/', passed: true, statusCode: 200, latencyMs: 90, detail: 'HTTP 200' },
    { environment: 'staging', name: 'api', url: 'https://staging.example.com/api/health', passed: false, statusCode: 503, latencyMs: 30, detail: 'HTTP 503' },
  ],
  gate: {
    promotable: false,
    blockingReasons: ['audit challenge is open on commit 2222222bbbb', 'health check api of staging failed'],
  },
};

const GOLDEN_BLOCKED = `# Release audit report: v1.4.0

## Gate
Not promotable.
- audit challenge is open on commit 2222222bbbb
- health check api of staging failed

## Changes
- \`1111111\` feat: add widget (#10, factory)
- \`2222222\` fix: patch build (no pull request, audited (direct-push))

## Evidence
- #10: evidence complete
- #11: no evidence recorded

## Audits
- \`2222222\`: challenge, unresolved, issue #77 - No test covers the patch.

## Health before production
- staging, ui: pass (HTTP 200)
- staging, api: fail (HTTP 503)
`;

describe('renderReleaseAuditReport', () => {
  it('renders the blocked report', () => {
    expect(renderReleaseAuditReport(BLOCKED)).toBe(GOLDEN_BLOCKED);
  });

  it('renders an empty promotable report', () => {
    expect(
      renderReleaseAuditReport({ releaseId: 'v2', changes: [], evidence: [], audits: [], health: [], gate: { promotable: true, blockingReasons: [] } }),
    ).toBe('# Release audit report: v2\n\n## Gate\nPromotable.\n\n## Changes\nnone\n\n## Evidence\nnone\n\n## Audits\nnone\n\n## Health before production\nnone\n');
  });
});
