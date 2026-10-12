import { z } from 'zod';
import type { CollectionError, FailureKind, TestCaseResult, TestOutcome, TestRunReport } from '@agent-factory/domain';
import { TestReportFormatError, joinPath, relativeToWorktree, stripTerminalColours } from './report-paths.ts';

export const PLAYWRIGHT_RUNNER = 'playwright';
const ID_SEPARATOR = ' > ';
const MATCHER_CALL = 'expect(';

const ErrorSchema = z.object({ message: z.string().optional(), location: z.object({ file: z.string() }).optional() });

const ResultSchema = z.object({ status: z.string(), error: ErrorSchema.optional(), errors: z.array(ErrorSchema).optional() });

const TestSchema = z.object({ projectName: z.string().optional(), status: z.string(), results: z.array(ResultSchema) });

const SpecSchema = z.object({ title: z.string(), file: z.string(), tests: z.array(TestSchema) });

interface Suite {
  readonly title: string;
  readonly specs?: readonly z.infer<typeof SpecSchema>[] | undefined;
  readonly suites?: readonly Suite[] | undefined;
}

const SuiteSchema: z.ZodType<Suite> = z.lazy(() =>
  z.object({ title: z.string(), specs: z.array(SpecSchema).optional(), suites: z.array(SuiteSchema).optional() }),
);

const PlaywrightReportSchema = z.object({
  config: z.object({ rootDir: z.string() }),
  suites: z.array(SuiteSchema),
  errors: z.array(ErrorSchema).optional(),
});

const OUTCOMES: Readonly<Record<string, TestOutcome>> = {
  passed: 'passed',
  failed: 'failed',
  timedOut: 'failed',
  interrupted: 'failed',
  skipped: 'skipped',
};

type Result = z.infer<typeof ResultSchema>;

function messageOf(result: Result): string {
  return stripTerminalColours(result.error?.message ?? result.errors?.[0]?.message ?? '');
}

function failureKind(message: string): FailureKind {
  return message.includes(MATCHER_CALL) ? 'assertion' : 'error';
}

function projectPrefix(projectName: string | undefined): string {
  return projectName === undefined || projectName === '' ? '' : `[${projectName}] `;
}

function casesOf(suite: Suite, titles: readonly string[], rootDir: string, worktreePath: string): readonly TestCaseResult[] {
  const own = (suite.specs ?? []).flatMap((spec) =>
    spec.tests.map((test): TestCaseResult => {
      const file = relativeToWorktree(joinPath(rootDir, spec.file), worktreePath);
      const last = test.results.at(-1);
      const outcome = last === undefined ? 'skipped' : OUTCOMES[last.status];
      if (outcome === undefined) throw new TestReportFormatError(PLAYWRIGHT_RUNNER, `unknown result status ${last?.status ?? ''}`);
      const message = last === undefined ? '' : messageOf(last);
      return {
        id: `${projectPrefix(test.projectName)}${[file, ...titles, spec.title].join(ID_SEPARATOR)}`,
        file,
        outcome,
        failureKind: outcome === 'failed' ? failureKind(message) : null,
        failureMessage: outcome === 'failed' ? message : null,
      };
    }),
  );
  const nested = (suite.suites ?? []).flatMap((child) => casesOf(child, [...titles, child.title], rootDir, worktreePath));
  return [...own, ...nested];
}

export function parsePlaywrightJsonReport(text: string, worktreePath: string): TestRunReport {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new TestReportFormatError(PLAYWRIGHT_RUNNER, error instanceof Error ? error.message : String(error));
  }
  const parsed = PlaywrightReportSchema.safeParse(json);
  if (!parsed.success) throw new TestReportFormatError(PLAYWRIGHT_RUNNER, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  const { config, suites, errors } = parsed.data;
  const collectionErrors: CollectionError[] = (errors ?? []).map((error) => ({
    file: error.location === undefined ? null : relativeToWorktree(error.location.file, worktreePath),
    message: stripTerminalColours(error.message ?? ''),
  }));
  return { cases: suites.flatMap((suite) => casesOf(suite, [], config.rootDir, worktreePath)), collectionErrors };
}
