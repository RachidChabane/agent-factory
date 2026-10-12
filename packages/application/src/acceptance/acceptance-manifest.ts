import { z } from 'zod';
import { BASE_EXPECTATIONS, BEFORE_PROOF_EXPECTATIONS, SCORED_TEST_RUNNER, TEST_RUNNERS, isStructuredRunner } from '@agent-factory/domain';
import type { BaseExpectation, CriterionChecks, IssueSpec } from '@agent-factory/domain';
import { shellCommandLine } from './shell-quote.ts';

export const FACTORY_WORK_DIRECTORY = '.factory';
export const ACCEPTANCE_MANIFEST_PATH = `${FACTORY_WORK_DIRECTORY}/acceptance.json`;
export const EVIDENCE_DIRECTORY = '.evidence';

const PATH_SEPARATOR = '/';
const FORBIDDEN_SEGMENTS: readonly string[] = ['', '.', '..'];
const RESERVED_PREFIXES: readonly string[] = [`${FACTORY_WORK_DIRECTORY}/`, `${EVIDENCE_DIRECTORY}/`, '.git/'];
const HOME_PREFIX = '~';
const BACKSLASH = '\\';

export function isSafeRelativePath(path: string): boolean {
  if (path.startsWith(PATH_SEPARATOR) || path.startsWith(HOME_PREFIX) || path.includes(BACKSLASH)) return false;
  return path.split(PATH_SEPARATOR).every((segment) => !FORBIDDEN_SEGMENTS.includes(segment));
}

const RelativePathSchema = z
  .string()
  .min(1)
  .refine(isSafeRelativePath, { message: 'must be a relative path inside the worktree without "." or ".." segments' })
  .refine((path) => !RESERVED_PREFIXES.some((prefix) => path.startsWith(prefix)), {
    message: `must not be under ${RESERVED_PREFIXES.join(', ')}`,
  });

export const DEFAULT_BASE_EXPECTATION: BaseExpectation = 'fails';

export const AcceptanceCheckSchema = z.strictObject({
  criterion: z.number().int().positive(),
  paths: z.array(RelativePathSchema).min(1),
  description: z.string().trim().min(1),
  onBase: z.enum(BASE_EXPECTATIONS).default(DEFAULT_BASE_EXPECTATION),
});

export const ScoreOutputSchema = z.strictObject({
  path: RelativePathSchema,
});

export const AcceptanceManifestSchema = z.strictObject({
  runner: z.enum(TEST_RUNNERS).nullable().default(null),
  checks: z.array(AcceptanceCheckSchema),
  command: z.array(z.string().min(1)).nullable(),
  evidence: z.array(RelativePathSchema),
  score: ScoreOutputSchema.nullable().default(null),
});

export type AcceptanceCheck = z.infer<typeof AcceptanceCheckSchema>;
export type AcceptanceManifest = z.infer<typeof AcceptanceManifestSchema>;

export type ManifestReading =
  | { readonly valid: true; readonly manifest: AcceptanceManifest }
  | { readonly valid: false; readonly problems: readonly string[] };

function duplicates(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

export function checkPaths(manifest: AcceptanceManifest): readonly string[] {
  return [...new Set(manifest.checks.flatMap((check) => check.paths))];
}

export function acceptanceCommand(manifest: AcceptanceManifest): string | null {
  return manifest.command === null || manifest.command.length === 0 ? null : shellCommandLine(manifest.command);
}

export function usesBaseScore(spec: IssueSpec): boolean {
  return BEFORE_PROOF_EXPECTATIONS[spec.type].kind === 'base-score';
}

export function scoreOutputPath(manifest: AcceptanceManifest, spec: IssueSpec): string | null {
  return usesBaseScore(spec) ? (manifest.score?.path ?? null) : null;
}

export function declaredOutputPaths(manifest: AcceptanceManifest, spec: IssueSpec): readonly string[] {
  const score = scoreOutputPath(manifest, spec);
  return [...manifest.evidence, ...(score === null ? [] : [score])];
}

export function checksProving(manifest: AcceptanceManifest, criterion: number): readonly string[] {
  return [...new Set(manifest.checks.filter((check) => check.criterion === criterion).flatMap((check) => check.paths))];
}

export function criterionChecks(manifest: AcceptanceManifest): readonly CriterionChecks[] {
  const criteria = [...new Set(manifest.checks.map((check) => check.criterion))].sort((a, b) => a - b);
  return criteria.map((criterion) => {
    const checks = manifest.checks.filter((check) => check.criterion === criterion);
    const onBase = checks.some((check) => check.onBase === 'fails') ? 'fails' : 'passes';
    return { criterion, files: checksProving(manifest, criterion), onBase };
  });
}

export function criterionChecksOf(manifest: AcceptanceManifest | null): readonly CriterionChecks[] {
  return manifest === null ? [] : criterionChecks(manifest);
}

function runnerProblems(manifest: AcceptanceManifest, spec: IssueSpec, paths: readonly string[]): readonly string[] {
  if (paths.length === 0) return [];
  if (manifest.runner === null) return [`checks are declared but no "runner" says which test runner runs them (${TEST_RUNNERS.join(', ')})`];
  if (usesBaseScore(spec) && manifest.runner !== SCORED_TEST_RUNNER) return [`a ${spec.type} issue runs its checks with the "${SCORED_TEST_RUNNER}" runner`];
  if (!usesBaseScore(spec) && manifest.runner === SCORED_TEST_RUNNER) return [`the "${SCORED_TEST_RUNNER}" runner only proves skill-prompt issues`];
  return [];
}

function baseExpectationProblems(manifest: AcceptanceManifest, spec: IssueSpec, paths: readonly string[]): readonly string[] {
  if (paths.length === 0 || manifest.runner === null || !isStructuredRunner(manifest.runner)) return [];
  const problems: string[] = [];
  const expectation = BEFORE_PROOF_EXPECTATIONS[spec.type];
  for (const path of paths) {
    const expectations = new Set(manifest.checks.filter((check) => check.paths.includes(path)).map((check) => check.onBase));
    if (expectations.size > 1) problems.push(`${path} is declared both as failing and as passing on base; keep new and kept behaviour in separate files`);
  }
  for (const criterion of new Set(manifest.checks.map((check) => check.criterion))) {
    const expectations = new Set(manifest.checks.filter((check) => check.criterion === criterion).map((check) => check.onBase));
    if (expectations.size > 1) problems.push(`criterion ${criterion} is declared both as failing and as passing on base`);
  }
  const failing = manifest.checks.some((check) => check.onBase === 'fails');
  if (expectation.failingBaseWhenExpressible && !failing) problems.push(`a ${spec.type} issue needs at least one check that fails on base`);
  if (expectation.kind === 'none' && failing) problems.push(`a ${spec.type} issue keeps today's behaviour, so every check passes on base`);
  return problems;
}

export function validateManifestForSpec(manifest: AcceptanceManifest, spec: IssueSpec): readonly string[] {
  const problems: string[] = [];
  const expectation = BEFORE_PROOF_EXPECTATIONS[spec.type];
  const paths = checkPaths(manifest);
  const outputs = declaredOutputPaths(manifest, spec);
  const criteriaCount = spec.acceptanceCriteria.length;
  const hasCommand = acceptanceCommand(manifest) !== null;

  if (paths.length > 0 && !hasCommand) problems.push('checks are declared but no command runs them');
  if (paths.length === 0 && hasCommand) problems.push('a command is declared but no check file');
  if (paths.length === 0 && (expectation.mandatoryFailingBase || expectation.kind === 'base-score')) {
    problems.push(`a ${spec.type} issue needs at least one acceptance check (${expectation.frozenCheck})`);
  }
  if (usesBaseScore(spec) && manifest.score === null) problems.push(`a ${spec.type} issue needs a "score" output`);
  problems.push(...runnerProblems(manifest, spec, paths), ...baseExpectationProblems(manifest, spec, paths));
  for (const path of duplicates(outputs)) problems.push(`output ${path} is declared more than once`);
  for (const path of [...new Set(outputs)].filter((output) => paths.includes(output))) {
    problems.push(`${path} is declared both as a check and as an output`);
  }
  for (const check of manifest.checks.filter((entry) => entry.criterion > criteriaCount)) {
    problems.push(`a check proves criterion ${check.criterion} but the spec has ${criteriaCount}`);
  }
  if (paths.length > 0) {
    for (let criterion = 1; criterion <= criteriaCount; criterion += 1) {
      if (checksProving(manifest, criterion).length === 0) problems.push(`acceptance criterion ${criterion} has no proving check`);
    }
  }
  return problems;
}

export function readAcceptanceManifest(raw: string | null, spec: IssueSpec): ManifestReading {
  if (raw === null) return { valid: false, problems: [`${ACCEPTANCE_MANIFEST_PATH} was not written`] };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return { valid: false, problems: [`${ACCEPTANCE_MANIFEST_PATH} is not JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const parsed = AcceptanceManifestSchema.safeParse(json);
  if (!parsed.success) {
    return {
      valid: false,
      problems: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`),
    };
  }
  const problems = validateManifestForSpec(parsed.data, spec);
  return problems.length === 0 ? { valid: true, manifest: parsed.data } : { valid: false, problems };
}
