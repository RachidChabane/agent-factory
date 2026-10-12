import type { AutonomyView, DelegatedDecisionView } from '@agent-factory/cockpit';
import { delegatedDecisionsOf, type DelegatedDecision, type FactoryEventRecord } from '@agent-factory/application';
import type { AutonomyPolicy } from '@agent-factory/domain';
import { iso } from './event-index.ts';

/** The most decisions a project's view lists, newest first: the oldest are left out. */
export const DELEGATED_DECISIONS_LIMIT = 50;

function decisionView(decision: DelegatedDecision): DelegatedDecisionView {
  return {
    at: iso(decision.at),
    actor: decision.actor,
    gesture: decision.gesture,
    target: { kind: decision.target.kind, number: decision.target.number },
    issueNumber: decision.issueNumber,
    reason: decision.reason,
    rule: decision.rule,
  };
}

/** The gestures the delegate made in these records, newest first. */
export function delegatedDecisionViews(records: readonly FactoryEventRecord[], limit: number = DELEGATED_DECISIONS_LIMIT): DelegatedDecisionView[] {
  return delegatedDecisionsOf(records).slice(0, limit).map(decisionView);
}

/** The gestures the delegate made on a pull request, among the decisions of its issue. */
export function pullRequestDecisions(decisions: readonly DelegatedDecisionView[], pullRequestNumber: number): DelegatedDecisionView[] {
  return decisions.filter((decision) => decision.target.kind === 'pull-request' && decision.target.number === pullRequestNumber);
}

export function autonomyView(policy: AutonomyPolicy): AutonomyView {
  return {
    actor: policy.actor,
    validateSpecs: policy.validateSpecs,
    answerDecisions: policy.answerDecisions,
    resume: policy.resume,
    merge: policy.merge.map((rule) => ({ types: [...rule.types], requires: [...rule.requires] })),
  };
}
