import { describe, expect, it } from 'vitest';
import { SteppingClock } from '../runs/test-support.ts';
import { PIPELINE_EVENTS } from './journal-events.ts';
import { FeedbackRefusedError, PullRequestFeedback } from './pull-request-feedback.ts';
import { ISSUE_NUMBER, PipelineScenario, SETTINGS } from './testing/pipeline-scenario.ts';

const FEEDBACK = 'The link must open in a new tab.\nIt should also carry an icon.';
const RECEIVED_AT = new Date('2026-10-10T09:00:00.000Z');
const PULL_REQUEST = 100;
const ICON_PATH = 'app/pages/link-icon.vue';

function feedbackOf(scenario: PipelineScenario): PullRequestFeedback {
  return new PullRequestFeedback({ ...scenario.dependencies(), clock: new SteppingClock(RECEIVED_AT) }, SETTINGS.implementerEscalation);
}

describe('external feedback on a factory pull request', () => {
  it('re-enters the implementer on the same branch and updates the pull request body', async () => {
    const scenario = new PipelineScenario();
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const firstEvidence = (await scenario.journal()).evidence?.sha;

    const outcome = await feedbackOf(scenario).record({ pullRequestNumber: PULL_REQUEST, author: 'Dana', source: 'cli', body: FEEDBACK });
    expect(outcome).toEqual({ kind: 'cycle-started', issueNumber: ISSUE_NUMBER, attempt: 1 });
    const recorded = await scenario.journal();
    expect(recorded).toMatchObject({ state: 'implementing', implementationCommit: null, evidence: null });
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

  it('escalates when the retry budget is spent, and a resume grants one fresh escalated session', async () => {
    const scenario = new PipelineScenario();
    scenario.lintFailuresLeft = 3;
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');

    const outcome = await feedbackOf(scenario).record({ pullRequestNumber: PULL_REQUEST, author: 'Riley', source: 'cli', body: 'Rename the link.' });
    expect(outcome.kind).toBe('needs-human');
    const escalated = await scenario.journal();
    expect(escalated).toMatchObject({ state: 'needs-human', stateBeforeEscalation: 'implementing' });
    expect(escalated.decisions.some((record) => record.decision.action === 'needs-human')).toBe(false);

    const resumed = await scenario.resumer(SETTINGS.implementerEscalation).resume(ISSUE_NUMBER);
    expect(resumed).toMatchObject({ resumedAt: 'implementing', feedbackCycleGranted: true });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const fresh = scenario.harness.requestsOf('implementer').at(-1);
    expect(fresh).toMatchObject({ model: 'opus', effort: 'xhigh', resumeSessionId: null });
    expect(scenario.github.bodyUpdates).toHaveLength(1);
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
