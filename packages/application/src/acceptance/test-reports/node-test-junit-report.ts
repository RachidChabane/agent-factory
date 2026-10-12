import { reportedFileMatches, type CollectionError, type FailureKind, type TestCaseResult, type TestRunReport } from '@agent-factory/domain';
import { TestReportFormatError, relativeToWorktree } from './report-paths.ts';
import { parseXml, XmlFormatError, type XmlElement } from './xml-document.ts';

export const NODE_TEST_RUNNER = 'node-test';
const TESTSUITE = 'testsuite';
const TESTCASE = 'testcase';
const FAILURE = 'failure';
const SKIPPED = 'skipped';
const ID_SEPARATOR = ' > ';
const ASSERTION_EXCEPTION = 'AssertionError';
/** The exception a failing test threw, as the junit reporter prints it: `cause: AssertionError [ERR_ASSERTION]: …`. */
const CAUSE = /^\s*cause: ([A-Za-z_$][\w$]*)/m;

function attribute(element: XmlElement, name: string): string | null {
  return element.attributes[name] ?? null;
}

function failureKind(failure: XmlElement): FailureKind {
  return CAUSE.exec(failure.text)?.[1] === ASSERTION_EXCEPTION ? 'assertion' : 'error';
}

function failureMessage(failure: XmlElement): string {
  return attribute(failure, 'message') ?? failure.text.trim();
}

function readCase(testcase: XmlElement, suites: readonly string[], worktreePath: string): TestCaseResult | CollectionError {
  const name = attribute(testcase, 'name') ?? '';
  const reportedFile = attribute(testcase, 'file');
  if (reportedFile === null) throw new TestReportFormatError(NODE_TEST_RUNNER, `test case ${name} has no file attribute`);
  const file = relativeToWorktree(reportedFile, worktreePath);
  const failure = testcase.children.find((child) => child.name === FAILURE);
  // The runner reports a file that fails outside any test as one test case named after the file.
  if (suites.length === 0 && failure !== undefined && reportedFileMatches(name, file)) {
    return { file, message: failure.text.trim() === '' ? failureMessage(failure) : failure.text.trim() };
  }
  const id = [file, ...suites, name].join(ID_SEPARATOR);
  if (failure !== undefined) return { id, file, outcome: 'failed', failureKind: failureKind(failure), failureMessage: failureMessage(failure) };
  const skipped = testcase.children.some((child) => child.name === SKIPPED);
  return { id, file, outcome: skipped ? 'skipped' : 'passed', failureKind: null, failureMessage: null };
}

function collect(element: XmlElement, suites: readonly string[], worktreePath: string, entries: (TestCaseResult | CollectionError)[]): void {
  for (const child of element.children) {
    if (child.name === TESTCASE) entries.push(readCase(child, suites, worktreePath));
    else if (child.name === TESTSUITE) collect(child, [...suites, attribute(child, 'name') ?? ''], worktreePath, entries);
    else collect(child, suites, worktreePath, entries);
  }
}

function isTestCase(entry: TestCaseResult | CollectionError): entry is TestCaseResult {
  return 'id' in entry;
}

function isCollectionError(entry: TestCaseResult | CollectionError): entry is CollectionError {
  return !isTestCase(entry);
}

/** Reads the junit report of the Node.js test runner; nested describe blocks become `file > suite > test` ids. */
export function parseNodeTestJunitReport(text: string, worktreePath: string): TestRunReport {
  let document: XmlElement;
  try {
    document = parseXml(text);
  } catch (error) {
    if (error instanceof XmlFormatError) throw new TestReportFormatError(NODE_TEST_RUNNER, error.message);
    throw error;
  }
  const entries: (TestCaseResult | CollectionError)[] = [];
  collect(document, [], worktreePath, entries);
  return { cases: entries.filter(isTestCase), collectionErrors: entries.filter(isCollectionError) };
}
