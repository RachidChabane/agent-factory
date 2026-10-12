import {
  ACTIVE_PIPELINE_STATES,
  AGENT_ROLES,
  BASE_EXPECTATIONS,
  ISSUE_STATES,
  REQUEST_STATES,
  REVIEW_CATEGORIES,
  REVIEW_SEVERITIES,
  TEST_RUNNERS,
} from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import {
  AGENT_RUN_OUTCOMES,
  ATTEMPT_KINDS,
  ATTEMPT_OUTCOMES,
  BEFORE_RESULTS,
  CHALLENGE_VERDICTS,
  CHECK_CONCLUSIONS,
  EVIDENCE_KINDS,
  PULL_REQUEST_STATES,
  RUN_STATUSES,
  RUN_SUBJECT_KINDS,
  requestAttachmentPath,
  type IssueView,
} from '../../../contract/index.ts';
import { diffKey } from '../../fake-transport.ts';
import { ledger, NOW, required, runNamed, snapshot, storefront, world } from './world-under-test.ts';
import { RUN } from '../storefront/ids.ts';

type FilePatch = { readonly patch: string };

const projects = snapshot.projects;
const allIssues: readonly IssueView[] = projects.flatMap((project) => project.issues);
const allPullRequests = projects.flatMap((project) => project.pullRequests);
const diffsOfPullRequests = projects.flatMap((project) =>
  project.pullRequests.map((pull) => ({ pull, diff: required(world.diffs.get(diffKey(project.id, pull.number)), `diff of pull request ${pull.number} of ${project.id}`) })),
);
const PRE_BRANCH_STATES: readonly string[] = ['spec-draft', 'spec-validated', 'blocked', 'authoring-checks'];
const HUNK_HEADER = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/;

function setOf<Value>(values: readonly Value[]): Set<Value> {
  return new Set(values);
}

function hunkCounts(file: FilePatch): { additions: number; deletions: number; consistent: boolean } {
  let additions = 0;
  let deletions = 0;
  let consistent = true;
  let expected: { old: number; added: number } | null = null;
  let seen = { old: 0, added: 0 };
  const close = (): void => {
    if (expected !== null && (seen.old !== expected.old || seen.added !== expected.added)) consistent = false;
  };
  for (const line of file.patch.split('\n')) {
    const header = HUNK_HEADER.exec(line);
    if (header !== null) {
      close();
      expected = { old: Number(header[2]), added: Number(header[4]) };
      seen = { old: 0, added: 0 };
      continue;
    }
    if (line.startsWith('+')) {
      additions += 1;
      seen.added += 1;
    } else if (line.startsWith('-')) {
      deletions += 1;
      seen.old += 1;
    } else {
      seen.old += 1;
      seen.added += 1;
    }
  }
  close();
  return { additions, deletions, consistent };
}

function addedLinesOf(file: FilePatch): Set<number> {
  const lines = new Set<number>();
  let next = 0;
  for (const line of file.patch.split('\n')) {
    const header = HUNK_HEADER.exec(line);
    if (header !== null) {
      next = Number(header[3]);
    } else if (line.startsWith('+')) {
      lines.add(next);
      next += 1;
    } else if (!line.startsWith('-')) {
      next += 1;
    }
  }
  return lines;
}

describe('the requests of the world', () => {
  const requests = projects.flatMap((project) => project.requests);

  it('cover every state of a request', () => {
    expect(setOf(requests.map((request) => request.state))).toEqual(setOf(REQUEST_STATES));
    expect(storefront.requests.map((request) => request.state).sort()).toEqual(['accepted', 'accepted', 'challenged', 'challenging', 'declined', 'received', 'received', 'waiting-requester']);
  });

  it('carry a full challenge report in the challenged request', () => {
    const request = required(storefront.requests.find((candidate) => candidate.state === 'challenged'), 'challenged request');
    const report = required(request.challenge, 'challenge report');
    expect(setOf(report.items.map((item) => item.verdict)).size).toBeGreaterThanOrEqual(3);
    expect(report.specs.some((spec) => spec.issueNumber === null)).toBe(true);
    expect(report.specs.some((spec) => spec.problems.length > 0)).toBe(true);
    expect(report.specs.every((spec) => spec.itemIds.every((id) => report.items.some((item) => item.id === id)))).toBe(true);
    expect(report.reply.length).toBeGreaterThan(0);
  });

  it('use every verdict of a challenge', () => {
    const verdicts = requests.flatMap((request) => request.challenge?.items.map((item) => item.verdict) ?? []);
    expect(setOf(verdicts)).toEqual(setOf(CHALLENGE_VERDICTS));
  });

  it('link the accepted requests to the issues they created', () => {
    const accepted = requests.filter((request) => request.state === 'accepted');
    expect(accepted.length).toBeGreaterThanOrEqual(3);
    for (const request of accepted) {
      expect(request.issueNumbers.length).toBeGreaterThan(0);
      const project = required(projects.find((candidate) => candidate.requests.includes(request)), 'project of request');
      for (const number of request.issueNumbers) expect(project.issues.find((issue) => issue.number === number)?.requestId).toBe(request.id);
    }
    expect(accepted.some((request) => request.challenge === null)).toBe(true);
    expect(allIssues.filter((issue) => issue.requestId !== null).length).toBeGreaterThanOrEqual(5);
  });

  it('give the declined request a reason and the waiting request a question', () => {
    expect(required(requests.find((request) => request.state === 'declined'), 'declined request').declineReason).not.toBeNull();
    const waiting = required(requests.find((request) => request.state === 'waiting-requester'), 'waiting request');
    expect(waiting.challenge?.items.some((item) => item.question !== null)).toBe(true);
  });

  it('record a failed challenge and the attachments of a request', () => {
    const failed = required(requests.find((request) => request.lastChallengeFailure !== null), 'failed challenge');
    expect(failed.state).toBe('received');
    const withFiles = required(requests.find((request) => request.attachments.length > 0), 'request with attachments');
    for (const attachment of withFiles.attachments) expect(attachment.url).toBe(requestAttachmentPath('storefront', withFiles.id, attachment.name));
  });
});

describe('the issues of the world', () => {
  it('cover every state of an issue', () => {
    expect(setOf(allIssues.map((issue) => issue.state))).toEqual(setOf(ISSUE_STATES));
  });

  it('include a paused issue in an active state and an escalated issue that knows where to resume', () => {
    const paused = allIssues.filter((issue) => issue.paused);
    expect(paused.length).toBeGreaterThan(0);
    expect(paused.every((issue) => ACTIVE_PIPELINE_STATES.includes(issue.state))).toBe(true);
    const escalated = allIssues.filter((issue) => issue.state === 'needs-human');
    expect(escalated).toHaveLength(1);
    expect(escalated[0]?.escalation).not.toBeNull();
    expect(escalated[0]?.resumeTarget).toBe('implementing');
    expect(allIssues.filter((issue) => issue.state !== 'needs-human').every((issue) => issue.escalation === null && issue.resumeTarget === null)).toBe(true);
  });

  it('block an issue behind a chain of two unmerged issues', () => {
    const byNumber = new Map(storefront.issues.map((issue) => [issue.number, issue]));
    const blocked = storefront.issues.filter((issue) => issue.state === 'blocked');
    const head = required(blocked.find((issue) => issue.dependsOn.some((number) => byNumber.get(number)?.state === 'blocked')), 'head of the chain');
    const middle = required(byNumber.get(required(head.dependsOn[0], 'first dependency')), 'middle issue');
    const tail = required(byNumber.get(required(middle.dependsOn[0], 'second dependency')), 'last issue');
    expect(middle.state).toBe('blocked');
    expect(['merged', 'in-dev', 'in-release', 'in-prep', 'in-prod', 'closed']).not.toContain(tail.state);
  });

  it('draw their checks from every runner and every proof of the base branch', () => {
    const checks = allIssues.flatMap((issue) => issue.checks);
    expect(setOf(checks.flatMap((check) => (check.runner === null ? [] : [check.runner])))).toEqual(setOf(TEST_RUNNERS));
    expect(setOf(checks.map((check) => check.before.result))).toEqual(setOf(BEFORE_RESULTS));
    expect(setOf(checks.flatMap((check) => (check.onBase === null ? [] : [check.onBase])))).toEqual(setOf(BASE_EXPECTATIONS));
    expect(checks.some((check) => check.before.score !== null)).toBe(true);
    expect(checks.some((check) => check.before.screenshotUrl !== null)).toBe(true);
    expect(setOf(allIssues.map((issue) => issue.beforeProofKind)).size).toBe(3);
  });

  it('freeze checks with a hash and a time, and leave others open', () => {
    const frozenIssues = allIssues.filter((issue) => issue.checksFrozenAt !== null);
    expect(frozenIssues.length).toBeGreaterThan(5);
    for (const issue of frozenIssues) expect(issue.checks.every((check) => check.sha256 !== null && /^[0-9a-f]{64}$/.test(check.sha256))).toBe(true);
    const open = allIssues.flatMap((issue) => issue.checks.filter((check) => check.sha256 === null));
    expect(open.length).toBeGreaterThan(0);
  });

  it('attempt the work in every kind and end it in every way', () => {
    const attempts = allIssues.flatMap((issue) => issue.attempts);
    expect(setOf(attempts.map((attempt) => attempt.kind))).toEqual(setOf(ATTEMPT_KINDS));
    expect(setOf(attempts.map((attempt) => attempt.outcome))).toEqual(setOf(ATTEMPT_OUTCOMES));
    expect(attempts.filter((attempt) => attempt.outcome === 'running').every((attempt) => attempt.endedAt === null)).toBe(true);
  });

  it('start the branch with the first agent and keep the pre-branch states without one', () => {
    for (const issue of allIssues) {
      if (PRE_BRANCH_STATES.includes(issue.state)) expect([issue.number, issue.branch]).toEqual([issue.number, null]);
      else expect(issue.branch?.startsWith('factory/')).toBe(true);
    }
  });

  it('belong to the typology of their project', () => {
    for (const project of projects) {
      const ids = project.issueTypes.map((type) => type.id);
      for (const issue of project.issues) expect(ids).toContain(issue.type);
    }
    expect(storefront.issueTypes).toHaveLength(12);
    expect(ledger.issueTypes.length).toBeGreaterThanOrEqual(5);
    expect(ledger.issueTypes.length).toBeLessThanOrEqual(6);
  });

  it('cost what their runs cost, which varies from issue to issue', () => {
    const costs = allIssues.map((issue) => issue.costUsd);
    expect(setOf(costs).size).toBeGreaterThan(15);
    expect(Math.min(...costs)).toBe(0);
    expect(Math.max(...costs)).toBeGreaterThan(10);
  });
});

describe('the runs of the world', () => {
  const { runs } = snapshot;

  it('cover the statuses, outcomes, roles and subjects of a run', () => {
    expect(runs.length).toBeGreaterThanOrEqual(12);
    expect(setOf(runs.map((run) => run.status))).toEqual(setOf(RUN_STATUSES));
    expect(setOf(runs.flatMap((run) => (run.outcome === null ? [] : [run.outcome])))).toEqual(setOf(AGENT_RUN_OUTCOMES));
    expect(setOf(runs.map((run) => run.role))).toEqual(setOf(AGENT_ROLES));
    expect(setOf(runs.map((run) => run.subject.kind))).toEqual(setOf(RUN_SUBJECT_KINDS));
    expect(setOf(runs.map((run) => run.project))).toEqual(setOf(['storefront', 'ledger', null]));
  });

  it('end failed runs by their reason and stopped runs by the operator', () => {
    const outcomesOf = (status: string): string[] => runs.filter((run) => run.status === status).flatMap((run) => (run.outcome === null ? [] : [run.outcome]));
    expect(setOf(outcomesOf('failed'))).toEqual(setOf(['max-turns', 'budget-exceeded', 'error', 'timeout']));
    expect(setOf(outcomesOf('stopped'))).toEqual(setOf(['aborted']));
    expect(setOf(outcomesOf('succeeded'))).toEqual(setOf(['success']));
    const maxTurns = runNamed(RUN.promoSavingsFirst);
    expect(maxTurns.turns).toBe(maxTurns.maxTurns);
    const overBudget = runNamed(RUN.promoSavingsSecond);
    expect(overBudget.costUsd).toBeGreaterThan(overBudget.maxBudgetUsd);
    const timedOut = runNamed(RUN.promoSavingsThird);
    expect(Date.parse(required(timedOut.endedAt, 'end')) - Date.parse(timedOut.startedAt)).toBe(60 * 60_000);
  });

  it('keep a run within its limits unless its limit is what stopped it', () => {
    for (const run of runs) {
      expect(run.turns).toBeLessThanOrEqual(run.maxTurns);
      if (run.outcome !== 'budget-exceeded') expect(run.costUsd).toBeLessThanOrEqual(run.maxBudgetUsd);
      expect(run.endedAt === null).toBe(run.status === 'running');
      expect(run.pendingQuestion === null).toBe(run.status !== 'waiting');
      expect(Date.parse(run.startedAt)).toBeLessThan(Date.parse(run.endedAt ?? snapshot.generatedAt));
    }
  });

  it('spread over the two accounts and one run without an account', () => {
    const accounts = runs.map((run) => run.account);
    expect(setOf(accounts)).toEqual(setOf(['personal', 'shared', null]));
    expect(setOf(snapshot.usage.accounts.map((account) => account.name))).toEqual(setOf(['personal', 'shared']));
  });

  it('keep one installation run that belongs to no project', () => {
    const runsWithoutProject = runs.filter((run) => run.project === null);
    expect(runsWithoutProject).toHaveLength(1);
    expect(runsWithoutProject[0]?.account).toBeNull();
  });

  it('start with the newest run', () => {
    const starts = runs.map((run) => Date.parse(run.startedAt));
    expect(starts).toEqual([...starts].sort((left, right) => right - left));
  });
});

describe('the pull requests of the world', () => {
  it('cover the three states of a pull request', () => {
    expect(setOf(allPullRequests.map((pull) => pull.state))).toEqual(setOf(PULL_REQUEST_STATES));
    for (const pull of allPullRequests) expect(pull.mergedAt === null).toBe(pull.state !== 'merged');
  });

  it('carry one of each kind of evidence in a complete pull request that can be merged', () => {
    const complete = required(
      storefront.pullRequests.find((pull) => pull.state === 'open' && pull.evidenceComplete && pull.mergeable),
      'mergeable pull request',
    );
    expect(complete.mergeBlockers).toEqual([]);
    expect(complete.missingEvidence).toEqual([]);
    expect(setOf(complete.evidence.map((item) => item.kind))).toEqual(setOf(EVIDENCE_KINDS));
    expect(storefront.issues.find((issue) => issue.number === complete.issueNumber)?.state).toBe('ready-to-merge');
  });

  it('name what is missing and what blocks the merge of an incomplete pull request', () => {
    const incomplete = required(
      storefront.pullRequests.find((pull) => pull.state === 'open' && !pull.evidenceComplete),
      'incomplete pull request',
    );
    expect(incomplete.missingEvidence.length).toBeGreaterThan(0);
    expect(incomplete.mergeBlockers.length).toBeGreaterThan(0);
    expect(incomplete.mergeable).toBe(false);
  });

  it('record review findings of both severities and every category, resolved or not', () => {
    const findings = allPullRequests.flatMap((pull) => pull.reviewRounds.flatMap((round) => round.findings));
    expect(setOf(findings.map((finding) => finding.severity))).toEqual(setOf(REVIEW_SEVERITIES));
    expect(setOf(findings.map((finding) => finding.category))).toEqual(setOf(REVIEW_CATEGORIES));
    expect(setOf(findings.map((finding) => finding.resolved))).toEqual(setOf([true, false]));
    expect(findings.some((finding) => finding.file === null || finding.line === null)).toBe(true);
    expect(allPullRequests.some((pull) => pull.reviewRounds.length >= 2)).toBe(true);
    for (const pull of allPullRequests) expect(pull.reviewRounds.map((round) => round.round)).toEqual(pull.reviewRounds.map((_, position) => position + 1));
  });

  it('point every open finding at a line the pull request adds', () => {
    for (const { pull, diff } of diffsOfPullRequests) {
      for (const finding of pull.reviewRounds.flatMap((round) => round.findings)) {
        if (finding.resolved || finding.file === null || finding.line === null) continue;
        const file = required(diff.files.find((candidate) => candidate.path === finding.file), `file ${finding.file}`);
        expect(addedLinesOf(file).has(finding.line)).toBe(true);
      }
    }
  });

  it('keep the feedback that started a cycle apart from the feedback that did not', () => {
    const feedback = allPullRequests.flatMap((pull) => pull.externalFeedback);
    expect(setOf(feedback.map((entry) => entry.cycleStarted))).toEqual(setOf([true, false]));
  });

  it('serve real unified diffs whose headers count their own lines and whose totals match those of the snapshot', () => {
    for (const { pull, diff } of diffsOfPullRequests) {
      expect(pull.files.length).toBeGreaterThan(0);
      expect(diff.files.map((file) => file.path)).toEqual(pull.files.map((file) => file.path));
      for (const [position, file] of pull.files.entries()) {
        const patch = required(diff.files[position], `patch of ${file.path}`);
        const counts = hunkCounts(patch);
        expect([pull.number, file.path, counts.consistent]).toEqual([pull.number, file.path, true]);
        expect([file.additions, file.deletions]).toEqual([counts.additions, counts.deletions]);
        expect(patch.patch.startsWith('@@ -')).toBe(true);
        expect(patch.truncated).toBe(false);
      }
    }
    expect(allPullRequests.some((pull) => pull.files.some((file) => file.additions > 0 && file.deletions > 0))).toBe(true);
  });

  it('serve each diff at the head commit of its pull request, read recently', () => {
    for (const { pull, diff } of diffsOfPullRequests) {
      expect([diff.pullRequestNumber, diff.headSha]).toEqual([pull.number, pull.headSha]);
      expect(diff.baseSha).not.toBe(diff.headSha);
      expect(NOW - Date.parse(diff.readAt)).toBeLessThanOrEqual(5 * 60_000);
    }
    expect(world.diffs.size).toBe(allPullRequests.length);
  });

  it('read the checks in the three ways a reading can come out', () => {
    const readings = storefront.pullRequests.map((pull) => pull.checks);
    const fresh = readings.find((reading) => reading.error === null && reading.value?.some((check) => check.conclusion === 'failure') === true);
    expect(setOf(required(fresh, 'reading with a failure').value?.map((check) => check.conclusion) ?? [])).toEqual(setOf(['success', 'failure', 'pending']));
    const failed = readings.find((reading) => reading.error !== null);
    expect(required(failed, 'failed reading').value).not.toBeNull();
    expect(failed?.readAt).not.toBeNull();
    expect(readings.some((reading) => reading.value === null && reading.readAt === null && reading.error === null)).toBe(true);
    const conclusions = readings.flatMap((reading) => reading.value?.map((check) => check.conclusion) ?? []);
    expect(conclusions.every((conclusion) => CHECK_CONCLUSIONS.includes(conclusion))).toBe(true);
  });

  it('keep one open pull request in the ledger, whose forge reports no workflow', () => {
    expect(ledger.pullRequests.filter((pull) => pull.state === 'open')).toHaveLength(1);
    expect(ledger.workflows).toBeNull();
    expect(storefront.workflows?.error).toBeNull();
  });

  it('list workflow runs in every status, with one that no one started', () => {
    const runs = required(storefront.workflows?.value, 'workflow runs');
    expect(setOf(runs.map((run) => run.status))).toEqual(setOf(['queued', 'in_progress', 'completed']));
    expect(setOf(runs.flatMap((run) => (run.conclusion === null ? [] : [run.conclusion])))).toEqual(setOf(['success', 'failure', 'cancelled']));
    expect(runs.filter((run) => run.status !== 'completed').every((run) => run.conclusion === null && run.durationMs === null)).toBe(true);
  });
});
