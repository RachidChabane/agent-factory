import type { ProjectConventions } from '../conventions/project-conventions.ts';
import { splitLines } from './markdown-blocks.ts';
import { parseIssueSpec } from './markdown-spec-reader.ts';
import { SpecFormatError, type SpecProblem } from './spec-errors.ts';

export const SPEC_FILE_HEADERS = {
  title: 'Title:',
  labels: 'Labels:',
} as const;

const LABEL_SEPARATOR = ',';
const NEWLINE = '\n';
const DRAFT_ISSUE_NUMBER = 1;

export interface SpecFile {
  readonly title: string;
  readonly labels: readonly string[];
  readonly body: string;
}

export class SpecFileFormatError extends Error {
  constructor(detail: string) {
    super(`The spec file is not valid: ${detail}`);
    this.name = 'SpecFileFormatError';
  }
}

export function parseLabelList(text: string): readonly string[] {
  return [
    ...new Set(
      text
        .split(LABEL_SEPARATOR)
        .map((label) => label.trim())
        .filter((label) => label !== ''),
    ),
  ];
}

function headerValue(line: string | undefined, header: string, position: string): string {
  if (line === undefined || !line.startsWith(header)) {
    throw new SpecFileFormatError(`the ${position} line must start with "${header}"`);
  }
  return line.slice(header.length).trim();
}

export function parseSpecFile(text: string): SpecFile {
  const [titleLine, labelsLine, ...rest] = splitLines(text);
  const title = headerValue(titleLine, SPEC_FILE_HEADERS.title, 'first');
  if (title === '') throw new SpecFileFormatError(`the "${SPEC_FILE_HEADERS.title}" line is empty`);
  const labels = parseLabelList(headerValue(labelsLine, SPEC_FILE_HEADERS.labels, 'second'));
  const body = `${rest.join(NEWLINE).trim()}${NEWLINE}`;
  return { title, labels, body };
}

export function withExtraLabels(file: SpecFile, extra: readonly string[]): SpecFile {
  return { ...file, labels: [...new Set([...file.labels, ...extra])] };
}

export function specFileProblems(file: SpecFile, conventions: ProjectConventions): readonly SpecProblem[] {
  try {
    parseIssueSpec(
      {
        number: DRAFT_ISSUE_NUMBER,
        title: file.title,
        body: file.body,
        labels: file.labels,
        blockedBy: [],
      },
      conventions,
    );
    return [];
  } catch (error) {
    if (error instanceof SpecFormatError) return error.problems;
    throw error;
  }
}
