import type { StructuredTestRunner, TestRunReport } from '@agent-factory/domain';
import { parseNodeTestJunitReport } from './node-test-junit-report.ts';
import { parsePlaywrightJsonReport } from './playwright-json-report.ts';
import { parsePytestJunitReport } from './pytest-junit-report.ts';
import { parseVitestJsonReport } from './vitest-json-report.ts';

export interface RunnerReporting {
  readonly reportFile: string;
  readonly arguments: (reportPath: string) => readonly string[];
  readonly environment: (reportPath: string) => Readonly<Record<string, string>>;
  readonly parse: (text: string, worktreePath: string) => TestRunReport;
}

const NO_ENVIRONMENT: Readonly<Record<string, string>> = {};

export const RUNNER_REPORTING: Readonly<Record<StructuredTestRunner, RunnerReporting>> = {
  pytest: {
    reportFile: 'pytest.xml',
    arguments: (reportPath) => [`--junitxml=${reportPath}`, '-o', 'junit_family=xunit1'],
    environment: () => NO_ENVIRONMENT,
    parse: parsePytestJunitReport,
  },
  vitest: {
    reportFile: 'vitest.json',
    arguments: (reportPath) => ['--reporter=default', '--reporter=json', `--outputFile.json=${reportPath}`],
    environment: () => NO_ENVIRONMENT,
    parse: parseVitestJsonReport,
  },
  playwright: {
    reportFile: 'playwright.json',
    arguments: () => ['--reporter=list,json'],
    environment: (reportPath) => ({ PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath }),
    parse: parsePlaywrightJsonReport,
  },
  'node-test': {
    reportFile: 'node-test.xml',
    arguments: () => [],
    // The Node.js runner takes its reporters before the test files, so they travel in NODE_OPTIONS.
    environment: (reportPath) => ({
      NODE_OPTIONS: `--test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination="${reportPath}"`,
    }),
    parse: parseNodeTestJunitReport,
  },
};

export function readTestReport(runner: StructuredTestRunner, text: string, worktreePath: string): TestRunReport {
  return RUNNER_REPORTING[runner].parse(text, worktreePath);
}
