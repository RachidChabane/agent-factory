import type { IssueSpec } from '@agent-factory/domain';
import type { ProjectConventions } from '../conventions/project-conventions.ts';
import { SPEC_FILE_HEADERS, SpecRenderError, formatSpecSections, renderSpecBody } from '../spec/index.ts';
import { FILE_PATH_SEPARATOR, REQUEST_SPECS_DIRECTORY } from './request-files.ts';

const DRAFT_ISSUE_NUMBER = 1;
const SPEC_FILE_EXTENSION = '.md';
const SLUG_SEPARATOR = '-';
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const EDGE_SEPARATORS = /^-+|-+$/g;
const WHITESPACE = /\s+/g;
const MAX_SLUG_LENGTH = 48;
const FALLBACK_SLUG = 'spec';
const NEWLINE = '\n';
const BLANK_LINE = '\n\n';

export interface ProposedSpecDraft {
  readonly title: string;
  readonly type: IssueSpec['type'];
  readonly need: string;
  readonly acceptanceCriteria: readonly string[];
  readonly outOfScope: readonly string[];
  readonly expectedProof: string;
}

export interface RenderedSpecFile {
  readonly content: string;
  readonly problems: readonly string[];
}

export function singleLine(text: string): string {
  return text.replace(WHITESPACE, ' ').trim();
}

export function slugOf(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, SLUG_SEPARATOR)
    .replace(EDGE_SEPARATORS, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(EDGE_SEPARATORS, '');
  return slug === '' ? FALLBACK_SLUG : slug;
}

export function specFilePath(number: number, title: string): string {
  return `${REQUEST_SPECS_DIRECTORY}${FILE_PATH_SEPARATOR}${number}${SLUG_SEPARATOR}${slugOf(title)}${SPEC_FILE_EXTENSION}`;
}

function toIssueSpec(draft: ProposedSpecDraft): IssueSpec {
  return {
    number: DRAFT_ISSUE_NUMBER,
    title: draft.title,
    type: draft.type,
    need: draft.need,
    acceptanceCriteria: [...draft.acceptanceCriteria],
    outOfScope: [...draft.outOfScope],
    expectedProof: draft.expectedProof,
    dependsOn: [],
    commitKind: null,
  };
}

function unknownTypeProblem(type: string, conventions: ProjectConventions): string {
  return `issue type "${type}" is not one of this project's types (${conventions.typology.ids().join(', ')})`;
}

function renderBody(draft: ProposedSpecDraft, conventions: ProjectConventions): { readonly body: string; readonly problems: readonly string[] } {
  const spec = toIssueSpec(draft);
  if (!conventions.typology.has(draft.type)) return { body: formatSpecSections(spec), problems: [unknownTypeProblem(draft.type, conventions)] };
  try {
    return { body: renderSpecBody(spec, conventions), problems: [] };
  } catch (error) {
    if (error instanceof SpecRenderError) return { body: formatSpecSections(spec), problems: [error.message] };
    throw error;
  }
}

/** Writes a proposed spec as a spec file; a type the project does not know leaves the labels empty and is reported. */
export function renderSpecFile(draft: ProposedSpecDraft, conventions: ProjectConventions): RenderedSpecFile {
  const { body, problems } = renderBody(draft, conventions);
  const labels = conventions.typology.has(draft.type) ? conventions.typology.get(draft.type).label : '';
  const header = [`${SPEC_FILE_HEADERS.title} ${draft.title}`, `${SPEC_FILE_HEADERS.labels} ${labels}`.trimEnd()].join(NEWLINE);
  return { content: `${header}${BLANK_LINE}${body}`, problems };
}
