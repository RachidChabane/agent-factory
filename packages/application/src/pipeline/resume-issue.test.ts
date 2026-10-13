import { describe, expect, it } from 'vitest';
import { renderSpecBody } from '../spec/render-spec-body.ts';
import { ResumeRefusedError, SpecNotValidatedError } from './pipeline-errors.ts';
import { DECISION_REQUEST_PATH } from './decision-request.ts';
import { currentAttempt } from './pipeline-journal.ts';
import { attemptHistory } from './retry.ts';
import type { AgentRunRequest } from '../ports.ts';
import { CHECK_PATH, ISSUE_NUMBER, issueRecord, NO_FINDINGS, PipelineScenario, SCENARIO_CONVENTIONS, SPEC } from './testing/pipeline-scenario.ts';

const AMBIGUITY = 'Criterion 2 is ambiguous: "opens" may mean a new tab or the same tab. Tell me which reading to use.';
const CLARIFIED_CRITERION = 'The link opens the conversation in the same tab.';
const DECISION_QUESTION = 'The router offers no deep link to a conversation. May I write a custom route guard?';
const OPERATOR_ANSWER = 'Yes, write the guard in app/middleware and keep it under 30 lines.';

function decisionAsker(scenario: PipelineScenario): void {
  scenario.harness.script('implementer', {
    outcome: 'decision-requested',
    effect: (request) => scenario.workspace.write(request.workingDirectory, DECISION_REQUEST_PATH, `${DECISION_QUESTION}\n`),
  });
}

/** Three gate failures spend the whole budget: two corrections, then the fresh session, which asks for a decision. */
function decisionAskedAfterSpentBudget(scenario: PipelineScenario): void {
  scenario.lintFailuresLeft = 3;
  const implement = { effect: (request: AgentRunRequest) => scenario.implement(request) };
  scenario.harness.script('implementer', implement, implement, implement, {
    outcome: 'decision-requested',
    effect: (request) => scenario.workspace.write(request.workingDirectory, DECISION_REQUEST_PATH, `${DECISION_QUESTION}\n`),
  });
}

function ambiguousAuthor(scenario: PipelineScenario): void {
  scenario.harness.script('acceptance-author', {
    finalText: AMBIGUITY,
    effect: (request) => scenario.workspace.write(request.workingDirectory, CHECK_PATH, 'half-written check'),
  });
}

describe('ResumeIssue', () => {
  it('hands the acceptance-author explanation to the operator when it writes no manifest', async () => {
    const scenario = new PipelineScenario();
    ambiguousAuthor(scenario);
    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome).toEqual({
      kind: 'needs-human',
      issueNumber: ISSUE_NUMBER,
      reason: `The acceptance-author run finished without its result: .factory/acceptance.json was not written.\n\nIt said:\n${AMBIGUITY}`,
    });
  });

  it('re-reads the clarified spec and has the checks written again from a clean worktree', async () => {
    const scenario = new PipelineScenario();
    ambiguousAuthor(scenario);
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    const clarified = { ...SPEC, acceptanceCriteria: [SPEC.acceptanceCriteria[0] ?? '', CLARIFIED_CRITERION] };
    scenario.github.issues.set(ISSUE_NUMBER, issueRecord({ body: renderSpecBody(clarified, SCENARIO_CONVENTIONS) }));

    const resumed = await scenario.resumer().resume(ISSUE_NUMBER);

    expect(resumed).toEqual({
      issueNumber: ISSUE_NUMBER,
      resumedAt: 'authoring-checks',
      specChanged: true,
      checksReauthored: true,
      decisionAnswered: false,
    });
    const journal = await scenario.journal();
    expect(journal).toMatchObject({ state: 'authoring-checks', workspacePrepared: false, manifest: null, beforeProof: null, frozen: null });
    expect(journal.spec?.acceptanceCriteria[1]).toBe(CLARIFIED_CRITERION);
    expect(scenario.workspace.read(scenario.worktree().path, CHECK_PATH)).toBeUndefined();

    const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(outcome.kind).toBe('pr-open');
    expect(scenario.harness.requestsOf('acceptance-author').at(-1)?.prompt).toContain(CLARIFIED_CRITERION);
    expect(await scenario.states.path(ISSUE_NUMBER)).toContain('needs-human');
  });

  it('resumes without recording the spec again when the operator left it as it was', async () => {
    const scenario = new PipelineScenario();
    ambiguousAuthor(scenario);
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    expect(await scenario.resumer().resume(ISSUE_NUMBER)).toMatchObject({ specChanged: false, checksReauthored: true });
    expect(scenario.events.records.filter((event) => event.type === 'pipeline.spec-captured')).toHaveLength(1);
  });

  it('runs the step that escalated again after the checks were frozen', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('reviewer', { finalText: 'Looks fine to me.' }, { finalText: NO_FINDINGS });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('needs-human');
    expect(await scenario.resumer().resume(ISSUE_NUMBER)).toMatchObject({
      issueNumber: ISSUE_NUMBER,
      resumedAt: 'reviewing',
      specChanged: false,
      checksReauthored: false,
      decisionAnswered: false,
    });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    expect(scenario.harness.requestsOf('reviewer')).toHaveLength(2);
  });

  it('refuses to resume when the issue would only escalate again', async () => {
    const spent = new PipelineScenario();
    spent.lintFailuresLeft = 4;
    await spent.pipeline().runIssue(ISSUE_NUMBER);
    await expect(spent.resumer().resume(ISSUE_NUMBER)).rejects.toThrow('the implementer retry budget is spent');

    const tampered = new PipelineScenario();
    tampered.harness.script('implementer', {
      effect: (request) => tampered.workspace.write(request.workingDirectory, CHECK_PATH, "test.skip('weakened', () => {});\n"),
    });
    await tampered.pipeline().runIssue(ISSUE_NUMBER);
    await expect(tampered.resumer().resume(ISSUE_NUMBER)).rejects.toThrow('a frozen acceptance check was modified');
    expect((await tampered.journal()).state).toBe('needs-human');
  });

  it('resumes the implementer session with the operator answer to its decision request', async () => {
    const scenario = new PipelineScenario();
    decisionAsker(scenario);
    let staleRequest: string | undefined = 'not checked';
    scenario.harness.script('implementer', {
      effect: (request) => {
        staleRequest = scenario.workspace.read(request.workingDirectory, DECISION_REQUEST_PATH);
        scenario.implement(request);
      },
    });
    await scenario.pipeline().runIssue(ISSUE_NUMBER);

    expect(await scenario.resumer().resume(ISSUE_NUMBER, `  ${OPERATOR_ANSWER}\n`)).toEqual({
      issueNumber: ISSUE_NUMBER,
      resumedAt: 'implementing',
      specChanged: false,
      checksReauthored: false,
      decisionAnswered: true,
    });
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const [asking, answered] = scenario.harness.requestsOf('implementer');
    expect(answered?.resumeSessionId).toBe(`session-${asking?.runId ?? ''}`);
    expect(answered?.prompt).toContain(OPERATOR_ANSWER);
    expect(answered?.prompt).not.toContain(DECISION_QUESTION);
    expect(staleRequest).toBeUndefined();
  });

  it('accepts the answer to a decision request after failures spent the budget, and counts it as no correction', async () => {
    const scenario = new PipelineScenario();
    decisionAskedAfterSpentBudget(scenario);
    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('needs-human');
    expect(attemptHistory(await scenario.journal())).toEqual({ inSessionCorrections: 2, freshRestarts: 1 });

    expect(await scenario.resumer().resume(ISSUE_NUMBER, OPERATOR_ANSWER)).toMatchObject({ resumedAt: 'implementing', decisionAnswered: true });

    const answered = await scenario.journal();
    expect(answered.attemptEpoch).toBe(3);
    expect(currentAttempt(answered)).toBe(3);
    expect(attemptHistory(answered)).toEqual({ inSessionCorrections: 0, freshRestarts: 0 });
  });

  it('gives a failure after the answer the whole budget, whatever the failures before the question spent', async () => {
    const scenario = new PipelineScenario();
    decisionAskedAfterSpentBudget(scenario);
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    await scenario.resumer().resume(ISSUE_NUMBER, OPERATOR_ANSWER);
    scenario.lintFailuresLeft = 2;

    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');

    const journal = await scenario.journal();
    expect(journal.decisions.map((record) => [record.afterAttempt, record.decision.action])).toEqual([
      [0, 'resume-same-session'],
      [1, 'resume-same-session'],
      [2, 'fresh-session-escalated'],
      [3, 'resume-same-session'],
      [4, 'resume-same-session'],
    ]);
    expect(journal.attempts.map((record) => record.attempt)).toEqual([0, 1, 2, 3, 3, 4, 5]);
  });

  it('records the delegate and its reason on the answer and on the transition when the delegate resumes the issue', async () => {
    const scenario = new PipelineScenario();
    decisionAsker(scenario);
    await scenario.pipeline().runIssue(ISSUE_NUMBER);

    const resumed = await scenario.resumer().resume(ISSUE_NUMBER, OPERATOR_ANSWER, { actor: 'orchestrator', reason: 'the spec already answers it' });

    expect(resumed.decisionAnswered).toBe(true);
    const journal = await scenario.journal();
    expect(journal.decisionAnswers.at(-1)).toEqual({ runId: expect.any(String) as string, answer: OPERATOR_ANSWER, actor: 'orchestrator', reason: 'the spec already answers it' });
    const transition = (await scenario.events.read(`issue/${ISSUE_NUMBER}`, 0)).findLast((record) => record.type === 'issue.transitioned');
    expect(transition?.payload).toMatchObject({ to: 'implementing', reason: 'orchestrator resumed the issue' });
  });

  it('keeps the operator as the author of a resume made without a delegate', async () => {
    const scenario = new PipelineScenario();
    decisionAsker(scenario);
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    await scenario.resumer().resume(ISSUE_NUMBER, OPERATOR_ANSWER);
    const journal = await scenario.journal();
    expect(journal.decisionAnswers.at(-1)).toEqual({ runId: expect.any(String) as string, answer: OPERATOR_ANSWER });
    const transition = (await scenario.events.read(`issue/${ISSUE_NUMBER}`, 0)).findLast((record) => record.type === 'issue.transitioned');
    expect(transition?.payload).toMatchObject({ reason: 'the operator resumed the issue' });
  });

  it('gives a fresh implementer session the question and the answer when the asking run has no session', async () => {
    const scenario = new PipelineScenario();
    scenario.harness.script('implementer', {
      outcome: 'decision-requested',
      sessionId: null,
      effect: (request) => scenario.workspace.write(request.workingDirectory, DECISION_REQUEST_PATH, DECISION_QUESTION),
    });
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    await scenario.resumer().resume(ISSUE_NUMBER, OPERATOR_ANSWER);

    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');
    const answered = scenario.harness.requestsOf('implementer')[1];
    expect(answered?.resumeSessionId).toBeNull();
    expect(answered?.prompt).toContain(DECISION_QUESTION);
    expect(answered?.prompt).toContain(OPERATOR_ANSWER);
  });

  it('tells the fresh session that follows failures after the answer the question and the answer', async () => {
    const scenario = new PipelineScenario();
    decisionAsker(scenario);
    const implement = { effect: (request: AgentRunRequest) => scenario.implement(request) };
    scenario.harness.script('implementer', implement, implement, implement, implement);
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    await scenario.resumer().resume(ISSUE_NUMBER, OPERATOR_ANSWER);
    scenario.lintFailuresLeft = 3;

    expect((await scenario.pipeline().runIssue(ISSUE_NUMBER)).kind).toBe('pr-open');

    const fresh = scenario.harness.requestsOf('implementer').at(-1);
    expect(fresh?.resumeSessionId).toBeNull();
    expect(fresh?.prompt).toContain('# Earlier attempts');
    expect(fresh?.prompt).toContain(DECISION_QUESTION);
    expect(fresh?.prompt).toContain(OPERATOR_ANSWER);
  });

  it('refuses to resume a decision request without an answer, and an answer when no decision is pending', async () => {
    const asking = new PipelineScenario();
    decisionAsker(asking);
    await asking.pipeline().runIssue(ISSUE_NUMBER);
    await expect(asking.resumer().resume(ISSUE_NUMBER)).rejects.toThrow("needs the operator's answer");
    await expect(asking.resumer().resume(ISSUE_NUMBER, '  ')).rejects.toThrow("needs the operator's answer");
    expect((await asking.journal()).state).toBe('needs-human');

    const ambiguous = new PipelineScenario();
    ambiguousAuthor(ambiguous);
    await ambiguous.pipeline().runIssue(ISSUE_NUMBER);
    await expect(ambiguous.resumer().resume(ISSUE_NUMBER, OPERATOR_ANSWER)).rejects.toThrow('nothing to answer');
  });

  it('refuses an issue that is not waiting for a human', async () => {
    const scenario = new PipelineScenario();
    await expect(scenario.resumer().resume(ISSUE_NUMBER)).rejects.toBeInstanceOf(ResumeRefusedError);
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    await expect(scenario.resumer().resume(ISSUE_NUMBER)).rejects.toThrow('it is pr-open, not needs-human');
  });

  it('refuses a spec the operator no longer validates', async () => {
    const scenario = new PipelineScenario();
    ambiguousAuthor(scenario);
    await scenario.pipeline().runIssue(ISSUE_NUMBER);
    scenario.github.issues.set(ISSUE_NUMBER, issueRecord({ labels: ['type:ui', 'spec:draft'] }));
    await expect(scenario.resumer().resume(ISSUE_NUMBER)).rejects.toBeInstanceOf(SpecNotValidatedError);
    expect((await scenario.journal()).state).toBe('needs-human');
  });
});
