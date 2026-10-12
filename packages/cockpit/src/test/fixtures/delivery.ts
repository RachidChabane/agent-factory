import type { AuditView, Deployment, EnvironmentView, ReleaseView, WorkflowRun } from '../../contract/index.ts';
import type { FixtureClock } from './time.ts';
import { actionsUrl, GITHUB_URL } from './time.ts';

const PRODUCTION_WORKFLOW_URL = `${GITHUB_URL}/actions/workflows/deploy-prod.yml`;
export const AUDITED_COMMIT_SHA = 'e27b4d90a1c53f86b0d2e9a7c4f15830d6b9a2e1';
const KEEP_COMMIT_SHA = '5f08c3a1d9e4b72a6c0f31d8e5a97b24c1d60f83';
const DEPENDENCY_COMMIT_SHA = 'a1d86e3f0c52b974d8e1a60f3c7b95d2e8f41a07';

export function buildWorkflows(clock: FixtureClock): WorkflowRun[] {
  const run = (
    id: string,
    workflow: string,
    title: string,
    branch: string,
    sha: string,
    trigger: WorkflowRun['trigger'],
    minutesAgo: number,
    status: WorkflowRun['status'],
    conclusion: WorkflowRun['conclusion'],
    durationSeconds: number | null,
    actor: string,
  ): WorkflowRun => ({
    id,
    workflow,
    title,
    branch,
    sha,
    trigger,
    status,
    conclusion,
    actor,
    startedAt: clock.minutesAgo(minutesAgo),
    durationMs: durationSeconds === null ? null : durationSeconds * 1000,
    url: actionsUrl(id),
  });
  return [
    run('9182736452', 'CI', 'Expose discount totals on the order history endpoint', 'factory/224-order-discount-totals', '3d7a0c5', 'pull_request', 6, 'in_progress', null, null, 'storefront-release[bot]'),
    run('9182736000', 'Nightly skill evaluations', 'product-brief, order-email, support-reply', 'main', 'c91e5a7', 'schedule', 312, 'completed', 'success', 1_634, 'github-actions'),
    run('9182730004', 'CI', 'Display the savings of each order in the history list', 'factory/223-history-savings-badges', 'b5e1296', 'pull_request', 1_020, 'completed', 'success', 412, 'storefront-release[bot]'),
    run('9182729001', 'Deploy DEV', 'Deploy main to DEV', 'main', 'c91e5a7', 'push', 1_310, 'completed', 'success', 286, 'github-actions'),
    run('9182728800', 'CI', 'docs: fix typo in the local development guide', 'main', '5f08c3a', 'push', 2_460, 'completed', 'success', 391, 'amorgan'),
    run('9182728001', 'Deploy PREP', 'Deploy storefront-v2.3.1-rc.1 to PREP', 'release/storefront-v2.3.1', 'e27b4d9', 'release', 1_560, 'completed', 'success', 344, 'storefront-release[bot]'),
    run('9182727700', 'CI', 'Tone update for the product-brief skill', 'sam/brief-tone', 'e27b4d9', 'pull_request', 1_640, 'completed', 'success', 377, 'sokafor'),
    run('9182727000', 'Deploy DEV', 'Deploy main to DEV', 'main', 'e27b4d9', 'push', 1_700, 'completed', 'failure', 162, 'github-actions'),
    run('9182726000', 'Deploy PROD', 'Deploy storefront-v2.3.0 to PROD', 'release/storefront-v2.3.0', 'c4f7a92', 'workflow_dispatch', 8_700, 'completed', 'success', 498, 'amorgan'),
    run('9182725000', 'CI', 'Make the product-brief skill state measurable specifications', 'factory/221-product-brief-specifications', '8a46f0d', 'pull_request', 2_900, 'completed', 'success', 856, 'storefront-release[bot]'),
  ];
}

function deployment(clock: FixtureClock, id: string, version: string, sha: string, minutesAgo: number, actor: string, outcome: Deployment['outcome']): Deployment {
  return { id, version, sha, deployedAt: clock.minutesAgo(minutesAgo), actor, outcome, workflowUrl: actionsUrl(id) };
}

export function buildEnvironments(clock: FixtureClock): EnvironmentView[] {
  const devHistory = [
    deployment(clock, '9182729001', 'main-c91e5a7', 'c91e5a7', 1_305, 'github-actions', 'success'),
    deployment(clock, '9182727000', 'main-e27b4d9', 'e27b4d9', 1_697, 'github-actions', 'failure'),
    deployment(clock, '9182726500', 'main-5f08c3a', '5f08c3a', 2_455, 'github-actions', 'success'),
    deployment(clock, '9182726100', 'main-8a46f0d', '8a46f0d', 2_870, 'github-actions', 'success'),
  ];
  const prepHistory = [
    deployment(clock, '9182728001', 'storefront-v2.3.1-rc.1', 'e27b4d9', 1_555, 'storefront-release[bot]', 'success'),
    deployment(clock, '9182724000', 'storefront-v2.3.0-rc.2', 'c4f7a92', 9_400, 'storefront-release[bot]', 'success'),
    deployment(clock, '9182723000', 'storefront-v2.3.0-rc.1', 'f13a8d6', 10_100, 'storefront-release[bot]', 'failure'),
  ];
  const prodHistory = [
    deployment(clock, '9182726000', 'storefront-v2.3.0', 'c4f7a92', 8_690, 'amorgan', 'success'),
    deployment(clock, '9182720000', 'storefront-v2.2.4', 'd5a09e1', 18_900, 'amorgan', 'success'),
  ];
  return [
    { name: 'dev', url: 'https://storefront-dev.example.com', status: 'healthy', current: devHistory[0] ?? null, history: devHistory },
    { name: 'prep', url: 'https://storefront-prep.example.com', status: 'healthy', current: prepHistory[0] ?? null, history: prepHistory },
    { name: 'prod', url: 'https://storefront-prod.example.com', status: 'healthy', current: prodHistory[0] ?? null, history: prodHistory },
  ];
}

export function buildReleases(clock: FixtureClock): ReleaseView[] {
  return [
    {
      id: 'storefront-v2.4.0',
      state: 'open',
      branch: 'main',
      createdAt: clock.hoursAgo(20),
      cutAt: null,
      promotedAt: null,
      verifiedAt: null,
      commits: [
        {
          sha: DEPENDENCY_COMMIT_SHA,
          message: 'chore(deps): bump date-fns to 4.2.0',
          author: 'renovate[bot]',
          pullRequestNumber: 310,
          issueNumber: null,
          attribution: 'audit',
          auditId: 'A-16',
          evidenceComplete: null,
        },
      ],
      gate: { promotable: false, blockingReasons: [], evaluatedAt: null },
      prepHealth: [],
      productionWorkflowUrl: PRODUCTION_WORKFLOW_URL,
      report: '',
    },
    {
      id: 'storefront-v2.3.1',
      state: 'blocked',
      branch: 'release/storefront-v2.3.1',
      createdAt: clock.daysAgo(2),
      cutAt: clock.hoursAgo(26.5),
      promotedAt: null,
      verifiedAt: null,
      commits: [
        {
          sha: '8a46f0d3c27e5b19d4a0e68c3f1b72d95e0a4c37',
          message: 'feat(assistant): make the product-brief skill state measurable specifications (#309)',
          author: 'storefront-release[bot]',
          pullRequestNumber: 309,
          issueNumber: 221,
          attribution: 'factory-merge',
          auditId: null,
          evidenceComplete: true,
        },
        {
          sha: AUDITED_COMMIT_SHA,
          message: 'Tone update for the product-brief skill (#305)',
          author: 'sokafor',
          pullRequestNumber: 305,
          issueNumber: null,
          attribution: 'audit',
          auditId: 'A-15',
          evidenceComplete: null,
        },
        {
          sha: KEEP_COMMIT_SHA,
          message: 'docs: fix typo in the local development guide',
          author: 'amorgan',
          pullRequestNumber: null,
          issueNumber: null,
          attribution: 'audit',
          auditId: 'A-14',
          evidenceComplete: null,
        },
        {
          sha: '6e0b8a35d1f9c47e2a83b6d05c1f7e94a2d3b860',
          message: 'feat(web): show the delivery status in the order page header (#307)',
          author: 'storefront-release[bot]',
          pullRequestNumber: 307,
          issueNumber: 219,
          attribution: 'factory-merge',
          auditId: null,
          evidenceComplete: true,
        },
      ],
      gate: {
        promotable: false,
        blockingReasons: [`audit challenge is open on commit ${AUDITED_COMMIT_SHA}`],
        evaluatedAt: clock.hoursAgo(25),
      },
      prepHealth: [
        { name: 'api /health', passed: true, detail: '200 in 36 ms' },
        { name: 'worker readiness', passed: true, detail: '3/3 replicas ready' },
        { name: 'error rate below 2 %', passed: true, detail: '0.38 % over 30 min' },
        { name: 'p95 latency below 3 s', passed: true, detail: '1.92 s' },
      ],
      productionWorkflowUrl: PRODUCTION_WORKFLOW_URL,
      report: [
        '# Release storefront-v2.3.1',
        '',
        '## Changes',
        '- #309 product-brief states measurable specifications — factory, evidence complete',
        '- #307 delivery status in the order page header — factory, evidence complete',
        '- e27b4d9 Tone update for the product-brief skill (#305) — audited: challenge (A-15)',
        '- 5f08c3a docs typo — audited: keep (A-14)',
        '',
        '## Gate',
        '- blocked: audit challenge is open on commit e27b4d9',
      ].join('\n'),
    },
    {
      id: 'storefront-v2.3.0',
      state: 'verified',
      branch: 'release/storefront-v2.3.0',
      createdAt: clock.daysAgo(8),
      cutAt: clock.daysAgo(7),
      promotedAt: clock.daysAgo(6.04),
      verifiedAt: clock.daysAgo(5.9),
      commits: [
        {
          sha: 'c4f7a921e60d3b58a9e1d247f0c85b3a6d19e7f2',
          message: 'feat(web): keep the cart when the customer signs in (#303)',
          author: 'storefront-release[bot]',
          pullRequestNumber: 303,
          issueNumber: 218,
          attribution: 'factory-merge',
          auditId: null,
          evidenceComplete: true,
        },
        {
          sha: 'f13a8d60b2e975c4d1a0e3b7968f25c4a71d0e39',
          message: 'fix(api): persist the cart on the server for signed-in customers (#301)',
          author: 'storefront-release[bot]',
          pullRequestNumber: 301,
          issueNumber: 217,
          attribution: 'factory-merge',
          auditId: null,
          evidenceComplete: true,
        },
      ],
      gate: { promotable: true, blockingReasons: [], evaluatedAt: clock.daysAgo(6.2) },
      prepHealth: [
        { name: 'api /health', passed: true, detail: '200 in 44 ms' },
        { name: 'worker readiness', passed: true, detail: '3/3 replicas ready' },
      ],
      productionWorkflowUrl: PRODUCTION_WORKFLOW_URL,
      report: '# Release storefront-v2.3.0\n\nAll changes went through the factory with complete evidence.',
    },
  ];
}

export function buildAudits(clock: FixtureClock): AuditView[] {
  return [
    {
      id: 'A-16',
      commitSha: DEPENDENCY_COMMIT_SHA,
      reason: 'bot-author',
      commitMessage: 'chore(deps): bump date-fns to 4.2.0',
      authorLogin: 'renovate[bot]',
      authorName: 'Renovate',
      pullRequestNumber: 310,
      branch: 'renovate/date-fns-4.x',
      state: 'auditing',
      detectedAt: clock.minutesAgo(7),
      changedFiles: ['web/package.json', 'pnpm-lock.yaml'],
      suggestedType: 'dependencies',
      releaseId: 'storefront-v2.4.0',
      conclusion: null,
      failureCount: 0,
      lastFailure: null,
      draft: null,
      publishedIssueNumber: null,
      resolved: false,
      resolutionNote: null,
    },
    {
      id: 'A-15',
      commitSha: AUDITED_COMMIT_SHA,
      reason: 'branch-not-factory',
      commitMessage: 'Tone update for the product-brief skill (#305)',
      authorLogin: 'sokafor',
      authorName: 'Sam Okafor',
      pullRequestNumber: 305,
      branch: 'sam/brief-tone',
      state: 'challenge',
      detectedAt: clock.hoursAgo(26.2),
      changedFiles: ['assistant/skills/product-brief/SKILL.md'],
      suggestedType: 'prompt',
      releaseId: 'storefront-v2.3.1',
      conclusion: {
        runId: 'run_e7d4a1',
        summary: 'Changes the tone of every generated product brief without an evaluation covering tone, against the neutral register decided in ADR-0012.',
        findings: [
          {
            level: 'intent',
            statement: 'The need is stated in the pull request body: customers find the briefs "too dry". No linked issue or request records it.',
            evidence: 'Body of PR #305; no issue linked',
          },
          {
            level: 'idea',
            statement: 'An enthusiastic tone with exclamation marks contradicts the decision to keep briefs neutral and factual next to technical datasheets.',
            evidence: 'docs/adr/0012-product-brief-register.md:14',
          },
          {
            level: 'method',
            statement:
              'Skill instructions changed product behaviour with no evaluation: assistant/evals/product-brief has no tone case. Example: the brief for the "cordless drill" case now opens with "Get ready to drill like a pro!".',
            evidence: 'assistant/skills/product-brief/SKILL.md:22–27; assistant/evals/product-brief/',
          },
        ],
        proposedFix:
          'Revert the tone section, then open a skill-prompt request: add tone cases to the product-brief evaluation, agree on the register with product, and change the skill through the factory so the gate measures the effect.',
      },
      failureCount: 0,
      lastFailure: null,
      draft: {
        title: 'Audit A-15: product-brief tone changed without evaluation (#305)',
        body: [
          'Commit e27b4d9 (PR #305, branch `sam/brief-tone`) reached `main` without going through the factory.',
          '',
          '**Findings**',
          '- Intent: only stated in the PR body (“briefs feel too dry”).',
          '- Idea: goes against ADR-0012, which asks for a neutral, factual register.',
          '- Method: no evaluation case covers tone, yet every generated brief changes.',
          '',
          '**Proposed fix**: revert the tone section, then request the change again as a skill-prompt issue that ships with tone evaluation cases.',
          '',
          'Release storefront-v2.3.1 is not promotable until this audit is resolved.',
        ].join('\n'),
      },
      publishedIssueNumber: null,
      resolved: false,
      resolutionNote: null,
    },
    {
      id: 'A-14',
      commitSha: KEEP_COMMIT_SHA,
      reason: 'direct-push',
      commitMessage: 'docs: fix typo in the local development guide',
      authorLogin: 'amorgan',
      authorName: 'Alex Morgan',
      pullRequestNumber: null,
      branch: null,
      state: 'keep',
      detectedAt: clock.hoursAgo(41),
      changedFiles: ['docs/development/local-setup.md'],
      suggestedType: 'docs',
      releaseId: 'storefront-v2.3.1',
      conclusion: {
        runId: 'run_e7d4a0',
        summary: 'Documentation typo fix; behaviour is unchanged.',
        findings: [],
        proposedFix: null,
      },
      failureCount: 0,
      lastFailure: null,
      draft: null,
      publishedIssueNumber: null,
      resolved: false,
      resolutionNote: null,
    },
  ];
}
