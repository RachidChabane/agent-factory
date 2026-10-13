import { describe, expect, it } from 'vitest';
import { SteppingClock } from '../runs/test-support.ts';
import { PIPELINE_EVENTS } from './journal-events.ts';
import { currentAttempt } from './pipeline-journal.ts';
import { FeedbackRefusedError, PullRequestFeedback } from './pull-request-feedback.ts';
import { attemptHistory } from './retry.ts';
import { ISSUE_NUMBER, PipelineScenario } from './testing/pipeline-scenario.ts';

const FEEDBACK = 'The link must open in a new tab.\nIt should also carry an icon.';
const RECEIVED_AT = new Date('2026-10-10T09:00:00.000Z');
const PULL_REQUEST = 100;
const ICON_PATH = 'app/pages/link-icon.vue';

function feedbackOf(scenario: PipelineScenario): PullRequestFeedback {
  return new PullRequestFeedback({ ...scenario.dependencies(), clock: new SteppingClock(RECEIVED_AT) });
}

async function recordFeedback(scenario: PipelineScenario, body: string = FEEDBACK) {
  return feedbackOf(scenario).record({ pullRequestNumber: PULL_REQUEST, author: 'Dana', source: 'cli', body });
}

describe('external feedback on a factory pull request', () => {
  it('re-enters the implementer on the same branch and updates the pull request body', async () => {
    const scenario = new PipelineScenario();
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const firstEvidence = (await scenario.journal()).evidence?.sha;

    const outcome = await recordFeedback(scenario);
    expect(outcome).toEqual({ issueNumber: ISSUE_NUMBER, attempt: 1 });
    const recorded = await scenario.journal();
    expect(recorded).toMatchObject({ state: 'implementing', implementationCommit: null, evidence: null, attemptEpoch: 1 });
    expect(recorded.feedback[0]).toMatchObject({ author: 'Dana', receivedAt: RECEIVED_AT.toISOString(), cycleStarted: true, afterAttempt: 0 });
    expect(recorded.feedback[0]?.findings).toEqual([
      { severity: 'blocking', category: 'correctness', file: null, line: null, summary: `Dana: ${FEEDBACK}` },
    ]);

    scenario.harness.script('implementer', {
      effect: (request) => scenario.workspace.write(request.workingDirectory, ICON_PATH, '<svg />\n'),
    });
    const second = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(second).toMatchObject({ kind: 'pr-open', pullRequest: { number: PULL_REQUEST } });
    const correction = scenario.harness.requestsOf('implementer').at(-1);
    expect(scenario.harness.requestsOf('implementer')).toHaveLength(2);
    expect(correction?.resumeSessionId).not.toBeNull();
    expect(correction?.prompt).toContain('Dana: The link must open in a new tab.');
    const journal = await scenario.journal();
    expect(journal.evidence?.sha).not.toBe(firstEvidence);
    expect(journal.pullRequestBodySha).toBe(journal.evidence?.sha);
    expect(scenario.github.opened).toHaveLength(1);
    expect(scenario.github.bodyUpdates).toHaveLength(1);
    expect(scenario.github.bodyUpdates[0]?.body).toContain('- External feedback addressed:\n  - Dana: The link must open in a new tab.');
    expect(scenario.sourceControl.pushes.at(-1)?.headSha).toBe(journal.evidence?.sha);
  });

  it('starts a cycle with the whole retry budget when failures had spent it, and goes on in the session of the pull request', async () => {
    const scenario = new PipelineScenario();
    scenario.lintFailuresLeft = 3;
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const spent = await scenario.journal();
    expect(attemptHistory(spent)).toEqual({ inSessionCorrections: 2, freshRestarts: 1 });

    expect(await recordFeedback(scenario)).toEqual({ issueNumber: ISSUE_NUMBER, attempt: 4 });

    const opened = await scenario.journal();
    expect(opened).toMatchObject({ state: 'implementing', attemptEpoch: 4 });
    expect(currentAttempt(opened)).toBe(4);
    expect(attemptHistory(opened)).toEqual({ inSessionCorrections: 0, freshRestarts: 0 });
    expect(opened.decisions.at(-1)).toMatchObject({ afterAttempt: 3, decision: { action: 'resume-same-session' }, opensCycle: true });

    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const [last, previous] = scenario.harness.requestsOf('implementer').toReversed();
    expect(last).toMatchObject({ model: 'opus', effort: 'xhigh', resumeSessionId: `session-${previous?.runId ?? ''}` });
    expect(last?.prompt).toContain('Dana: The link must open in a new tab.');
  });

  it('gives a failure after the feedback the whole budget: two corrections, then one fresh session that hears the feedback', async () => {
    const scenario = new PipelineScenario();
    scenario.lintFailuresLeft = 3;
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    await recordFeedback(scenario);
    scenario.lintFailuresLeft = 3;

    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');

    const journal = await scenario.journal();
    expect(journal.decisions.slice(-4).map((record) => [record.afterAttempt, record.decision.action, record.opensCycle])).toEqual([
      [3, 'resume-same-session', true],
      [4, 'resume-same-session', false],
      [5, 'resume-same-session', false],
      [6, 'fresh-session-escalated', false],
    ]);
    const fresh = scenario.harness.requestsOf('implementer').at(-1);
    expect(fresh).toMatchObject({ resumeSessionId: null, model: 'opus', effort: 'xhigh' });
    expect(fresh?.prompt).toContain('# Earlier attempts');
    expect(fresh?.prompt).toContain('Dana: The link must open in a new tab.');
  });

  it('asks for a human only after the failures of the new cycle spent its budget, and then refuses to resume', async () => {
    const scenario = new PipelineScenario();
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    await recordFeedback(scenario);
    scenario.lintFailuresLeft = 4;

    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);

    expect(outcome.kind).toBe('needs-human');
    expect(scenario.harness.requestsOf('implementer')).toHaveLength(5);
    await expect(scenario.resumer().resume(ISSUE_NUMBER)).rejects.toThrow('the implementer retry budget is spent');
  });

  it('accepts feedback again on the pull request the feedback made the implementer update', async () => {
    const scenario = new PipelineScenario();
    scenario.lintFailuresLeft = 3;
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    await recordFeedback(scenario, 'First point.');
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');

    expect(await recordFeedback(scenario, 'Second point.')).toEqual({ issueNumber: ISSUE_NUMBER, attempt: 5 });

    expect((await scenario.journal()).attemptEpoch).toBe(5);
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    expect(scenario.harness.requestsOf('implementer').at(-1)?.prompt).toContain('Dana: Second point.');
  });

  it('refuses feedback on an issue that is not waiting at its pull request', async () => {
    const scenario = new PipelineScenario();
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    await feedbackOf(scenario).record({ pullRequestNumber: PULL_REQUEST, author: 'Dana', source: 'cli', body: 'Again.' });
    await expect(
      feedbackOf(scenario).record({ pullRequestNumber: PULL_REQUEST, author: 'Dana', source: 'cli', body: 'Again.' }),
    ).rejects.toBeInstanceOf(FeedbackRefusedError);
    expect(scenario.events.typesOf('issue/').filter((type) => type === PIPELINE_EVENTS.externalFeedbackReceived)).toHaveLength(1);
  });
});
