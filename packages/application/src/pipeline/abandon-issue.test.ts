import { describe, expect, it } from 'vitest';
import { AbandonIssue } from './abandon-issue.ts';
import { DECISION_REQUEST_PATH } from './decision-request.ts';
import { AbandonRefusedError } from './pipeline-errors.ts';
import { ISSUE_NUMBER, PipelineScenario } from './testing/pipeline-scenario.ts';

const OPERATOR = 'alex';
const REASON = 'the session refresh needs an architecture decision first';

async function escalatedOnDecision(): Promise<PipelineScenario> {
  const scenario = new PipelineScenario();
  scenario.harness.script('implementer', {
    outcome: 'decision-requested',
    effect: (request) => scenario.workspace.write(request.workingDirectory, DECISION_REQUEST_PATH, 'May I write a custom lock?\n'),
  });
  expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('needs-human');
  return scenario;
}

describe('AbandonIssue', () => {
  it('frees the worktree of an escalated issue and closes it for the factory with the operator reason', async () => {
    const scenario = await escalatedOnDecision();
    const worktree = scenario.worktree();

    const outcome = await new AbandonIssue(scenario.dependencies()).abandon({ issueNumber: ISSUE_NUMBER, operator: OPERATOR, reason: `  ${REASON}\n` });

    expect(outcome).toEqual({ issueNumber: ISSUE_NUMBER, releasedWorktree: worktree.path, branch: worktree.branch, openPullRequest: null });
    expect(scenario.pool.leases.has(ISSUE_NUMBER)).toBe(false);
    const journal = await scenario.journal();
    expect(journal).toMatchObject({ state: 'abandoned', worktree: null });
    const transition = scenario.events.records.filter((event) => event.type === 'issue.transitioned').at(-1);
    expect(transition?.payload).toEqual({ from: 'needs-human', to: 'abandoned', reason: `abandoned by ${OPERATOR}: ${REASON}` });
  });

  it('refuses an issue that is not waiting on a human', async () => {
    const scenario = new PipelineScenario();
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const abandon = new AbandonIssue(scenario.dependencies()).abandon({ issueNumber: ISSUE_NUMBER, operator: OPERATOR, reason: REASON });
    await expect(abandon).rejects.toThrow(AbandonRefusedError);
    await expect(abandon).rejects.toThrow('it is pr-open, not needs-human');
    expect((await scenario.journal()).state).toBe('pr-open');
  });

  it('refuses an issue the factory never took', async () => {
    const scenario = new PipelineScenario();
    await expect(new AbandonIssue(scenario.dependencies()).abandon({ issueNumber: ISSUE_NUMBER, operator: OPERATOR, reason: REASON })).rejects.toThrow(
      'it is unknown to the factory, not needs-human',
    );
  });

  it('refuses without a reason and leaves the worktree leased', async () => {
    const scenario = await escalatedOnDecision();
    await expect(new AbandonIssue(scenario.dependencies()).abandon({ issueNumber: ISSUE_NUMBER, operator: OPERATOR, reason: '   ' })).rejects.toThrow(
      'the operator must give the reason for abandoning it',
    );
    expect(scenario.pool.leases.has(ISSUE_NUMBER)).toBe(true);
    expect((await scenario.journal()).state).toBe('needs-human');
  });

  it('names the pull request left open when feedback escalated an issue after its pull request opened', async () => {
    const scenario = new PipelineScenario();
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const pullRequest = (await scenario.journal()).pullRequest;
    await scenario.states.transition(ISSUE_NUMBER, 'needs-human', 'external feedback exhausted the retry budget');

    const outcome = await new AbandonIssue(scenario.dependencies()).abandon({ issueNumber: ISSUE_NUMBER, operator: OPERATOR, reason: REASON });

    expect(outcome.openPullRequest).toBe(pullRequest?.number);
  });
});
