import type { CollectionError, FailureKind, TestCaseResult, TestRunReport } from '@agent-factory/domain';
import { TestReportFormatError, relativeToWorktree } from './report-paths.ts';
import { descendants, parseXml, XmlFormatError, type XmlElement } from './xml-document.ts';

export const PYTEST_RUNNER = 'pytest';
const TESTCASE = 'testcase';
const FAILURE = 'failure';
const ERROR = 'error';
const SKIPPED = 'skipped';
const COLLECTION_FAILURE = 'collection failure';
const PYTHON_EXTENSION = /\.py$/;
const PATH_SEPARATOR = /\//g;
const MODULE_SEPARATOR = '.';
const ID_SEPARATOR = '::';
const ASSERTION_EXCEPTIONS: readonly string[] = ['AssertionError', 'Failed'];
const RAISED_AT = /^.+:\d+: ([A-Za-z_][\w.]*)$/;

function attribute(element: XmlElement, name: string): string | null {
  return element.attributes[name] ?? null;
}

function raisedException(text: string): string | null {
  const lastLine = text.trim().split('\n').at(-1)?.trim() ?? '';
  return RAISED_AT.exec(lastLine)?.[1] ?? null;
}

function failureKind(failure: XmlElement): FailureKind {
  const exception = raisedException(failure.text);
  return exception !== null && ASSERTION_EXCEPTIONS.includes(exception) ? 'assertion' : 'error';
}

function testId(file: string, classname: string, name: string): string {
  const module = file.replace(PYTHON_EXTENSION, '').replace(PATH_SEPARATOR, MODULE_SEPARATOR);
  const classes = classname.startsWith(`${module}${MODULE_SEPARATOR}`) ? classname.slice(module.length + 1).split(MODULE_SEPARATOR) : [];
  return [file, ...classes, name].join(ID_SEPARATOR);
}

function failureMessage(element: XmlElement): string {
  return attribute(element, 'message') ?? element.text;
}

function readCase(testcase: XmlElement, worktreePath: string): TestCaseResult | CollectionError {
  const reportedFile = attribute(testcase, 'file');
  const classname = attribute(testcase, 'classname') ?? '';
  const name = attribute(testcase, 'name') ?? '';
  const failure = testcase.children.find((child) => child.name === FAILURE);
  const error = testcase.children.find((child) => child.name === ERROR);
  if (error !== undefined && (classname === '' || attribute(error, 'message') === COLLECTION_FAILURE)) {
    return { file: reportedFile === null ? null : relativeToWorktree(reportedFile, worktreePath), message: error.text.trim() === '' ? failureMessage(error) : error.text };
  }
  if (reportedFile === null) {
    throw new TestReportFormatError(PYTEST_RUNNER, `test case ${classname}.${name} has no file attribute; pytest must run with -o junit_family=xunit1`);
  }
  const file = relativeToWorktree(reportedFile, worktreePath);
  const id = testId(file, classname, name);
  if (failure !== undefined) return { id, file, outcome: 'failed', failureKind: failureKind(failure), failureMessage: failureMessage(failure) };
  if (error !== undefined) return { id, file, outcome: 'failed', failureKind: 'error', failureMessage: failureMessage(error) };
  const skipped = testcase.children.some((child) => child.name === SKIPPED);
  return { id, file, outcome: skipped ? 'skipped' : 'passed', failureKind: null, failureMessage: null };
}

function isTestCase(entry: TestCaseResult | CollectionError): entry is TestCaseResult {
  return 'id' in entry;
}

function isCollectionError(entry: TestCaseResult | CollectionError): entry is CollectionError {
  return !isTestCase(entry);
}

export function parsePytestJunitReport(text: string, worktreePath: string): TestRunReport {
  let document: XmlElement;
  try {
    document = parseXml(text);
  } catch (error) {
    if (error instanceof XmlFormatError) throw new TestReportFormatError(PYTEST_RUNNER, error.message);
    throw error;
  }
  const entries = descendants(document, TESTCASE).map((testcase) => readCase(testcase, worktreePath));
  return { cases: entries.filter(isTestCase), collectionErrors: entries.filter(isCollectionError) };
}
