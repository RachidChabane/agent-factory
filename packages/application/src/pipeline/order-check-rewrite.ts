import { CHECK_REWRITABLE_STATES, isCheckRewriteExit, ISSUE_CHECK_REWRITE_STATE, ISSUE_ESCALATION_STATE } from '@agent-factory/domain';
import type { IssueState } from '@agent-factory/domain';
import type { Clock } from '../ports.ts';
import { PIPELINE_EVENTS, type CheckRewriteOrder } from './journal-events.ts';
import { IssueJournalWriter } from './journal-writer.ts';
import type { PipelineDependencies } from './pipeline-dependencies.ts';
import { loadJournal, type PipelineJournal } from './pipeline-journal.ts';

export const DRIVEN_REWRITABLE_STATES: readonly IssueState[] = ['checks-frozen', 'implementing', 'gating', 'reviewing', 'producing-evidence'];

export class CheckRewriteRefusedError extends Error {
  readonly issueNumber: number;

  constructor(issueNumber: number, reason: string) {
    super(`A check of issue #${issueNumber} cannot be rewritten: ${reason}`);
    this.name = 'CheckRewriteRefusedError';
    this.issueNumber = issueNumber;
  }
}

export type OrderCheckRewriteDependencies = Pick<PipelineDependencies, 'events' | 'states'> & { readonly clock: Clock };

export interface CheckRewriteOrderInput {
  readonly issueNumber: number;
  readonly path: string;
  readonly instruction: string;
  readonly operator: string;
}

export interface CheckRewriteOrderOutcome {
  readonly issueNumber: number;
  readonly path: string;
  readonly transitioned: boolean;
  readonly driven: boolean;
}

function refusal(journal: PipelineJournal, input: CheckRewriteOrderInput): string | null {
  const state = journal.state;
  if (state === null) return 'it is unknown to the factory';
  if (input.instruction.trim() === '') return 'the operator must say what the check has to assert';
  const escalated = state === ISSUE_ESCALATION_STATE;
  if (escalated && (journal.stateBeforeEscalation === null || !isCheckRewriteExit(journal.stateBeforeEscalation, ISSUE_CHECK_REWRITE_STATE))) {
    return 'it waits on the operator before its checks were frozen';
  }
  if (!escalated && !CHECK_REWRITABLE_STATES.includes(state)) {
    return state === ISSUE_CHECK_REWRITE_STATE
      ? `a rewrite of ${journal.checkRewrite?.order.path ?? 'a check'} is in progress`
      : `it is ${state}; a check is rewritten only while the issue waits on the operator or before its pull request is merged`;
  }
  if (journal.frozen === null) return 'its acceptance checks are not frozen';
  if (!journal.frozen.checks.some((check) => check.path === input.path)) {
    return `${input.path} is not one of its frozen checks (${journal.frozen.checks.map((check) => check.path).join(', ')})`;
  }
  if (journal.evidenceRemoval !== null) return 'its merge is being prepared';
  if (!escalated && journal.checkRewrite !== null) return `a rewrite of ${journal.checkRewrite.order.path} is already ordered`;
  return null;
}

export class OrderCheckRewrite {
  private readonly dependencies: OrderCheckRewriteDependencies;

  constructor(dependencies: OrderCheckRewriteDependencies) {
    this.dependencies = dependencies;
  }

  async order(input: CheckRewriteOrderInput): Promise<CheckRewriteOrderOutcome> {
    const { events, states, clock } = this.dependencies;
    const journal = await loadJournal(events, input.issueNumber);
    const refused = refusal(journal, input);
    if (refused !== null || journal.state === null) throw new CheckRewriteRefusedError(input.issueNumber, refused ?? 'it is unknown to the factory');
    const writer = new IssueJournalWriter(events, states, input.issueNumber);
    const order: CheckRewriteOrder = {
      path: input.path,
      instruction: input.instruction.trim(),
      operator: input.operator,
      orderedAt: clock.now().toISOString(),
      fromState: journal.state,
    };
    await writer.record(PIPELINE_EVENTS.checkRewriteOrdered, order);
    const driven = DRIVEN_REWRITABLE_STATES.includes(journal.state);
    if (!driven) await writer.transition(ISSUE_CHECK_REWRITE_STATE, `${input.operator} ordered a rewrite of ${input.path}`);
    return { issueNumber: input.issueNumber, path: input.path, transitioned: !driven, driven };
  }
}
