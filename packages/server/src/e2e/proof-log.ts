import { expectMatch } from './expectations.ts';

/** The log the factory keeps of the frozen checks run on the base branch, named in the issue's log directory. */
export const BEFORE_PROOF_LOG = 'before-proof.log';
/** What Node's test runner prints for a test that failed on an assertion rather than on a crash. */
export const ASSERTION_FAILURE_CODE = 'ERR_ASSERTION';
const FAILED_TESTS_LINE = /^\S+ fail (?<failed>\d+)$/m;

/** How many tests the run in a Node test runner log reports as failed. */
export function failedTestCount(log: string): number {
  const match = expectMatch('the log of the checks on the base ends with the runner summary', FAILED_TESTS_LINE, log);
  return Number(match.groups?.['failed']);
}
