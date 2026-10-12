import type { RunOutcomeSummary } from '@agent-factory/cockpit';
import { firstLineOf, testNameOf } from '@agent-factory/domain';
import type { AcceptanceTestOnBase, AcceptanceTestOnBranch } from '@agent-factory/domain';

const NEWLINE = '\n';
const FAILURE_MESSAGE_LINES = 3;

function messageHead(message: string | null): string | null {
  if (message === null) return null;
  const lines = message.split(NEWLINE).map((line) => line.trim()).filter((line) => line !== '');
  return lines.length === 0 ? null : lines.slice(0, FAILURE_MESSAGE_LINES).map(firstLineOf).join(NEWLINE);
}

export function baseRunSummary(tests: readonly AcceptanceTestOnBase[]): RunOutcomeSummary {
  return {
    passed: tests.filter((test) => test.outcome === 'passed').length,
    failed: tests.filter((test) => test.outcome === 'failed').length,
    skipped: tests.filter((test) => test.outcome === 'skipped').length,
    failures: tests.filter((test) => test.outcome === 'failed').map((test) => ({ test: testNameOf(test.id, test.file), message: messageHead(test.failureMessage) })),
    missing: [],
  };
}

export function branchRunSummary(base: readonly AcceptanceTestOnBase[], branch: readonly AcceptanceTestOnBranch[]): RunOutcomeSummary {
  const outcomes = new Map(branch.map((test) => [test.id, test.outcome]));
  const outcomeOf = (test: AcceptanceTestOnBase): AcceptanceTestOnBranch['outcome'] => outcomes.get(test.id) ?? 'missing';
  const named = (test: AcceptanceTestOnBase): string => testNameOf(test.id, test.file);
  return {
    passed: base.filter((test) => outcomeOf(test) === 'passed').length,
    failed: base.filter((test) => outcomeOf(test) === 'failed').length,
    skipped: base.filter((test) => outcomeOf(test) === 'skipped').length,
    failures: base.filter((test) => outcomeOf(test) === 'failed').map((test) => ({ test: named(test), message: null })),
    missing: base.filter((test) => outcomeOf(test) === 'missing').map(named),
  };
}
