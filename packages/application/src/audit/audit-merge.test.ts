import { describe, expect, it } from 'vitest';
import { attributionRules, DEFAULT_PROJECT_CONVENTIONS } from '../conventions/project-conventions.ts';
import { loadAudit } from './audit-projection.ts';
import { MarkdownAuditIssueRenderer } from './audit-issue-renderer.ts';
import { auditMerge, auditPendingMerges, AUDITOR_ROLE, type AuditDependencies, type AuditRunSettings } from './audit-merge.ts';
import { AuditIssueNotDraftedError, AuditNotFoundError } from './errors.ts';
import { auditIssueLabels, publishAuditIssue, resolveAudit } from './publish-audit-issue.ts';
import { scanNewMerges } from './watch-merges.ts';
import {
  FakeGitHubGateway,
  InMemoryEventStore,
  ScriptedHarness,
  StubPromptCatalog,
  commit,
  runResult,
  verdictAnswer,
} from './testing/fakes.ts';
import type { AgentRunResult } from '../ports.ts';
import { MAX_DIFF_CHARACTERS } from './change-context.ts';

const SETTINGS: AuditRunSettings = {
  repository: 'example-org/storefront',
  model: 'sonnet',
  effort: 'medium',
  workingDirectory: '/checkout',
  maxBudgetUsd: 2,
  maxTurns: 30,
  timeoutMs: 600_000,
  appendSystemPrompt: '',
};

async function setup(script: readonly (AgentRunResult | Error)[], commits = [commit({ sha: 'a1', message: 'Direct fix' })]) {
  const events = new InMemoryEventStore();
  const github = new FakeGitHubGateway();
  github.history.push(...commits);
  await scanNewMerges({ events, github }, { branch: 'main', startSha: null, rules: attributionRules(DEFAULT_PROJECT_CONVENTIONS) });
  const harness = new ScriptedHarness(script);
  let runCounter = 0;
  const dependencies: AuditDependencies = {
    events,
    github,
    harness,
    prompts: new StubPromptCatalog(),
    issueRenderer: new MarkdownAuditIssueRenderer(),
    nextRunId: () => `run-${(runCounter += 1)}`,
    settings: SETTINGS,
  };
  return { events, github, harness, dependencies };
}

describe('auditMerge', () => {
  it('runs the read-only auditor with the rendered prompt and keeps a sound change', async () => {
    const { events, harness, dependencies } = await setup([runResult({ finalText: verdictAnswer('keep') })]);
    const outcome = await auditMerge(dependencies, 'a1');
    expect(outcome).toEqual({ status: 'concluded', auditId: 'a1', verdict: 'keep', issueDrafted: false });
    expect(events.typesOf('audit/')).toEqual(['audit.detected', 'audit.started', 'audit.concluded']);
    const [request] = harness.requests;
    expect(request).toMatchObject({ role: AUDITOR_ROLE, runId: 'run-1', workingDirectory: '/checkout', gateCommand: null, frozenChecks: [] });
    expect(request?.prompt).toContain('repository=example-org/storefront');
    expect(request?.prompt).toContain('Commit: a1');
    expect(request?.prompt).toContain('none (the commit reached the branch without a pull request)');
    expect(request?.prompt).toContain('diff=diff of a1');
    expect((await loadAudit(events, 'a1'))?.state).toBe('keep');
  });

  it.each(['challenge', 'rewrite'] as const)('drafts but does not publish an issue for %s', async (verdict) => {
    const { events, github, dependencies } = await setup([runResult({ finalText: verdictAnswer(verdict) })]);
    const outcome = await auditMerge(dependencies, 'a1');
    expect(outcome).toMatchObject({ status: 'concluded', verdict, issueDrafted: true });
    expect(events.typesOf('audit/')).toEqual(['audit.detected', 'audit.started', 'audit.concluded', 'audit.issue.drafted']);
    const audit = await loadAudit(events, 'a1');
    expect(audit?.state).toBe(verdict);
    expect(audit?.draft?.title).toContain(`Audit ${verdict}`);
    expect(github.createdIssues).toEqual([]);
  });

  it('includes the pull request context when one exists', async () => {
    const pullRequestCommit = commit({ sha: 'p1', pullRequestNumber: 9, pullRequestBranch: 'feature/x', pullRequestLabels: [] });
    const { github, harness, dependencies } = await setup([runResult({ finalText: verdictAnswer('keep') })], [pullRequestCommit]);
    github.pullRequests.set(9, { number: 9, title: 'Add widget', body: 'Because users asked.', authorLogin: 'bob', state: 'merged' });
    await auditMerge(dependencies, 'p1');
    expect(harness.requests[0]?.prompt).toContain('#9 Add widget');
    expect(harness.requests[0]?.prompt).toContain('Because users asked.');
  });

  it('tells the auditor when the commit cites a pull request that has no record', async () => {
    const merge = commit({ sha: 'm1', message: 'Merge pull request #271 from example-org/roadmap' });
    const { harness, dependencies } = await setup([runResult({ finalText: verdictAnswer('keep') })], [merge]);
    await auditMerge(dependencies, 'm1');
    const prompt = harness.requests[0]?.prompt ?? '';
    expect(prompt).toContain('no pull request record is linked to the commit; its message cites #271');
    expect(prompt).not.toContain('without a pull request');
  });

  it('truncates an oversized diff', async () => {
    const { github, harness, dependencies } = await setup([runResult({ finalText: verdictAnswer('keep') })]);
    github.diffs.set('a1', { diff: 'x'.repeat(MAX_DIFF_CHARACTERS + 10), changedFiles: ['big.ts'] });
    await auditMerge(dependencies, 'a1');
    expect(harness.requests[0]?.prompt).toContain('[diff truncated: 10 characters omitted]');
  });

  it('keeps the audit auditing and records an error when the output is malformed', async () => {
    const { events, github, dependencies } = await setup([runResult({ finalText: 'I could not decide.' })]);
    const outcome = await auditMerge(dependencies, 'a1');
    expect(outcome).toMatchObject({ status: 'failed', auditId: 'a1' });
    expect(events.typesOf('audit/')).toEqual(['audit.detected', 'audit.started', 'audit.failed']);
    const audit = await loadAudit(events, 'a1');
    expect(audit).toMatchObject({ state: 'auditing', failureCount: 1 });
    expect(audit?.lastFailure).toContain('no fenced json block');
    expect(github.createdIssues).toEqual([]);
  });

  it('records a failure when the run does not succeed or the harness throws', async () => {
    const { events, dependencies } = await setup([runResult({ outcome: 'timeout' }), new Error('spawn failed')]);
    expect(await auditMerge(dependencies, 'a1')).toMatchObject({ status: 'failed', reason: 'the run ended with outcome timeout' });
    expect(await auditMerge(dependencies, 'a1')).toMatchObject({ status: 'failed', reason: 'the run failed: spawn failed' });
    expect((await loadAudit(events, 'a1'))).toMatchObject({ state: 'auditing', failureCount: 2 });
  });

  it('retries an audit that stayed auditing and concludes it', async () => {
    const { events, dependencies } = await setup([runResult({ finalText: 'garbage' }), runResult({ finalText: verdictAnswer('keep') })]);
    await auditMerge(dependencies, 'a1');
    expect(await auditMerge(dependencies, 'a1')).toMatchObject({ status: 'concluded' });
    expect((await loadAudit(events, 'a1'))?.state).toBe('keep');
    expect(events.typesOf('audit/').filter((type) => type === 'audit.started')).toHaveLength(2);
  });

  it('skips a concluded audit and rejects an unknown one', async () => {
    const { harness, dependencies } = await setup([runResult({ finalText: verdictAnswer('keep') })]);
    await auditMerge(dependencies, 'a1');
    expect(await auditMerge(dependencies, 'a1')).toEqual({ status: 'skipped', auditId: 'a1' });
    expect(harness.requests).toHaveLength(1);
    await expect(auditMerge(dependencies, 'zz')).rejects.toBeInstanceOf(AuditNotFoundError);
  });

  it('audits every pending detection in order', async () => {
    const { harness, dependencies } = await setup(
      [runResult({ finalText: verdictAnswer('keep') }), runResult({ finalText: verdictAnswer('challenge') })],
      [commit({ sha: 'a1' }), commit({ sha: 'a2' })],
    );
    const outcomes = await auditPendingMerges(dependencies);
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['concluded', 'concluded']);
    expect(harness.requests.map((request) => request.runId)).toEqual(['run-1', 'run-2']);
    expect(await auditPendingMerges(dependencies)).toEqual([]);
  });
});

describe('publishAuditIssue', () => {
  it('creates the drafted issue once, labelled audit and factory', async () => {
    const { events, github, dependencies } = await setup([runResult({ finalText: verdictAnswer('challenge') })]);
    await auditMerge(dependencies, 'a1');
    const number = await publishAuditIssue({ events, github }, DEFAULT_PROJECT_CONVENTIONS, 'a1');
    expect(github.createdIssues).toHaveLength(1);
    expect(github.createdIssues[0]?.labels).toEqual(['audit', 'factory']);
    expect(await publishAuditIssue({ events, github }, DEFAULT_PROJECT_CONVENTIONS, 'a1')).toBe(number);
    expect(github.createdIssues).toHaveLength(1);
    expect((await loadAudit(events, 'a1'))?.publishedIssueNumber).toBe(number);
  });

  it('labels the issue with the labels the project names', async () => {
    const { events, github, dependencies } = await setup([runResult({ finalText: verdictAnswer('challenge') })]);
    await auditMerge(dependencies, 'a1');
    const labels = { ...DEFAULT_PROJECT_CONVENTIONS.labels, audit: 'needs-review', factory: 'bot' };
    await publishAuditIssue({ events, github }, { ...DEFAULT_PROJECT_CONVENTIONS, labels }, 'a1');
    expect(github.createdIssues[0]?.labels).toEqual(auditIssueLabels({ ...DEFAULT_PROJECT_CONVENTIONS, labels }));
    expect(github.createdIssues[0]?.labels).toEqual(['needs-review', 'bot']);
  });

  it('refuses when nothing is drafted or the audit is unknown', async () => {
    const { events, github, dependencies } = await setup([runResult({ finalText: verdictAnswer('keep') })]);
    await auditMerge(dependencies, 'a1');
    await expect(publishAuditIssue({ events, github }, DEFAULT_PROJECT_CONVENTIONS, 'a1')).rejects.toBeInstanceOf(AuditIssueNotDraftedError);
    await expect(publishAuditIssue({ events, github }, DEFAULT_PROJECT_CONVENTIONS, 'zz')).rejects.toBeInstanceOf(AuditNotFoundError);
  });

  it('records an operator resolution once', async () => {
    const { events } = await setup([]);
    await resolveAudit(events, 'a1', 'discussed');
    await resolveAudit(events, 'a1', 'again');
    expect(events.typesOf('audit/').filter((type) => type === 'audit.resolved')).toHaveLength(1);
    expect((await loadAudit(events, 'a1'))?.resolved).toBe(true);
  });
});
