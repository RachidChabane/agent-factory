import { describe, expect, it } from 'vitest';
import { PIPELINE_EVENTS } from './journal-events.ts';
import { currentAttempt, reviewRecord } from './pipeline-journal.ts';
import { ResumeRefusedError } from './pipeline-errors.ts';
import { ISSUE_NUMBER, NO_FINDINGS, PipelineScenario } from './testing/pipeline-scenario.ts';

const OPERATOR = 'Alex Morgan';
const BLOCKING_REVIEWS_TO_SPEND_BUDGET = 4;
const BLOCKING_REVIEW = [
  'The change does not open the producing message.',
  '',
  '```json',
  JSON.stringify({
    findings: [{ severity: 'blocking', category: 'criteria-coverage', file: null, line: null, summary: 'The link does not open the producing message.' }],
  }),
  '```',
].join('\n');

function blockingReviews(count: number): readonly { readonly finalText: string }[] {
  return Array.from({ length: count }, () => ({ finalText: BLOCKING_REVIEW }));
}

async function escalatedByReview(finalReviews: readonly { readonly finalText: string }[] = []): Promise<PipelineScenario> {
  const scenario = new PipelineScenario();
  scenario.harness.script('reviewer', ...blockingReviews(BLOCKING_REVIEWS_TO_SPEND_BUDGET), ...finalReviews);
  expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('needs-human');
  return scenario;
}

describe('ResumeIssue.reviewAgain', () => {
  it('reviews the same implementation again and carries on to the pull request when nothing blocks', async () => {
    const scenario = await escalatedByReview([{ finalText: NO_FINDINGS }]);
    const implementerRuns = scenario.harness.requestsOf('implementer').length;
    const reviewerRuns = scenario.harness.requestsOf('reviewer').length;
    const before = await scenario.journal();
    const attempt = currentAttempt(before);

    expect(await scenario.resumer().reviewAgain(ISSUE_NUMBER, OPERATOR)).toEqual({ issueNumber: ISSUE_NUMBER, attempt });

    const reordered = await scenario.journal();
    expect(reordered.state).toBe('reviewing');
    expect(reordered.reviewReorders).toEqual([{ attempt, operator: OPERATOR }]);
    expect(reviewRecord(reordered, attempt)).toBeNull();
    expect(reordered.supersededReviews).toHaveLength(1);
    expect(currentAttempt(reordered)).toBe(attempt);

    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    expect(scenario.harness.requestsOf('implementer')).toHaveLength(implementerRuns);
    expect(scenario.harness.requestsOf('reviewer')).toHaveLength(reviewerRuns + 1);
    const path = await scenario.states.path(ISSUE_NUMBER);
    expect(path.slice(path.lastIndexOf('needs-human'))).toEqual(['needs-human', 'reviewing', 'producing-evidence', 'pr-open']);
    expect(scenario.events.records.filter((event) => event.type === PIPELINE_EVENTS.reviewReordered)).toHaveLength(1);
  });

  it('goes back to needs-human without a new implementer attempt when the new review blocks again, and refuses a plain resume', async () => {
    const scenario = await escalatedByReview(blockingReviews(2));
    const implementerRuns = scenario.harness.requestsOf('implementer').length;
    const decisions = (await scenario.journal()).decisions.length;
    const resumer = scenario.resumer();

    await resumer.reviewAgain(ISSUE_NUMBER, OPERATOR);
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('needs-human');

    const escalated = await scenario.journal();
    expect(escalated.state).toBe('needs-human');
    expect(escalated.decisions).toHaveLength(decisions);
    expect(scenario.harness.requestsOf('implementer')).toHaveLength(implementerRuns);
    await expect(resumer.resume(ISSUE_NUMBER)).rejects.toThrow('the implementer retry budget is spent');

    await resumer.reviewAgain(ISSUE_NUMBER, OPERATOR);
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('needs-human');
    const again = await scenario.journal();
    expect(again.reviewReorders).toHaveLength(2);
    expect(again.supersededReviews).toHaveLength(2);
    expect(scenario.harness.requestsOf('implementer')).toHaveLength(implementerRuns);
  });

  it('does not loop on its own: running an escalated issue again leaves it escalated', async () => {
    const scenario = await escalatedByReview([{ finalText: NO_FINDINGS }]);
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('needs-human');
    expect(scenario.harness.requestsOf('reviewer')).toHaveLength(BLOCKING_REVIEWS_TO_SPEND_BUDGET);
  });

  it('refuses an issue that is not waiting for a human', async () => {
    const scenario = new PipelineScenario();
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    await expect(scenario.resumer().reviewAgain(ISSUE_NUMBER, OPERATOR)).rejects.toThrow(`Issue #${ISSUE_NUMBER} cannot be resumed: it is pr-open, not needs-human`);
  });

  it('refuses an escalation that did not leave the reviewing stage', async () => {
    const scenario = new PipelineScenario();
    scenario.lintFailuresLeft = 4;
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    const refusal = scenario.resumer().reviewAgain(ISSUE_NUMBER, OPERATOR);
    await expect(refusal).rejects.toBeInstanceOf(ResumeRefusedError);
    await expect(refusal).rejects.toThrow('the escalation did not come from the review stage');
    expect((await scenario.journal()).state).toBe('needs-human');
  });

  it('refuses a reviewing escalation that no blocking review caused', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('reviewer', { finalText: 'Looks fine to me.' });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('needs-human');
    await expect(scenario.resumer().reviewAgain(ISSUE_NUMBER, OPERATOR)).rejects.toThrow('the escalation was not caused by a blocking review');
  });
});
