import { describe, expect, it } from 'vitest';
import type { AcceptanceTestOnBase, CriterionChecks } from '@agent-factory/domain';
import { acceptanceTestRows } from './acceptance-test-table.ts';

const FILE = 'tests/test_refusal.py';
const CHECKS: readonly CriterionChecks[] = [
  { criterion: 1, files: ['agent/tests/test_refusal.py'], onBase: 'fails' },
  { criterion: 2, files: ['agent/tests/test_refusal.py'], onBase: 'fails' },
];

function baseTest(name: string, criteria: readonly number[]): AcceptanceTestOnBase {
  return { id: `${FILE}::${name}`, file: FILE, criteria, outcome: 'failed', failureKind: 'assertion', failureMessage: 'assert False' };
}

describe('acceptanceTestRows', () => {
  it('lists a test of a shared file once, under the criterion its name gives, whatever the criteria stored with it', () => {
    const base = [baseTest('test_criterion_1_refuses', [1, 2]), baseTest('test_criterion_2_logs', [1, 2])];
    const branch = base.map((test) => ({ id: test.id, outcome: 'passed' as const }));
    expect(acceptanceTestRows(base, branch, CHECKS).map((row) => [row.criterion, row.test.split('::')[1], row.base, row.branch])).toEqual([
      [1, 'test_criterion_1_refuses', 'red (assertion)', 'green'],
      [2, 'test_criterion_2_logs', 'red (assertion)', 'green'],
    ]);
  });
});
