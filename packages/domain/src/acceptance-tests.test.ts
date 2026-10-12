import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  acceptanceTestResults,
  criteriaOf,
  testNameOf,
  evaluateBaseRun,
  evaluateBranchRun,
  isStructuredRunner,
  reportedFileMatches,
  sandboxRefusalOf,
  type CriterionChecks,
  type TestCaseResult,
  type TestRunReport,
} from './acceptance-tests.ts';

const CHECK = 'agent/tests/test_checkout.py';
const REPORTED = 'tests/test_checkout.py';

function test(id: string, outcome: TestCaseResult['outcome'], failureKind: TestCaseResult['failureKind'] = null, file = REPORTED): TestCaseResult {
  return { id: `${file}::${id}`, file, outcome, failureKind, failureMessage: failureKind === null ? null : `${failureKind} in ${id}` };
}

function report(cases: readonly TestCaseResult[], collectionErrors: TestRunReport['collectionErrors'] = []): TestRunReport {
  return { cases, collectionErrors };
}

const CRITERIA: readonly CriterionChecks[] = [
  { criterion: 1, files: [CHECK], onBase: 'fails' },
  { criterion: 2, files: ['agent/tests/test_totals.py'], onBase: 'passes' },
];

const BASE = report([
  test('test_discount', 'failed', 'assertion'),
  test('test_refund', 'failed', 'assertion'),
  test('test_total', 'passed', null, 'tests/test_totals.py'),
  test('test_unrelated', 'failed', 'error', 'tests/test_other.py'),
]);

describe('evaluateBaseRun', () => {
  it('accepts a base where each new-behaviour criterion fails by an assertion and the kept behaviour passes', () => {
    const evaluation = evaluateBaseRun(BASE, CRITERIA);
    expect(evaluation.problems).toEqual([]);
    expect(evaluation.failingCriteria).toEqual([1]);
    expect(evaluation.tests.map((entry) => [entry.id, entry.criteria])).toEqual([
      ['tests/test_checkout.py::test_discount', [1]],
      ['tests/test_checkout.py::test_refund', [1]],
      ['tests/test_totals.py::test_total', [2]],
    ]);
  });

  it('rejects a base where the checks did not load', () => {
    const evaluation = evaluateBaseRun(report([], [{ file: REPORTED, message: "ImportError while importing test module\nNo module named 'shop'" }]), CRITERIA);
    expect(evaluation.problems).toContain('tests/test_checkout.py did not load: ImportError while importing test module');
    expect(evaluation.problems).toContain('no test of the frozen check files ran');
  });

  it('rejects a check that is red for another reason than an assertion', () => {
    const evaluation = evaluateBaseRun(report([...BASE.cases, test('test_receipt', 'failed', 'error')]), CRITERIA);
    expect(evaluation.problems).toEqual(['tests/test_checkout.py::test_receipt fails on base for another reason than an assertion: error in test_receipt']);
  });

  it('rejects an assertion that only fails because the sandbox refused the network', () => {
    const refused = 'dial tcp: lookup raw.githubusercontent.com on 192.168.1.1:53: dial udp 192.168.1.1:53: connect: operation not permitted';
    const lint: TestCaseResult = {
      id: `${REPORTED}::test_lint_runs_the_route_check`,
      file: REPORTED,
      outcome: 'failed',
      failureKind: 'assertion',
      failureMessage: `AssertionError: mise run lint fails on an unmodified copy of the repository:\n  [lint:helm] failed downloading schema: ${refused}\n  [lint:app] ok`,
    };
    const evaluation = evaluateBaseRun(report([lint, test('test_total', 'passed', null, 'tests/test_totals.py')]), CRITERIA);
    expect(evaluation.problems).toEqual([
      `tests/test_checkout.py::test_lint_runs_the_route_check fails on base because the sandbox refused it network or file access, which the checks never get: [lint:helm] failed downloading schema: ${refused}`,
      `criterion 1: no assertion fails on base in ${CHECK}`,
    ]);
    expect(evaluation.failingCriteria).toEqual([]);
  });

  it('requires an assertion failure for every criterion that adds behaviour', () => {
    const evaluation = evaluateBaseRun(report([test('test_discount', 'passed'), test('test_total', 'passed', null, 'tests/test_totals.py')]), CRITERIA);
    expect(evaluation.problems).toEqual([`criterion 1: no assertion fails on base in ${CHECK}`]);
    expect(evaluation.failingCriteria).toEqual([]);
  });

  it('requires the kept behaviour to pass on base', () => {
    const evaluation = evaluateBaseRun(report([test('test_discount', 'failed', 'assertion'), test('test_total', 'failed', 'assertion', 'tests/test_totals.py')]), CRITERIA);
    expect(evaluation.problems).toEqual([
      'criterion 2: no test passes on base in agent/tests/test_totals.py',
      "criterion 2 keeps today's behaviour but tests/test_totals.py::test_total fails on base: assertion in test_total",
    ]);
  });
});

describe('evaluateBranchRun', () => {
  const base = evaluateBaseRun(report([...BASE.cases, test('test_skipped', 'skipped')]), CRITERIA).tests;

  it('passes when every test that ran on base passes on the branch', () => {
    const branch = report([test('test_discount', 'passed'), test('test_refund', 'passed'), test('test_total', 'passed', null, 'tests/test_totals.py'), test('test_skipped', 'skipped')]);
    expect(evaluateBranchRun(base, branch)).toEqual({
      passed: true,
      problems: [],
      tests: [
        { id: 'tests/test_checkout.py::test_discount', outcome: 'passed' },
        { id: 'tests/test_checkout.py::test_refund', outcome: 'passed' },
        { id: 'tests/test_totals.py::test_total', outcome: 'passed' },
        { id: 'tests/test_checkout.py::test_skipped', outcome: 'skipped' },
      ],
    });
  });

  it('fails when a test is removed, skipped or failing on the branch', () => {
    const branch = report([test('test_discount', 'skipped'), test('test_total', 'failed', 'assertion', 'tests/test_totals.py'), test('test_skipped', 'skipped')]);
    const evaluation = evaluateBranchRun(base, branch);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.problems).toEqual([
      'tests/test_checkout.py::test_discount ran on base but is skipped on the branch',
      'tests/test_checkout.py::test_refund ran on base but not on the branch',
      'tests/test_totals.py::test_total fails: assertion in test_total',
    ]);
    expect(evaluation.tests.find((entry) => entry.id.endsWith('test_refund'))?.outcome).toBe('missing');
  });

  it('fails when the checks no longer load on the branch', () => {
    expect(evaluateBranchRun(base, report([], [{ file: null, message: 'SyntaxError' }])).problems[0]).toBe('the test run did not load: SyntaxError');
  });
});

describe('reportedFileMatches', () => {
  it('matches a path reported relative to a sub-project or absolute', () => {
    expect(reportedFileMatches('tests/test_checkout.py', CHECK)).toBe(true);
    expect(reportedFileMatches(CHECK, CHECK)).toBe(true);
    expect(reportedFileMatches('/work/shop/agent/tests/test_checkout.py', CHECK)).toBe(true);
    expect(reportedFileMatches('tests/test_other.py', CHECK)).toBe(false);
    expect(reportedFileMatches('checkout.py', CHECK)).toBe(false);
  });
});

describe('isStructuredRunner', () => {
  it('treats eval as scored rather than structured', () => {
    expect(isStructuredRunner('vitest')).toBe(true);
    expect(isStructuredRunner('eval')).toBe(false);
  });
});

describe('sandboxRefusalOf', () => {
  it('finds the line where the sandbox refused a connection, a name lookup or a write', () => {
    const refusals = [
      'Error: connect EPERM 140.82.121.4:443',
      'Error: getaddrinfo ENOTFOUND registry.npmjs.org',
      'curl: (6) Could not resolve host: example.com',
      'socket.gaierror: [Errno 8] nodename nor servname provided, or not known',
      "PermissionError: [Errno 1] Operation not permitted: '/Users/someone/.cache/x'",
      "Error: EPERM: operation not permitted, open '/Users/someone/.config/tool.json'",
    ];
    for (const refusal of refusals) expect(sandboxRefusalOf(`AssertionError: expected 200\n${refusal}\n  at run`)).toBe(refusal);
  });

  it('leaves ordinary assertion failures alone', () => {
    expect(sandboxRefusalOf('AssertionError: expected the user to be refused with 403 Forbidden, got 200')).toBeNull();
    expect(sandboxRefusalOf("expect(received).toBe(expected): 'operation not permitted for viewers'")).toBeNull();
    expect(sandboxRefusalOf(null)).toBeNull();
  });
});

describe('criteriaOf', () => {
  const shared: readonly CriterionChecks[] = [
    { criterion: 1, files: ['agent/tests/test_refusal.py'], onBase: 'fails' },
    { criterion: 2, files: ['agent/tests/test_refusal.py'], onBase: 'fails' },
    { criterion: 3, files: ['app/test/quota.test.ts'], onBase: 'passes' },
  ];

  it('attributes a test of a shared file to the criterion its name gives', () => {
    expect(criteriaOf('tests/test_refusal.py::test_criterion_2_the_refusal_is_logged[os-error]', 'tests/test_refusal.py', shared)).toEqual([2]);
    expect(criteriaOf('app/test/quota.test.ts > quota > criterion 3: keeps turns', 'app/test/quota.test.ts', shared)).toEqual([3]);
  });

  it('falls back to every criterion of the file when the name gives none of them', () => {
    expect(criteriaOf('tests/test_refusal.py::test_refuses_and_logs', 'tests/test_refusal.py', shared)).toEqual([1, 2]);
    expect(criteriaOf('tests/test_refusal.py::test_criterion_3_elsewhere', 'tests/test_refusal.py', shared)).toEqual([1, 2]);
    expect(criteriaOf('tests/test_criterion_12.py::test_x', 'tests/test_criterion_12.py', shared)).toEqual([]);
  });

  it('reads a criterion number whole', () => {
    const many: readonly CriterionChecks[] = [1, 12].map((criterion) => ({ criterion, files: ['t.py'], onBase: 'fails' as const }));
    expect(criteriaOf('t.py::test_criterion_12_x', 't.py', many)).toEqual([12]);
  });
});

describe('acceptanceTestResults', () => {
  it('names each test without its file and classifies its base and branch results', () => {
    const base = [
      { id: 'tests/test_x.py::test_criterion_1_refuses[os-error]', file: 'tests/test_x.py', criteria: [1], outcome: 'failed' as const, failureKind: 'assertion' as const, failureMessage: 'assert 0' },
      { id: 'tests/test_z.py::test_keeps', file: 'tests/test_z.py', criteria: [2], outcome: 'passed' as const, failureKind: null, failureMessage: null },
      { id: 'tests/test_y.py::test_broken', file: 'tests/test_y.py', criteria: [1], outcome: 'failed' as const, failureKind: 'error' as const, failureMessage: 'ImportError' },
    ];
    const branch = [
      { id: 'tests/test_x.py::test_criterion_1_refuses[os-error]', outcome: 'passed' as const },
      { id: 'tests/test_z.py::test_keeps', outcome: 'skipped' as const },
    ];
    expect(acceptanceTestResults(base, branch, [{ criterion: 1, files: ['tests/test_x.py', 'tests/test_y.py'], onBase: 'fails' }, { criterion: 2, files: ['tests/test_z.py'], onBase: 'passes' }])).toEqual([
      { criterion: 1, test: base[0]?.id, name: 'test_criterion_1_refuses[os-error]', base: 'red-assertion', branch: 'green' },
      { criterion: 1, test: base[2]?.id, name: 'test_broken', base: 'red-error', branch: 'not-run' },
      { criterion: 2, test: base[1]?.id, name: 'test_keeps', base: 'green', branch: 'skipped' },
    ]);
  });

  it('recomputes the criteria of a test from the checks, whatever the criteria stored with it', () => {
    const checks: readonly CriterionChecks[] = [
      { criterion: 1, files: ['agent/tests/test_refusal.py'], onBase: 'fails' },
      { criterion: 2, files: ['agent/tests/test_refusal.py'], onBase: 'fails' },
    ];
    const base = [
      { id: 'tests/test_refusal.py::test_criterion_1_refuses', file: 'tests/test_refusal.py', criteria: [1, 2], outcome: 'passed' as const, failureKind: null, failureMessage: null },
      { id: 'tests/test_refusal.py::test_criterion_2_logs', file: 'tests/test_refusal.py', criteria: [1, 2], outcome: 'passed' as const, failureKind: null, failureMessage: null },
    ];
    expect(acceptanceTestResults(base, [], checks).map((row) => [row.criterion, row.name])).toEqual([
      [1, 'test_criterion_1_refuses'],
      [2, 'test_criterion_2_logs'],
    ]);
  });

  it('keeps a test under the file-level criteria when its name names none of them', () => {
    const checks: readonly CriterionChecks[] = [
      { criterion: 1, files: ['tests/test_a.py'], onBase: 'fails' },
      { criterion: 2, files: ['tests/test_a.py'], onBase: 'fails' },
    ];
    const base = [{ id: 'tests/test_a.py::test_both', file: 'tests/test_a.py', criteria: [1, 2], outcome: 'passed' as const, failureKind: null, failureMessage: null }];
    expect(acceptanceTestResults(base, [], checks).map((row) => row.criterion)).toEqual([1, 2]);
  });

  it('never lists a test under a criterion its name excludes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 9 }), (named, other) => {
        fc.pre(named !== other);
        const checks: readonly CriterionChecks[] = [named, other].map((criterion) => ({ criterion, files: ['t.py'], onBase: 'fails' as const }));
        const base = [{ id: `t.py::test_criterion_${named}_x`, file: 't.py', criteria: [named, other], outcome: 'passed' as const, failureKind: null, failureMessage: null }];
        expect(acceptanceTestResults(base, [], checks).map((row) => row.criterion)).toEqual([named]);
      }),
    );
  });

  it('strips the file of vitest and Playwright ids and keeps an id that does not carry its file', () => {
    expect(testNameOf('test/quota.test.ts > quota > refuses', 'test/quota.test.ts')).toBe('quota > refuses');
    expect(testNameOf('[chromium] > e2e/a.spec.ts > opens', 'e2e/a.spec.ts')).toBe('opens');
    expect(testNameOf('test_standalone', 'tests/test_x.py')).toBe('test_standalone');
  });
});
