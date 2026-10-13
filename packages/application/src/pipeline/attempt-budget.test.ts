import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decideNextAttempt, MAX_FRESH_RESTARTS, MAX_IN_SESSION_CORRECTIONS, type EscalationProfile, type IssueState, type RetryDecision } from '@agent-factory/domain';
import { SteppingClock } from '../runs/test-support.ts';
import type { FactoryEventRecord } from '../ports.ts';
import { PIPELINE_EVENTS } from './journal-events.ts';
import { currentAttempt, projectJournal, type PipelineJournal } from './pipeline-journal.ts';
import { PullRequestFeedback } from './pull-request-feedback.ts';
import { attemptHistory } from './retry.ts';
import { ISSUE_NUMBER, PipelineScenario } from './testing/pipeline-scenario.ts';

const ESCALATION: EscalationProfile = { model: 'opus', effort: 'xhigh' };
const PULL_REQUEST = 100;
const ANSWER = 'Use the existing route guard.';
const NO_HISTORY = { inSessionCorrections: 0, freshRestarts: 0 };
const WHOLE_BUDGET: readonly RetryDecision['action'][] = [
  ...Array.from({ length: MAX_IN_SESSION_CORRECTIONS }, (): RetryDecision['action'] => 'resume-same-session'),
  ...Array.from({ length: MAX_FRESH_RESTARTS }, (): RetryDecision['action'] => 'fresh-session-escalated'),
  'needs-human',
];
const PATH_TO_IMPLEMENTING: readonly IssueState[] = ['spec-validated', 'authoring-checks', 'checks-frozen', 'implementing'];
const PATH_FROM_IMPLEMENTING_TO_PULL_REQUEST: readonly IssueState[] = ['gating', 'reviewing', 'producing-evidence', 'pr-open'];

type Gesture = 'fail' | 'feedback' | 'question';
type AttemptOutcome = 'success' | 'error' | 'decision-requested';

function record(sequence: number, type: string, payload: unknown): FactoryEventRecord {
  return { sequence, occurredAt: new Date(Date.UTC(2026, 9, 12, 12, 0, sequence)), type, subject: `issue/${ISSUE_NUMBER}`, payload };
}

const attemptEnded = (attempt: number, runId: string): unknown => ({
  attempt,
  mode: 'initial',
  model: 'sonnet',
  effort: 'high',
  runId,
  sessionId: `session-${runId}`,
  outcome: 'error',
  gateBlocks: 0,
  finalTextTail: '',
});

const decided = (afterAttempt: number, decision: RetryDecision, extra: object = {}): unknown => ({
  afterAttempt,
  failure: { source: 'gate', summary: 'lint failed' },
  decision,
  ...extra,
});

describe('the journal of a cycle', () => {
  it('counts a retry decision recorded without a flag as a failure of the cycle', () => {
    const journal = projectJournal(ISSUE_NUMBER, [
      record(1, PIPELINE_EVENTS.implementerAttemptFinished, attemptEnded(0, 'run-1')),
      record(2, PIPELINE_EVENTS.retryDecided, decided(0, { action: 'resume-same-session' })),
    ]);
    expect(journal.decisions[0]?.opensCycle).toBe(false);
    expect(journal.attemptEpoch).toBe(0);
    expect(currentAttempt(journal)).toBe(1);
    expect(attemptHistory(journal)).toEqual({ inSessionCorrections: 1, freshRestarts: 0 });
  });

  it('opens a cycle with the decision that answers feedback, which counts as no failure', () => {
    const journal = projectJournal(ISSUE_NUMBER, [
      record(1, PIPELINE_EVENTS.implementerAttemptFinished, attemptEnded(0, 'run-1')),
      record(2, PIPELINE_EVENTS.retryDecided, decided(0, { action: 'resume-same-session' })),
      record(3, PIPELINE_EVENTS.implementerAttemptFinished, attemptEnded(1, 'run-2')),
      record(4, PIPELINE_EVENTS.retryDecided, decided(1, { action: 'resume-same-session' })),
      record(5, PIPELINE_EVENTS.implementerAttemptFinished, attemptEnded(2, 'run-3')),
      record(6, PIPELINE_EVENTS.retryDecided, decided(2, { action: 'fresh-session-escalated', profile: ESCALATION })),
      record(7, PIPELINE_EVENTS.implementerAttemptFinished, attemptEnded(3, 'run-4')),
      record(8, PIPELINE_EVENTS.retryDecided, decided(3, { action: 'resume-same-session' }, { opensCycle: true })),
    ]);
    expect(journal.attemptEpoch).toBe(4);
    expect(currentAttempt(journal)).toBe(4);
    expect(attemptHistory(journal)).toEqual(NO_HISTORY);
  });

  it('opens a cycle at the attempt that asked, when its question is answered', () => {
    const journal = projectJournal(ISSUE_NUMBER, [
      record(1, PIPELINE_EVENTS.implementerAttemptFinished, attemptEnded(0, 'run-1')),
      record(2, PIPELINE_EVENTS.retryDecided, decided(0, { action: 'resume-same-session' })),
      record(3, PIPELINE_EVENTS.implementerAttemptFinished, { ...(attemptEnded(1, 'run-2') as object), outcome: 'decision-requested', decisionRequest: 'Which guard?' }),
      record(4, PIPELINE_EVENTS.decisionAnswered, { runId: 'run-2', answer: ANSWER }),
    ]);
    expect(journal.attemptEpoch).toBe(1);
    expect(currentAttempt(journal)).toBe(1);
    expect(attemptHistory(journal)).toEqual(NO_HISTORY);
  });

  it('never moves the cycle back when an answer belongs to an attempt of an earlier cycle', () => {
    const journal = projectJournal(ISSUE_NUMBER, [
      record(1, PIPELINE_EVENTS.implementerAttemptFinished, attemptEnded(0, 'run-1')),
      record(2, PIPELINE_EVENTS.retryDecided, decided(0, { action: 'resume-same-session' }, { opensCycle: true })),
      record(3, PIPELINE_EVENTS.decisionAnswered, { runId: 'run-1', answer: ANSWER }),
    ]);
    expect(journal.attemptEpoch).toBe(1);
  });
});

/** An issue driven through the operator's gestures and the failures between them, by the use cases themselves. */
class Cycles {
  private readonly scenario = new PipelineScenario();
  private runs = 0;

  async start(): Promise<void> {
    await this.scenario.states.transition(ISSUE_NUMBER, 'spec-draft', 'drafted');
    await this.walk(PATH_TO_IMPLEMENTING);
    await this.scenario.events.append(PIPELINE_EVENTS.pullRequestOpened, `issue/${ISSUE_NUMBER}`, { number: PULL_REQUEST, url: 'https://forge.example/pull/100', headSha: 'a'.repeat(40) });
  }

  journal(): Promise<PipelineJournal> {
    return this.scenario.journal();
  }

  /** What the retry policy decides when the current attempt fails now. */
  async nextDecision(): Promise<RetryDecision> {
    return decideNextAttempt(attemptHistory(await this.journal()), ESCALATION);
  }

  /** The current attempt fails and the retry policy decides what follows. */
  async fail(): Promise<RetryDecision['action']> {
    const decision = await this.nextDecision();
    const attempt = currentAttempt(await this.journal());
    await this.endAttempt(attempt, 'error');
    await this.scenario.events.append(PIPELINE_EVENTS.retryDecided, `issue/${ISSUE_NUMBER}`, decided(attempt, decision));
    return decision.action;
  }

  /** The current attempt succeeds and the operator gives feedback on its pull request. */
  async feedback(): Promise<void> {
    await this.endAttempt(currentAttempt(await this.journal()), 'success');
    await this.walk(PATH_FROM_IMPLEMENTING_TO_PULL_REQUEST);
    const feedback = new PullRequestFeedback({ ...this.scenario.dependencies(), clock: new SteppingClock(new Date(Date.UTC(2026, 9, 12, 13))) });
    await feedback.record({ pullRequestNumber: PULL_REQUEST, author: 'Dana', source: 'cli', body: 'Rename the link.' });
  }

  /** The current attempt asks for a decision and the operator answers it. */
  async question(): Promise<void> {
    await this.endAttempt(currentAttempt(await this.journal()), 'decision-requested');
    await this.scenario.states.transition(ISSUE_NUMBER, 'needs-human', 'the implementer asked for a decision');
    await this.scenario.resumer().resume(ISSUE_NUMBER, ANSWER);
  }

  private async endAttempt(attempt: number, outcome: AttemptOutcome): Promise<void> {
    this.runs += 1;
    const ended = { ...(attemptEnded(attempt, `run-${this.runs}`) as object), outcome, decisionRequest: outcome === 'decision-requested' ? 'Which guard?' : null };
    await this.scenario.events.append(PIPELINE_EVENTS.implementerAttemptFinished, `issue/${ISSUE_NUMBER}`, ended);
  }

  private async walk(states: readonly IssueState[]): Promise<void> {
    for (const state of states) await this.scenario.states.transition(ISSUE_NUMBER, state, 'test path');
  }
}

describe('the failure budget across the operator’s gestures', () => {
  it('starts afresh after any feedback or answer, whatever the failures and gestures before it', async () => {
    const gestures = fc.array(fc.constantFrom<Gesture>('fail', 'feedback', 'question'), { maxLength: 12 });
    const opening = fc.constantFrom<Gesture>('feedback', 'question');
    await fc.assert(
      fc.asyncProperty(gestures, opening, async (history, last) => {
        const cycles = new Cycles();
        await cycles.start();
        for (const gesture of [...history, last]) {
          const before = await cycles.journal();
          if (gesture === 'fail') {
            if ((await cycles.nextDecision()).action === 'needs-human') continue;
            await cycles.fail();
            expect(currentAttempt(await cycles.journal())).toBe(currentAttempt(before) + 1);
            continue;
          }
          await (gesture === 'feedback' ? cycles.feedback() : cycles.question());
          const after = await cycles.journal();
          expect(attemptHistory(after)).toEqual(NO_HISTORY);
          expect(after.attemptEpoch).toBe(currentAttempt(after));
          expect(currentAttempt(after)).toBe(currentAttempt(before) + (gesture === 'feedback' ? 1 : 0));
        }
        const decisions: RetryDecision['action'][] = [];
        while (decisions.at(-1) !== 'needs-human') decisions.push(await cycles.fail());
        expect(decisions).toEqual(WHOLE_BUDGET);
      }),
      { numRuns: 60 },
    );
  });
});
