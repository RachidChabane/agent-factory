import type { StructuredTestRunner } from '@agent-factory/domain';
import { FACTORY_WORK_DIRECTORY, type AcceptanceManifest } from './acceptance-manifest.ts';
import { shellCommandLine, shellQuote } from './shell-quote.ts';
import { RUNNER_REPORTING } from './test-reports/test-report-reader.ts';

export const ACCEPTANCE_REPORT_DIRECTORY = `${FACTORY_WORK_DIRECTORY}/reports`;
const PATH_SEPARATOR = '/';
const ASSIGNMENT = '=';
const WORD_SEPARATOR = ' ';

export interface StructuredAcceptanceCommand {
  readonly command: string;
  readonly reportPath: string;
}

export function structuredAcceptanceCommand(
  manifest: AcceptanceManifest,
  runner: StructuredTestRunner,
  worktreePath: string,
): StructuredAcceptanceCommand | null {
  if (manifest.command === null || manifest.command.length === 0) return null;
  const reporting = RUNNER_REPORTING[runner];
  const reportPath = `${ACCEPTANCE_REPORT_DIRECTORY}${PATH_SEPARATOR}${reporting.reportFile}`;
  const absoluteReportPath = `${worktreePath}${PATH_SEPARATOR}${reportPath}`;
  const assignments = Object.entries(reporting.environment(absoluteReportPath)).map(([name, value]) => `${name}${ASSIGNMENT}${shellQuote(value)}`);
  const invocation = shellCommandLine([...manifest.command, ...reporting.arguments(absoluteReportPath)]);
  return { command: [...assignments, invocation].join(WORD_SEPARATOR), reportPath };
}
