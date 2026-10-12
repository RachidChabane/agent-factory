import { DEFAULT_PROJECT_CONVENTIONS, type FactoryEventRecord, type ProjectConventions } from '@agent-factory/application';
import { IssueTypology, type IssueSpec } from '@agent-factory/domain';
import { stringify } from 'yaml';
import { parseAgentFactoryConfig, projectOf, type ProjectConfig } from '../../config/agent-factory-config.ts';
import type { ProjectSnapshotContext } from '../snapshot-context.ts';
import { issueCosts, type CostSettings } from '../cost-views.ts';
import { recordedRuns } from '../run-views.ts';
import { indexEvents } from '../event-index.ts';

const START_MS = Date.parse('2026-10-09T08:00:00.000Z');
const STEP_MS = 60_000;
const SHA = {
  base: 'b'.repeat(40),
  checks: 'c'.repeat(40),
  implementation: 'd'.repeat(40),
  evidence: 'e'.repeat(40),
  hotfix: 'f'.repeat(40),
  merge: '1'.repeat(40),
};
const CHECK_SHA256 = 'a'.repeat(64);
const UI_TYPE = 'ui';
const APP_SCOPE = 'app';
/** The default conventions, with user-interface issues scoped to the app. */
const FIXTURE_CONVENTIONS: ProjectConventions = {
  ...DEFAULT_PROJECT_CONVENTIONS,
  typology: new IssueTypology(
    DEFAULT_PROJECT_CONVENTIONS.typology.definitions.map((type) => (type.id === UI_TYPE ? { ...type, commit: { ...type.commit, scope: APP_SCOPE } } : type)),
  ),
};
const ESC = String.fromCharCode(27);
const GATE_LOG = [
  '$ pnpm lint',
  'lint ok',
  '[exit code 0 after 40 ms]',
  '$ pnpm exec playwright test app/e2e/link.spec.ts --reporter=json',
  `${ESC}[32m2 passed${ESC}[39m`,
  '[exit code 0 after 90 ms]',
  '$ pnpm test',
  'full suite output',
  '[exit code 0 after 300 ms]',
].join('\n');

export const FIXTURE_SPEC: IssueSpec = {
  number: 42,
  title: 'Link mockups to their conversation',
  type: 'ui',
  need: 'Operators lose track of which conversation produced a mockup.',
  acceptanceCriteria: ['The mockup header links the conversation.'],
  outOfScope: ['Editing the conversation from the mockup.'],
  expectedProof: 'A Playwright journey with a screenshot of the header.',
  dependsOn: [],
  commitKind: null,
};

const PENDING_SPEC: IssueSpec = { ...FIXTURE_SPEC, number: 43, title: 'Show the mockup author', dependsOn: [42] };

const USAGE = { inputTokens: 1200, outputTokens: 800, cacheReadTokens: 5000, cacheCreationTokens: 300 };

export const PROJECT_ID = 'widgets';
export const GENERATED_AT = new Date('2026-10-09T12:00:00.000Z');

/** The history of one project: its own events, with the subjects it sees, and the runs the installation recorded for it. */
export interface ProjectHistory {
  readonly project: readonly FactoryEventRecord[];
  readonly installation: readonly FactoryEventRecord[];
}

export function projectHistory(): ProjectHistory {
  const project: FactoryEventRecord[] = [];
  const installation: FactoryEventRecord[] = [];
  let sequence = 0;
  const record = (list: FactoryEventRecord[], type: string, subject: string, payload: unknown): void => {
    list.push({ sequence: sequence + 1, occurredAt: new Date(START_MS + sequence * STEP_MS), type, subject, payload });
    sequence += 1;
  };
  const add = (type: string, subject: string, payload: unknown): void => {
    record(subject.startsWith('run/') ? installation : project, type, subject, payload);
  };
  const records = { get length(): number { return sequence; } };
  const issue = 'issue/42';
  const transition = (from: string | null, to: string): void => add('issue.transitioned', issue, { from, to, reason: `to ${to}` });
  const run = (id: string, role: string, attempt: number, costUsd: number): void => {
    add('pipeline.agent-run-started', issue, { role, runId: id, model: 'sonnet', effort: 'high', resumeSessionId: null });
    add('run.started', `run/${id}`, {
      id,
      role,
      model: 'sonnet',
      effort: 'high',
      status: 'running',
      outcome: null,
      subject: { kind: 'issue', id: '42' },
      attempt,
      currentTool: null,
      branch: 'factory/42-link-mockups',
      startedAt: new Date(START_MS + records.length * STEP_MS).toISOString(),
      endedAt: null,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd: 0,
      turns: 0,
      maxTurns: 80,
      maxBudgetUsd: 5,
      lastLine: null,
      logLength: 0,
      subagents: [],
      pendingQuestion: null,
      account: 'primary',
      project: PROJECT_ID,
    });
    add('run.finished', `run/${id}`, {
      status: 'succeeded',
      outcome: 'success',
      endedAt: new Date(START_MS + (records.length + 1) * STEP_MS).toISOString(),
      usage: USAGE,
      costUsd,
      turns: 12,
      durationMs: 60_000,
      sessionId: `session-${id}`,
      account: 'primary',
      detail: null,
    });
    add('pipeline.agent-run-finished', issue, {
      role,
      runId: id,
      sessionId: `session-${id}`,
      outcome: 'success',
      costUsd,
      durationMs: 60_000,
      turns: 12,
      gateBlocks: 0,
      rawLogPath: `/runs/${id}/stream.jsonl`,
    });
  };
  add('request.received', 'request/req-1', {
    id: 'req-1',
    title: 'Link mockups to their conversation',
    requester: 'Dana',
    channel: 'cli',
    body: '# Link mockups to their conversation\nOperators get lost between mockups and chats.',
    attachments: [{ name: 'header.png', path: 'images/header.png', mediaType: 'image/png' }],
    receivedAt: new Date(START_MS).toISOString(),
  });
  add('request.challenge-started', 'request/req-1', { runId: 'run-challenger' });
  add('request.challenged', 'request/req-1', {
    runId: 'run-challenger',
    completedAt: new Date(START_MS + 2 * STEP_MS).toISOString(),
    summary: 'One sound item.',
    items: [
      {
        id: 'item-1',
        title: 'Link the conversation',
        verdict: 'keep',
        currentState: 'The header shows no link.',
        intent: 'Operators find the source conversation.',
        idea: 'A header link answers it.',
        method: 'A Nuxt link in the header component.',
        reason: 'Small and observable.',
        question: null,
        sources: [{ label: 'header', reference: 'app/pages/mockup.vue:1' }],
      },
    ],
    specs: [
      {
        id: 'spec-1',
        itemIds: ['item-1'],
        title: FIXTURE_SPEC.title,
        type: FIXTURE_SPEC.type,
        need: FIXTURE_SPEC.need,
        acceptanceCriteria: [...FIXTURE_SPEC.acceptanceCriteria],
        outOfScope: [...FIXTURE_SPEC.outOfScope],
        expectedProof: FIXTURE_SPEC.expectedProof,
        path: 'specs/1-link-mockups-to-their-conversation.md',
        problems: [],
      },
    ],
    reply: 'We will add the link.',
    reportPath: 'report.md',
    replyPath: 'reply.md',
  });
  add('request.issue-created', 'request/req-1', { specId: 'spec-1', issueNumber: 42 });
  transition(null, 'spec-draft');
  add('pipeline.spec-captured', issue, { spec: FIXTURE_SPEC, branch: 'factory/42-link-mockups' });
  transition('spec-draft', 'spec-validated');
  add('pipeline.worktree-acquired', issue, { path: '/pool/slot-0', branch: 'factory/42-link-mockups', baseSha: SHA.base });
  transition('spec-validated', 'authoring-checks');
  add('pipeline.workspace-prepared', issue, { logName: 'workspace-setup.log' });
  run('run-author', 'acceptance-author', 0, 0.4);
  add('pipeline.acceptance-authored', issue, {
    manifest: {
      runner: 'playwright',
      checks: [{ criterion: 1, paths: ['app/e2e/link.spec.ts'], description: 'the header links the conversation' }],
      command: ['pnpm', 'exec', 'playwright', 'test', 'app/e2e/link.spec.ts'],
      evidence: ['app/test-results/link.png'],
      score: null,
    },
  });
  add('pipeline.before-proof-recorded', issue, {
    checksExpressible: true,
    exitCode: 1,
    checksFailedOnBase: true,
    scoreReport: null,
    baseScore: null,
    logName: 'before-proof.log',
    runner: 'playwright',
    tests: [{ id: 'app/e2e/link.spec.ts::header links the conversation', file: 'app/e2e/link.spec.ts', criteria: [1], outcome: 'failed', failureKind: 'assertion', failureMessage: 'no link' }],
    evaluation: { valid: true, kind: 'fails-on-base' },
    evidence: [{ path: 'app/test-results/link.png', caption: 'header', cachedPath: 'before/app/test-results/link.png' }],
  });
  add('pipeline.checks-frozen', issue, { checks: [{ path: 'app/e2e/link.spec.ts', sha256: CHECK_SHA256 }], commitSha: SHA.checks });
  transition('authoring-checks', 'checks-frozen');
  transition('checks-frozen', 'implementing');
  run('run-implementer', 'implementer', 0, 1.6);
  add('pipeline.implementer-attempt-finished', issue, {
    attempt: 0,
    mode: 'initial',
    model: 'sonnet',
    effort: 'high',
    runId: 'run-implementer',
    sessionId: 'session-run-implementer',
    outcome: 'success',
    gateBlocks: 0,
    finalTextTail: 'Done.',
  });
  transition('implementing', 'gating');
  add('pipeline.gate-completed', issue, {
    attempt: 0,
    result: { passed: true, steps: [{ name: 'lint', outcome: 'passed', detail: 'lint ok' }] },
    violations: [],
    logName: 'gate-attempt-1.log',
    tests: [{ id: 'app/e2e/link.spec.ts::header links the conversation', outcome: 'passed' }],
    scoreReport: null,
    evidence: [{ path: 'app/test-results/link.png', caption: 'header', cachedPath: 'after/app/test-results/link.png' }],
  });
  transition('gating', 'reviewing');
  run('run-reviewer', 'reviewer', 0, 0.3);
  add('pipeline.review-completed', issue, {
    attempt: 0,
    runId: 'run-reviewer',
    findings: [{ severity: 'non-blocking', category: 'correctness', file: 'app/pages/mockup.vue', line: 3, summary: 'Add a title attribute.' }],
  });
  transition('reviewing', 'producing-evidence');
  add('pipeline.implementation-committed', issue, { sha: SHA.implementation });
  add('pipeline.evidence-committed', issue, {
    sha: SHA.evidence,
    bundle: {
      directory: '.evidence/42',
      beforeLogPath: '.evidence/42/before.log',
      afterLogPath: '.evidence/42/after.log',
      diffStatPath: '.evidence/42/diff-stat.md',
      files: [
        { phase: 'before', sourcePath: 'app/test-results/link.png', bundlePath: '.evidence/42/before/link.png', caption: 'header' },
        { phase: 'after', sourcePath: 'app/test-results/link.png', bundlePath: '.evidence/42/after/link.png', caption: 'header' },
      ],
      missing: [],
    },
    changes: [
      { path: 'app/pages/mockup.vue', added: 4, removed: 1 },
      { path: 'app/e2e/link.spec.ts', added: 12, removed: 0 },
    ],
  });
  add('pipeline.branch-pushed', issue, { headSha: SHA.evidence });
  add('pr.opened', 'pr/100', { number: 100, evidenceComplete: true, issueNumber: 42, headSha: SHA.evidence });
  add('pipeline.pull-request-opened', issue, { number: 100, url: 'https://github.com/acme/widgets/pull/100', headSha: SHA.evidence });
  transition('producing-evidence', 'pr-open');
  const asking = 'issue/44';
  const askingSpec = { ...FIXTURE_SPEC, number: 44, title: 'List the release owners', type: 'docs' };
  add('issue.transitioned', asking, { from: null, to: 'spec-draft', reason: 'taken' });
  add('pipeline.spec-captured', asking, { spec: askingSpec, branch: 'factory/44-list-the-release-owners' });
  for (const [from, to] of [['spec-draft', 'spec-validated'], ['spec-validated', 'authoring-checks'], ['authoring-checks', 'checks-frozen'], ['checks-frozen', 'implementing']]) {
    add('issue.transitioned', asking, { from, to, reason: `to ${to}` });
  }
  add('pipeline.worktree-acquired', asking, { path: '/pool/slot-1', branch: 'factory/44-list-the-release-owners', baseSha: SHA.base });
  add('pipeline.agent-run-started', asking, { role: 'implementer', runId: 'run-asking', model: 'sonnet', effort: 'high', resumeSessionId: null });
  add('run.started', 'run/run-asking', {
    id: 'run-asking',
    role: 'implementer',
    model: 'sonnet',
    effort: 'high',
    status: 'running',
    outcome: null,
    subject: { kind: 'issue', id: '44' },
    attempt: 0,
    currentTool: null,
    branch: 'factory/44-list-the-release-owners',
    startedAt: new Date(START_MS + records.length * STEP_MS).toISOString(),
    endedAt: null,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    costUsd: 0,
    turns: 0,
    maxTurns: 80,
    maxBudgetUsd: 5,
    lastLine: null,
    logLength: 0,
    subagents: [],
    pendingQuestion: null,
    account: 'primary',
    project: PROJECT_ID,
  });
  add('run.finished', 'run/run-asking', {
    status: 'waiting',
    outcome: 'decision-requested',
    endedAt: new Date(START_MS + records.length * STEP_MS).toISOString(),
    usage: USAGE,
    costUsd: 0.2,
    turns: 4,
    durationMs: 60_000,
    sessionId: 'session-run-asking',
    account: 'primary',
    detail: null,
  });
  add('pipeline.agent-run-finished', asking, {
    role: 'implementer',
    runId: 'run-asking',
    sessionId: 'session-run-asking',
    outcome: 'decision-requested',
    costUsd: 0.2,
    durationMs: 60_000,
    turns: 4,
    gateBlocks: 0,
    rawLogPath: '/runs/run-asking/stream.jsonl',
  });
  add('pipeline.implementer-attempt-finished', asking, {
    attempt: 0,
    mode: 'initial',
    model: 'sonnet',
    effort: 'high',
    runId: 'run-asking',
    sessionId: 'session-run-asking',
    outcome: 'decision-requested',
    gateBlocks: 0,
    finalTextTail: 'I need a decision.',
    decisionRequest: 'Should the page list the owners by name or by team?',
  });
  add('issue.transitioned', asking, { from: 'implementing', to: 'needs-human', reason: 'the implementer stopped to ask for a human decision' });
  add('audit.cursor.advanced', 'watcher/main', { branch: 'main', sha: SHA.base });
  add('audit.detected', `audit/${SHA.hotfix}`, {
    commitSha: SHA.hotfix,
    reason: 'direct-push',
    commitMessage: 'fix: patch the build',
    authorLogin: 'riley',
    pullRequestNumber: null,
  });
  add('audit.started', `audit/${SHA.hotfix}`, { runId: 'run-auditor' });
  add('audit.concluded', `audit/${SHA.hotfix}`, {
    runId: 'run-auditor',
    verdict: 'challenge',
    summary: 'No test covers the patch.',
    findings: [{ level: 'method', statement: 'no test covers the change', evidence: 'ci.yaml:3' }],
    proposedFix: 'add a test',
  });
  add('audit.issue.drafted', `audit/${SHA.hotfix}`, { title: 'Audit: patch the build', body: 'body' });
  add('release.tags-seeded', 'release/watch', { tags: [{ name: 'app-v1.2.0', sha: SHA.base }] });
  add('release.detected', 'release/app-v1.3.0', {
    releaseId: 'app-v1.3.0',
    source: 'tag',
    ref: 'app-v1.3.0',
    baseSha: SHA.base,
    headSha: SHA.merge,
    pullRequestNumber: null,
    title: 'app-v1.3.0',
  });
  add('release.evaluated', 'release/app-v1.3.0', {
    releaseId: 'app-v1.3.0',
    promotable: false,
    blockingReasons: [`audit challenge is open on commit ${SHA.hotfix}`],
    commitShas: [SHA.hotfix, SHA.merge],
    report: '# Release audit report: app-v1.3.0\n',
    commits: [
      { sha: SHA.hotfix, message: 'fix: patch the build', author: 'riley', pullRequestNumber: null, attribution: 'audit' },
      { sha: SHA.merge, message: 'feat(app): link mockups to their conversation (#100)', author: 'factory', pullRequestNumber: 100, attribution: 'factory-merge' },
    ],
    health: [{ environment: 'staging', name: 'web', passed: true, detail: 'HTTP 200' }],
  });
  add('budget.rate-limit-observed', 'budget/primary', {
    account: 'primary',
    snapshots: [{ window: 'seven_day', utilization: 0.42, resetsAt: '2026-10-14T00:00:00.000Z' }],
  });
  add('scheduler.paused', 'daemon', { cause: 'operator', reason: 'paused by alex', resumesAt: null });
  add('issue.paused', 'issue/43', { reason: 'waits for the design review' });
  return { project, installation };
}

export const PROJECT: ProjectConfig = projectOf(
  parseAgentFactoryConfig(
    stringify({
      version: 1,
      projects: [
        {
          id: PROJECT_ID,
          name: 'Widgets',
          forge: { kind: 'github', repository: 'acme/widgets' },
          commitIdentity: { name: 'Bot', email: 'bot@example.invalid' },
          issueTypes: FIXTURE_CONVENTIONS.typology.definitions.map((type) => ({
            id: type.id,
            label: type.label,
            proof: type.proof,
            checks: type.checks,
            commit: { type: type.commit.type, ...(type.commit.scope === null ? {} : { scope: type.commit.scope }) },
          })),
          delivery: {
            release: { kind: 'tags' },
            environments: [
              { name: 'staging', promotion: 'automatic', health: [{ name: 'web', url: 'https://staging.widgets.example.com/healthz' }] },
              { name: 'production', promotion: 'manual', production: true, workflowUrl: 'https://github.com/acme/widgets/actions/workflows/production.yaml' },
            ],
          },
        },
      ],
    }),
    '/home/operator/.agent-factory',
    '/home/operator/.agent-factory/config.yaml',
    '/home/operator',
  ),
  PROJECT_ID,
);

export function projectContext(history: ProjectHistory = projectHistory(), overrides: Partial<ProjectSnapshotContext> = {}): ProjectSnapshotContext {
  return {
    generatedAt: GENERATED_AT,
    project: PROJECT_ID,
    conventions: FIXTURE_CONVENTIONS,
    links: {
      issue: (number) => `https://github.com/acme/widgets/issues/${number}`,
      forge: (url) => url,
      evidence: (number, path) => `/api/projects/${PROJECT_ID}/evidence/${number}/${path}`,
      requestAttachment: (id, path) => `/api/projects/${PROJECT_ID}/requests/${id}/${path}`,
    },
    pendingIssues: [{ spec: PENDING_SPEC, validated: true, createdAt: new Date('2026-10-09T09:30:00.000Z'), updatedAt: new Date('2026-10-09T10:00:00.000Z') }],
    pullRequestChecks: new Map([[100, { value: [{ name: 'ci', conclusion: 'success', url: 'https://github.com/acme/widgets/actions/runs/1' }], readAt: new Date('2026-10-09T11:59:00.000Z'), error: null }]]),
    pullRequestTitles: new Map(),
    logs: new Map([['42/before-proof.log', '2 failed: header has no conversation link'], ['42/gate-attempt-1.log', GATE_LOG]]),
    productionWorkflowUrl: 'https://github.com/acme/widgets/actions/workflows/production.yaml',
    issueCosts: issueCosts(recordedRuns(indexEvents(history.installation)), PROJECT_ID),
    changedFiles: new Map(),
    ...overrides,
  };
}

export const COST_SETTINGS: CostSettings = { generatedAt: GENERATED_AT, billing: ['subscription'], dailyCap: { kind: 'none' }, perRunCapUsd: null };
