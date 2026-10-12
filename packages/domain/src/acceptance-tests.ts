export const TEST_RUNNERS = ['pytest', 'vitest', 'playwright', 'node-test', 'eval'] as const;
export type TestRunner = (typeof TEST_RUNNERS)[number];

export const STRUCTURED_TEST_RUNNERS = ['pytest', 'vitest', 'playwright', 'node-test'] as const satisfies readonly TestRunner[];
export type StructuredTestRunner = (typeof STRUCTURED_TEST_RUNNERS)[number];

export const SCORED_TEST_RUNNER = 'eval' satisfies TestRunner;

export const TEST_OUTCOMES = ['passed', 'failed', 'skipped'] as const;
export type TestOutcome = (typeof TEST_OUTCOMES)[number];

export const FAILURE_KINDS = ['assertion', 'error'] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

export const BASE_EXPECTATIONS = ['fails', 'passes'] as const;
export type BaseExpectation = (typeof BASE_EXPECTATIONS)[number];

export interface TestCaseResult {
  readonly id: string;
  readonly file: string;
  readonly outcome: TestOutcome;
  readonly failureKind: FailureKind | null;
  readonly failureMessage: string | null;
}

export interface CollectionError {
  readonly file: string | null;
  readonly message: string;
}

export interface TestRunReport {
  readonly cases: readonly TestCaseResult[];
  readonly collectionErrors: readonly CollectionError[];
}

export interface CriterionChecks {
  readonly criterion: number;
  readonly files: readonly string[];
  readonly onBase: BaseExpectation;
}

export interface AcceptanceTestOnBase {
  readonly id: string;
  readonly file: string;
  readonly criteria: readonly number[];
  readonly outcome: TestOutcome;
  readonly failureKind: FailureKind | null;
  readonly failureMessage: string | null;
}

export interface BaseRunEvaluation {
  readonly problems: readonly string[];
  readonly failingCriteria: readonly number[];
  readonly tests: readonly AcceptanceTestOnBase[];
}

export interface AcceptanceTestOnBranch {
  readonly id: string;
  readonly outcome: TestOutcome | 'missing';
}

export interface BranchRunEvaluation {
  readonly passed: boolean;
  readonly problems: readonly string[];
  readonly tests: readonly AcceptanceTestOnBranch[];
}

export function isStructuredRunner(runner: TestRunner): runner is StructuredTestRunner {
  return STRUCTURED_TEST_RUNNERS.some((candidate) => candidate === runner);
}

const PATH_SEPARATOR = '/';
const MESSAGE_PREVIEW_CHARACTERS = 300;
const NEWLINE = '\n';

export const SANDBOX_NETWORK_REFUSAL_PATTERNS: readonly RegExp[] = [
  /connect: operation not permitted/i,
  /\bconnect EPERM\b/,
  /\bgetaddrinfo (ENOTFOUND|EAI_AGAIN)\b/,
  /could not resolve host/i,
  /nodename nor servname provided/i,
  /temporary failure in name resolution/i,
];

export const SANDBOX_WRITE_REFUSAL_PATTERNS: readonly RegExp[] = [/\[Errno 1\] Operation not permitted/, /\bEPERM: operation not permitted\b/];

export const SANDBOX_REFUSAL_PATTERNS: readonly RegExp[] = [...SANDBOX_NETWORK_REFUSAL_PATTERNS, ...SANDBOX_WRITE_REFUSAL_PATTERNS];

export function sandboxRefusalOf(message: string | null): string | null {
  if (message === null) return null;
  const line = message.split(NEWLINE).find((candidate) => SANDBOX_REFUSAL_PATTERNS.some((pattern) => pattern.test(candidate)));
  return line === undefined ? null : previewOf(line);
}

export function reportedFileMatches(reportedFile: string, checkPath: string): boolean {
  return reportedFile === checkPath || checkPath.endsWith(`${PATH_SEPARATOR}${reportedFile}`) || reportedFile.endsWith(`${PATH_SEPARATOR}${checkPath}`);
}

function previewOf(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > MESSAGE_PREVIEW_CHARACTERS ? `${trimmed.slice(0, MESSAGE_PREVIEW_CHARACTERS)}…` : trimmed;
}

export function firstLineOf(message: string): string {
  return previewOf(message.trim().split(NEWLINE)[0] ?? '');
}

export const NAMED_CRITERION_PATTERN = /criterion[_\s-]?(\d+)(?!\d)/gi;

function namedCriteria(testId: string, file: string): readonly number[] {
  const name = testId.replace(file, '');
  return [...name.matchAll(NAMED_CRITERION_PATTERN)].map((match) => Number(match[1]));
}

export function criteriaOf(testId: string, file: string, criteria: readonly CriterionChecks[]): readonly number[] {
  const byFile = criteria.filter((entry) => entry.files.some((path) => reportedFileMatches(file, path))).map((entry) => entry.criterion);
  const named = namedCriteria(testId, file).filter((criterion) => byFile.includes(criterion));
  return named.length === 0 ? byFile : [...new Set(named)].sort((a, b) => a - b);
}

function describeCollectionError(error: CollectionError): string {
  return `${error.file ?? 'the test run'} did not load: ${firstLineOf(error.message)}`;
}

function isAssertionFailure(test: AcceptanceTestOnBase): boolean {
  return test.outcome === 'failed' && test.failureKind === 'assertion' && sandboxRefusalOf(test.failureMessage) === null;
}

export function evaluateBaseRun(report: TestRunReport, criteria: readonly CriterionChecks[]): BaseRunEvaluation {
  const tests: AcceptanceTestOnBase[] = report.cases.flatMap((test) => {
    const proving = criteriaOf(test.id, test.file, criteria);
    return proving.length === 0
      ? []
      : [{ id: test.id, file: test.file, criteria: proving, outcome: test.outcome, failureKind: test.failureKind, failureMessage: test.failureMessage }];
  });
  const problems: string[] = report.collectionErrors.map(describeCollectionError);
  if (tests.length === 0) problems.push('no test of the frozen check files ran');
  for (const test of tests.filter((entry) => entry.outcome === 'failed')) {
    const refusal = sandboxRefusalOf(test.failureMessage);
    if (refusal !== null) problems.push(`${test.id} fails on base because the sandbox refused it network or file access, which the checks never get: ${refusal}`);
    else if (test.failureKind !== 'assertion') problems.push(`${test.id} fails on base for another reason than an assertion: ${firstLineOf(test.failureMessage ?? '')}`);
  }
  const failingCriteria: number[] = [];
  for (const entry of criteria) {
    const proving = tests.filter((test) => test.criteria.includes(entry.criterion));
    if (entry.onBase === 'fails') {
      if (proving.some(isAssertionFailure)) failingCriteria.push(entry.criterion);
      else problems.push(`criterion ${entry.criterion}: no assertion fails on base in ${entry.files.join(', ')}`);
      continue;
    }
    if (!proving.some((test) => test.outcome === 'passed')) problems.push(`criterion ${entry.criterion}: no test passes on base in ${entry.files.join(', ')}`);
    for (const test of proving.filter((candidate) => candidate.outcome === 'failed')) {
      problems.push(`criterion ${entry.criterion} keeps today's behaviour but ${test.id} fails on base: ${firstLineOf(test.failureMessage ?? '')}`);
    }
  }
  return { problems: [...new Set(problems)], failingCriteria: [...new Set(failingCriteria)].sort((a, b) => a - b), tests };
}

export function evaluateBranchRun(base: readonly AcceptanceTestOnBase[], report: TestRunReport): BranchRunEvaluation {
  const problems: string[] = report.collectionErrors.map(describeCollectionError);
  const byId = new Map(report.cases.map((test) => [test.id, test]));
  const tests: AcceptanceTestOnBranch[] = base.map((test) => ({ id: test.id, outcome: byId.get(test.id)?.outcome ?? 'missing' }));
  for (const test of base) {
    const branch = byId.get(test.id);
    if (branch === undefined) {
      problems.push(`${test.id} ran on base but not on the branch`);
      continue;
    }
    if (branch.outcome === 'failed') problems.push(`${test.id} fails: ${firstLineOf(branch.failureMessage ?? '')}`);
    if (branch.outcome === 'skipped' && test.outcome !== 'skipped') problems.push(`${test.id} ran on base but is skipped on the branch`);
  }
  return { passed: problems.length === 0, problems, tests };
}

export const BASE_TEST_RESULTS = ['red-assertion', 'red-error', 'green', 'skipped'] as const;
export type BaseTestResult = (typeof BASE_TEST_RESULTS)[number];

export const BRANCH_TEST_RESULTS = ['green', 'red', 'skipped', 'missing', 'not-run'] as const;
export type BranchTestResult = (typeof BRANCH_TEST_RESULTS)[number];

export interface AcceptanceTestResult {
  readonly criterion: number;
  readonly test: string;
  readonly name: string;
  readonly base: BaseTestResult;
  readonly branch: BranchTestResult;
}

const TEST_NAME_SEPARATORS = /^(\s*(::|>)\s*)+/;

export function testNameOf(testId: string, file: string): string {
  const index = testId.indexOf(file);
  if (index === -1) return testId;
  const name = testId.slice(index + file.length).replace(TEST_NAME_SEPARATORS, '');
  return name === '' ? testId : name;
}

export function baseTestResult(test: Pick<AcceptanceTestOnBase, 'outcome' | 'failureKind'>): BaseTestResult {
  if (test.outcome === 'failed') return test.failureKind === 'assertion' ? 'red-assertion' : 'red-error';
  return test.outcome === 'passed' ? 'green' : 'skipped';
}

export function branchTestResult(outcome: AcceptanceTestOnBranch['outcome'] | undefined): BranchTestResult {
  if (outcome === undefined) return 'not-run';
  return outcome === 'passed' ? 'green' : outcome === 'failed' ? 'red' : outcome;
}

export function acceptanceTestResults(
  base: readonly AcceptanceTestOnBase[],
  branch: readonly AcceptanceTestOnBranch[],
  criteria: readonly CriterionChecks[],
): readonly AcceptanceTestResult[] {
  const onBranch = new Map(branch.map((test) => [test.id, test.outcome]));
  return base
    .flatMap((test) => {
      const proven = criteriaOf(test.id, test.file, criteria);
      return (proven.length === 0 ? test.criteria : proven).map((criterion) => ({
        criterion,
        test: test.id,
        name: testNameOf(test.id, test.file),
        base: baseTestResult(test),
        branch: branchTestResult(onBranch.get(test.id)),
      }));
    })
    .sort((left, right) => left.criterion - right.criterion);
}
