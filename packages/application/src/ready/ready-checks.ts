import type { ChecksVerdict } from '@agent-factory/domain';
import { mergeCheckProblems } from '../pipeline/merge-on-order.ts';
import type { CheckRunSummary } from '../ports.ts';

/**
 * Where the required checks of a head stand, by the rule that gates its merge: a check that also fails on the base
 * branch does not count against it. A forge that reports no check yet may only be slow to register them, so an
 * empty list counts as passed only once `settled`.
 */
export function requiredChecksVerdict(checks: readonly CheckRunSummary[], baseChecks: readonly CheckRunSummary[], settled: boolean): ChecksVerdict {
  const { failing, pending } = mergeCheckProblems(checks, baseChecks);
  if (failing.length > 0) return 'failed';
  if (pending.length > 0) return 'running';
  return checks.length > 0 || settled ? 'passed' : 'running';
}
