import { TEST_RUNNERS, type IssueSpec, type IssueTypeDefinition, type IssueTypology, type TestRunner } from '@agent-factory/domain';
import { ACCEPTANCE_MANIFEST_PATH, usesBaseScore } from '../acceptance/acceptance-manifest.ts';
import { DECISION_REQUEST_PATH } from './decision-request.ts';
import { formatSpecSections } from '../spec/render-spec-body.ts';
import { fenced, inlineCode } from './markdown.ts';
import type { RepositoryCoordinates } from './pipeline-settings.ts';

const PARAGRAPH = '\n\n';
const JSON_INFO = 'json';
const JSON_INDENT = 2;
export const NO_FROZEN_CHECK = 'This issue has no frozen acceptance check.';

export type RolePromptValues = Readonly<Record<string, string>>;

export const ROLE_PROMPT_PLACEHOLDERS = {
  repository: 'repository',
  spec: 'spec',
  checkGuidance: 'checkGuidance',
  runners: 'runners',
  checks: 'checks',
  diff: 'diff',
  decisionRequest: 'decisionRequest',
  issueTypes: 'issueTypes',
} as const;

const RUNNER_DESCRIPTIONS: Readonly<Record<TestRunner, string>> = {
  pytest: '`pytest`',
  vitest: '`vitest`',
  playwright: '`playwright`',
  'node-test': '`node-test` for the Node.js test runner (`node --test`)',
  eval: '`eval` for evaluation cases scored against a rubric',
};
const LIST_SEPARATOR = ', ';
const LAST_SEPARATOR = ' or ';

export interface CheckContent {
  readonly path: string;
  readonly content: string;
}

const SCORE_REPORT_EXAMPLE = { cases: [{ id: 'case-id', targeted: true, scores: [0.4, 0.5] }] };

export function repositoryValue(repository: RepositoryCoordinates): string {
  return `${repository.owner}/${repository.name}`;
}

export function specValue(spec: IssueSpec): string {
  return `# Issue #${spec.number}: ${spec.title} (type ${spec.type})${PARAGRAPH}${formatSpecSections(spec).trimEnd()}`;
}

export function checksValue(checks: readonly CheckContent[]): string {
  if (checks.length === 0) return NO_FROZEN_CHECK;
  return checks.map((check) => `## ${inlineCode(check.path)}${PARAGRAPH}${fenced(check.content)}`).join(PARAGRAPH);
}

export function runnersValue(): string {
  const descriptions = TEST_RUNNERS.map((runner) => RUNNER_DESCRIPTIONS[runner]);
  return `${descriptions.slice(0, -1).join(LIST_SEPARATOR)}${LAST_SEPARATOR}${descriptions.at(-1) ?? ''}`;
}

/** The issue type ids a challenger may propose, in the project's order. */
export function issueTypesValue(typology: IssueTypology): string {
  return typology.ids().join(LIST_SEPARATOR);
}

export function acceptanceAuthorValues(repository: RepositoryCoordinates, spec: IssueSpec, type: IssueTypeDefinition): RolePromptValues {
  return {
    [ROLE_PROMPT_PLACEHOLDERS.repository]: repositoryValue(repository),
    [ROLE_PROMPT_PLACEHOLDERS.spec]: specValue(spec),
    [ROLE_PROMPT_PLACEHOLDERS.checkGuidance]: type.checks,
    [ROLE_PROMPT_PLACEHOLDERS.runners]: runnersValue(),
  };
}

export function implementerValues(
  repository: RepositoryCoordinates,
  spec: IssueSpec,
  checks: readonly CheckContent[],
): RolePromptValues {
  return {
    [ROLE_PROMPT_PLACEHOLDERS.repository]: repositoryValue(repository),
    [ROLE_PROMPT_PLACEHOLDERS.spec]: specValue(spec),
    [ROLE_PROMPT_PLACEHOLDERS.checks]: checksValue(checks),
    [ROLE_PROMPT_PLACEHOLDERS.decisionRequest]: inlineCode(DECISION_REQUEST_PATH),
  };
}

export function reviewerValues(
  repository: RepositoryCoordinates,
  spec: IssueSpec,
  checks: readonly CheckContent[],
  diff: string,
): RolePromptValues {
  return { ...implementerValues(repository, spec, checks), [ROLE_PROMPT_PLACEHOLDERS.diff]: diff };
}

export function scoreOutputAddendum(type: IssueTypeDefinition): string | null {
  if (!usesBaseScore(type)) return null;
  return [
    `This issue is scored. Add to ${inlineCode(ACCEPTANCE_MANIFEST_PATH)} the entry ${inlineCode('"score": { "path": "<file>" }')} naming the file the command writes in this format:`,
    fenced(JSON.stringify(SCORE_REPORT_EXAMPLE, null, JSON_INDENT), JSON_INFO),
    'Each case appears once; "targeted" is true for the cases this issue aims to improve; "scores" holds one score per replay.',
  ].join(PARAGRAPH);
}

export function withAddendum(prompt: string, addendum: string | null): string {
  return addendum === null ? prompt : `${prompt.trimEnd()}${PARAGRAPH}${addendum}`;
}

export function manifestCorrectionPrompt(problems: readonly string[]): string {
  return [
    `The factory cannot use ${inlineCode(ACCEPTANCE_MANIFEST_PATH)}:`,
    problems.map((problem) => `- ${problem}`).join('\n'),
    'Fix the manifest, and the checks if they need it, then stop. Do not change anything else.',
  ].join(PARAGRAPH);
}

export function beforeProofCorrectionPrompt(reason: string): string {
  return [
    'The factory ran your checks on the current code and cannot accept the before proof:',
    reason,
    `Fix the checks, and ${inlineCode(ACCEPTANCE_MANIFEST_PATH)} if it needs it, so that every new-behaviour check fails on an assertion, every kept-behaviour check passes, every file loads and nothing needs the network or writes outside the repository. Then run the command once and stop. Do not change anything else.`,
  ].join(PARAGRAPH);
}

export function checkRewriteAddendum(path: string, instruction: string, currentContent: string): string {
  return [
    '# Rewrite of one frozen check, ordered by the operator',
    `The checks of this issue are written and frozen. The operator ordered a rewrite of ${inlineCode(path)} only, with this instruction:`,
    instruction.trim(),
    `Its current content:${PARAGRAPH}${fenced(currentContent)}`,
    `Rewrite ${inlineCode(path)} so that it follows the instruction and the rules above. Change no other file: the other checks are frozen, ${inlineCode(ACCEPTANCE_MANIFEST_PATH)} is already recorded and must not be written, and the implementation in this worktree is not yours to change. Keep the test names that tie each test to its criterion. Then stop.`,
  ].join(PARAGRAPH);
}

export function checkRewriteImplementerAddendum(path: string, instruction: string): string {
  return [
    '# A frozen check was rewritten',
    `The operator had the frozen check ${inlineCode(path)} rewritten with this instruction:`,
    instruction.trim(),
    'The frozen checks above are the rewritten ones. Earlier work in this worktree stays; make every frozen check pass.',
  ].join(PARAGRAPH);
}

export function implementerCorrectionPrompt(spec: IssueSpec, failureSummary: string): string {
  return [
    `Your work on issue #${spec.number} was rejected:`,
    failureSummary,
    'Continue the implementation and resolve what is reported above.',
  ].join(PARAGRAPH);
}

export function earlierAttemptsAddendum(distilledFailures: string): string {
  return [
    '# Earlier attempts',
    'Earlier attempts at this issue were rejected for these reasons. The working tree still holds their changes; keep what is right and fix the rest.',
    distilledFailures,
  ].join(PARAGRAPH);
}
