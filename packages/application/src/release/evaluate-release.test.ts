import { describe, expect, it } from 'vitest';
import { auditSubject, AUDIT_CONCLUDED_EVENT, AUDIT_DETECTED_EVENT, AUDIT_ISSUE_PUBLISHED_EVENT, AUDIT_RESOLVED_EVENT, AUDIT_STARTED_EVENT } from '../audit/events.ts';
import { FakeGitHubGateway, InMemoryEventStore, commit, factoryCommit } from '../audit/testing/fakes.ts';
import { attributionRules, DEFAULT_PROJECT_CONVENTIONS } from '../conventions/project-conventions.ts';
import { evaluateRelease } from './evaluate-release.ts';
import { PULL_REQUEST_OPENED_EVENT, RELEASE_EVALUATED_EVENT, ReleaseEvaluatedPayloadSchema, pullRequestSubject } from './events.ts';
import { FakeHealthProbe } from './health-probe.ts';
import { REASON_NO_PREP_CHECKS } from '@agent-factory/domain';

const RELEASE = { releaseId: 'v1', branch: 'main', baseSha: 'base' };
const RULES = attributionRules(DEFAULT_PROJECT_CONVENTIONS);
const HEALTHY = new FakeHealthProbe([{ name: 'ui', passed: true, detail: 'HTTP 200' }]);

function setup() {
  const events = new InMemoryEventStore();
  const github = new FakeGitHubGateway();
  github.history.push(commit({ sha: 'base' }));
  return { events, github };
}

async function recordPullRequest(events: InMemoryEventStore, number: number, evidenceComplete: boolean) {
  await events.append(PULL_REQUEST_OPENED_EVENT, pullRequestSubject(number), { number, evidenceComplete });
}

async function recordAudit(events: InMemoryEventStore, sha: string, verdict: 'keep' | 'challenge' | 'rewrite' | null) {
  const subject = auditSubject(sha);
  await events.append(AUDIT_DETECTED_EVENT, subject, { commitSha: sha, reason: 'direct-push', commitMessage: 'm', authorLogin: null, pullRequestNumber: null });
  if (verdict === null) return;
  await events.append(AUDIT_STARTED_EVENT, subject, { runId: 'r' });
  await events.append(AUDIT_CONCLUDED_EVENT, subject, { runId: 'r', verdict, summary: 'sum', findings: [], proposedFix: null });
}

describe('evaluateRelease', () => {
  it('is promotable when every factory pull request has evidence, no audit is open and health passes', async () => {
    const { events, github } = setup();
    github.history.push(factoryCommit('f1', 10), commit({ sha: 'd1' }));
    await recordPullRequest(events, 10, true);
    await recordAudit(events, 'd1', 'keep');

    const result = await evaluateRelease({ events, github, health: HEALTHY, rules: RULES }, RELEASE);
    expect(result.promotable).toBe(true);
    expect(result.blockingReasons).toEqual([]);
    expect(result.report).toContain('Promotable.');
    expect(result.report).toContain('- #10: evidence complete');
    const evaluated = events.records.find((record) => record.type === RELEASE_EVALUATED_EVENT);
    expect(evaluated?.subject).toBe('release/v1');
    expect(ReleaseEvaluatedPayloadSchema.parse(evaluated?.payload)).toMatchObject({ promotable: true, commitShas: ['f1', 'd1'] });
  });

  it('blocks on an open verdict, incomplete or missing evidence, and failing health', async () => {
    const { events, github } = setup();
    github.history.push(factoryCommit('f1', 10), factoryCommit('f2', 11), commit({ sha: 'd1' }), commit({ sha: 'd2' }));
    await recordPullRequest(events, 10, false);
    await recordAudit(events, 'd1', 'challenge');
    await recordAudit(events, 'd2', null);
    const probe = new FakeHealthProbe([{ name: 'agent', passed: false, detail: 'HTTP 503' }]);

    const result = await evaluateRelease({ events, github, health: probe, rules: RULES }, RELEASE);
    expect(result.promotable).toBe(false);
    expect(result.blockingReasons).toEqual([
      'audit challenge is open on commit d1',
      'audit detected is open on commit d2',
      'pull request #10 has incomplete evidence',
      'pull request #11 has incomplete evidence',
      'PREP health check agent failed',
    ]);
    expect(result.report).toContain('- #11: no evidence recorded');
    expect(result.report).toContain('Not promotable.');
  });

  it('unblocks a challenge once the operator resolves it', async () => {
    const { events, github } = setup();
    github.history.push(commit({ sha: 'd1' }));
    await recordAudit(events, 'd1', 'rewrite');
    expect((await evaluateRelease({ events, github, health: HEALTHY, rules: RULES }, RELEASE)).promotable).toBe(false);
    await events.append(AUDIT_RESOLVED_EVENT, auditSubject('d1'), { note: 'redone in #99' });
    expect((await evaluateRelease({ events, github, health: HEALTHY, rules: RULES }, RELEASE)).promotable).toBe(true);
  });

  it('treats a closed audit issue as a resolution', async () => {
    const { events, github } = setup();
    github.history.push(commit({ sha: 'd1' }));
    await recordAudit(events, 'd1', 'challenge');
    const issue = await github.createIssue('t', 'b', ['audit']);
    await events.append(AUDIT_ISSUE_PUBLISHED_EVENT, auditSubject('d1'), { issueNumber: issue.number });
    expect((await evaluateRelease({ events, github, health: HEALTHY, rules: RULES }, RELEASE)).promotable).toBe(false);
    github.close(issue.number);
    expect((await evaluateRelease({ events, github, health: HEALTHY, rules: RULES }, RELEASE)).promotable).toBe(true);
  });

  it('ignores audits on commits outside the release', async () => {
    const { events, github } = setup();
    github.history.push(commit({ sha: 'd1' }));
    await recordAudit(events, 'elsewhere', 'challenge');
    expect((await evaluateRelease({ events, github, health: HEALTHY, rules: RULES }, RELEASE)).promotable).toBe(true);
  });

  it('blocks when no PREP check exists', async () => {
    const { events, github } = setup();
    const result = await evaluateRelease({ events, github, health: new FakeHealthProbe([]), rules: RULES }, RELEASE);
    expect(result.blockingReasons).toEqual([REASON_NO_PREP_CHECKS]);
  });
});
