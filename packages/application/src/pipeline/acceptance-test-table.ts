import { acceptanceTestResults } from '@agent-factory/domain';
import type { AcceptanceTestOnBase, AcceptanceTestOnBranch, BaseTestResult, BranchTestResult, CriterionChecks } from '@agent-factory/domain';

export const BASE_RESULT_LABELS: Readonly<Record<BaseTestResult, string>> = {
  'red-assertion': 'red (assertion)',
  'red-error': 'red (error)',
  green: 'green',
  skipped: 'skipped',
};

export const BRANCH_RESULT_LABELS: Readonly<Record<BranchTestResult, string>> = {
  green: 'green',
  red: 'red',
  skipped: 'skipped',
  missing: 'missing',
  'not-run': 'not run',
};

export interface AcceptanceTestRow {
  readonly criterion: number;
  readonly test: string;
  readonly base: string;
  readonly branch: string;
}

export function acceptanceTestRows(
  base: readonly AcceptanceTestOnBase[],
  branch: readonly AcceptanceTestOnBranch[],
  criteria: readonly CriterionChecks[],
): readonly AcceptanceTestRow[] {
  return acceptanceTestResults(base, branch, criteria).map((result) => ({
    criterion: result.criterion,
    test: result.test,
    base: BASE_RESULT_LABELS[result.base],
    branch: BRANCH_RESULT_LABELS[result.branch],
  }));
}
