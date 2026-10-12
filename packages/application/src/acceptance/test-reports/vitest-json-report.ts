import { z } from 'zod';
import type { CollectionError, FailureKind, TestCaseResult, TestOutcome, TestRunReport } from '@agent-factory/domain';
import { TestReportFormatError, relativeToWorktree, stripTerminalColours } from './report-paths.ts';

export const VITEST_RUNNER = 'vitest';
const ID_SEPARATOR = ' > ';
const ASSERTION_FAILURE = /^(?:AssertionError|Error: Snapshot )/;

const AssertionResultSchema = z.object({
  ancestorTitles: z.array(z.string()),
  title: z.string(),
  status: z.string(),
  failureMessages: z.array(z.string()).nullable().optional(),
});

const VitestReportSchema = z.object({
  testResults: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      message: z.string().optional(),
      assertionResults: z.array(AssertionResultSchema),
    }),
  ),
});

const OUTCOMES: Readonly<Record<string, TestOutcome>> = {
  passed: 'passed',
  failed: 'failed',
  skipped: 'skipped',
  pending: 'skipped',
  todo: 'skipped',
  disabled: 'skipped',
};

function failureKind(message: string): FailureKind {
  return ASSERTION_FAILURE.test(stripTerminalColours(message).trimStart()) ? 'assertion' : 'error';
}

export function parseVitestJsonReport(text: string, worktreePath: string): TestRunReport {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new TestReportFormatError(VITEST_RUNNER, error instanceof Error ? error.message : String(error));
  }
  const parsed = VitestReportSchema.safeParse(json);
  if (!parsed.success) throw new TestReportFormatError(VITEST_RUNNER, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  const cases: TestCaseResult[] = [];
  const collectionErrors: CollectionError[] = [];
  for (const result of parsed.data.testResults) {
    const file = relativeToWorktree(result.name, worktreePath);
    const message = result.message ?? '';
    if (message.trim() !== '') collectionErrors.push({ file, message: stripTerminalColours(message) });
    for (const assertion of result.assertionResults) {
      const outcome = OUTCOMES[assertion.status];
      if (outcome === undefined) throw new TestReportFormatError(VITEST_RUNNER, `unknown test status ${assertion.status}`);
      const failure = assertion.failureMessages?.[0] ?? null;
      cases.push({
        id: [file, ...assertion.ancestorTitles, assertion.title].join(ID_SEPARATOR),
        file,
        outcome,
        failureKind: outcome === 'failed' ? failureKind(failure ?? '') : null,
        failureMessage: outcome === 'failed' && failure !== null ? stripTerminalColours(failure) : null,
      });
    }
  }
  return { cases, collectionErrors };
}
