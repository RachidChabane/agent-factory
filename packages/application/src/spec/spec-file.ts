import { filmLabel } from '@agent-factory/domain';
import type { ProjectConventions } from '../conventions/project-conventions.ts';
import { splitLines } from './markdown-blocks.ts';
import { parseIssueSpec } from './markdown-spec-reader.ts';
import { SpecFormatError, type SpecProblem } from './spec-errors.ts';

export const SPEC_FILE_HEADERS = {
  title: 'Title:',
  labels: 'Labels:',
  films: 'Films:',
} as const;

const LIST_SEPARATOR = ',';
const NEWLINE = '\n';
const DRAFT_ISSUE_NUMBER = 1;

export interface SpecFile {
  readonly title: string;
  readonly labels: readonly string[];
  /** The film scenarios of the optional `Films:` header; the issue stores them as film labels. */
  readonly films: readonly string[];
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
        .split(LIST_SEPARATOR)
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
  const [titleLine, labelsLine, ...afterLabels] = splitLines(text);
  const title = headerValue(titleLine, SPEC_FILE_HEADERS.title, 'first');
  if (title === '') throw new SpecFileFormatError(`the "${SPEC_FILE_HEADERS.title}" line is empty`);
  const labels = parseLabelList(headerValue(labelsLine, SPEC_FILE_HEADERS.labels, 'second'));
  const filmsIndex = afterLabels.findIndex((line) => line.trim() !== '');
  const filmsLine = afterLabels[filmsIndex];
  const declaresFilms = filmsLine?.startsWith(SPEC_FILE_HEADERS.films) === true;
  const films = declaresFilms ? parseLabelList(headerValue(filmsLine, SPEC_FILE_HEADERS.films, 'third')) : [];
  const bodyLines = declaresFilms ? afterLabels.slice(filmsIndex + 1) : afterLabels;
  const body = `${bodyLines.join(NEWLINE).trim()}${NEWLINE}`;
  return { title, labels, films, body };
}

/** The labels the issue is created with: the file's own, then one film label per declared scenario. */
export function specFileLabels(file: SpecFile): readonly string[] {
  return [...new Set([...file.labels, ...file.films.map(filmLabel)])];
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
        labels: specFileLabels(file),
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
