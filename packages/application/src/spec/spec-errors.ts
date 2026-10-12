export const SPEC_PROBLEM_CODES = [
  'empty-title',
  'unexpected-preamble',
  'unknown-section',
  'duplicate-section',
  'missing-section',
  'empty-section',
  'not-a-numbered-list',
  'not-a-bullet-list',
  'empty-list-item',
  'missing-type-label',
  'multiple-type-labels',
  'multiple-kind-labels',
  'unknown-kind-label',
] as const;
export type SpecProblemCode = (typeof SPEC_PROBLEM_CODES)[number];

export interface SpecProblem {
  readonly code: SpecProblemCode;
  readonly section: string | null;
  readonly message: string;
}

export class SpecFormatError extends Error {
  readonly issueNumber: number;
  readonly problems: readonly SpecProblem[];

  constructor(issueNumber: number, problems: readonly SpecProblem[]) {
    super(`Issue #${issueNumber} is not a valid spec:\n${problems.map((problem) => `- ${problem.message}`).join('\n')}`);
    this.name = 'SpecFormatError';
    this.issueNumber = issueNumber;
    this.problems = problems;
  }
}

export class SpecRenderError extends Error {
  readonly issueNumber: number;

  constructor(issueNumber: number, detail: string) {
    super(`Spec of issue #${issueNumber} cannot be rendered losslessly: ${detail}`);
    this.name = 'SpecRenderError';
    this.issueNumber = issueNumber;
  }
}
