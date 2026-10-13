import type { PullRequestReadinessFacts } from '@agent-factory/domain';
import { mergeCheckProblems } from '../pipeline/merge-on-order.ts';
import type { CheckRunSummary } from '../ports.ts';

/** The part of the readiness facts that the checks of a head give. */
export type ReadinessCheckFacts = Pick<PullRequestReadinessFacts, 'failedChecks' | 'runningChecks' | 'checksReported'>;

function namesOf(checks: readonly CheckRunSummary[]): readonly string[] {
  return [...new Set(checks.map((check) => check.name))];
}

/**
 * Where the checks of a head stand for the ready notice. Every check the forge reports counts, whether the merge requires it
 * or not, and so does one that also fails on the base branch: the merge does not wait for such a check, but the operator
 * should not be told that the pull request is ready while a check is red. Skipped and neutral checks pass. A forge that
 * reports no check yet may only be slow to register them, so an empty report counts as made only once `settled`.
 */
export function readinessChecksOf(checks: readonly CheckRunSummary[], settled: boolean): ReadinessCheckFacts {
  const { failing, pending } = mergeCheckProblems(checks);
  return { failedChecks: namesOf(failing), runningChecks: namesOf(pending), checksReported: checks.length > 0 || settled };
}
