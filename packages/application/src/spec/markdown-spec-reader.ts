import { COMMIT_KINDS, ISSUE_TYPES } from '@agent-factory/domain';
import type { CommitKind, IssueSpec, IssueType } from '@agent-factory/domain';
import type { IssueRecord, SpecReader } from '../ports.ts';
import { blockText, isBlank, parseList, splitLevelTwoSections, type ListKind, type MarkdownSection } from './markdown-blocks.ts';
import { SpecFormatError, type SpecProblem } from './spec-errors.ts';
import {
  SPEC_SECTION_HEADINGS,
  SPEC_SECTION_KEYS,
  KIND_LABEL_PREFIX,
  SPEC_VALIDATED_LABEL,
  TYPE_LABEL_PREFIX,
  sectionKeyOf,
  type SpecSectionKey,
} from './spec-format.ts';

const LIST_SECTIONS: Readonly<Partial<Record<SpecSectionKey, ListKind>>> = {
  acceptanceCriteria: 'numbered',
  outOfScope: 'bullet',
};

const LIST_PROBLEM_CODE: Readonly<Record<ListKind, SpecProblem['code']>> = {
  numbered: 'not-a-numbered-list',
  bullet: 'not-a-bullet-list',
};

const LIST_DESCRIPTION: Readonly<Record<ListKind, string>> = {
  numbered: 'a numbered list',
  bullet: 'a bullet list',
};

interface SectionContents {
  readonly text: Partial<Record<SpecSectionKey, string>>;
  readonly lists: Partial<Record<SpecSectionKey, readonly string[]>>;
}

function problem(code: SpecProblem['code'], section: string | null, message: string): SpecProblem {
  return { code, section, message };
}

function collectSections(sections: readonly MarkdownSection[], problems: SpecProblem[]): Map<SpecSectionKey, MarkdownSection> {
  const found = new Map<SpecSectionKey, MarkdownSection>();
  for (const section of sections) {
    const key = sectionKeyOf(section.heading);
    if (key === null) {
      problems.push(problem('unknown-section', section.heading, `section "## ${section.heading}" is not part of the spec format`));
    } else if (found.has(key)) {
      problems.push(problem('duplicate-section', SPEC_SECTION_HEADINGS[key], `section "## ${SPEC_SECTION_HEADINGS[key]}" appears more than once`));
    } else {
      found.set(key, section);
    }
  }
  return found;
}

function readSection(key: SpecSectionKey, section: MarkdownSection | undefined, problems: SpecProblem[], contents: SectionContents): void {
  const heading = SPEC_SECTION_HEADINGS[key];
  if (section === undefined) {
    problems.push(problem('missing-section', heading, `section "## ${heading}" is missing`));
    return;
  }
  if (isBlank(section.lines)) {
    problems.push(problem('empty-section', heading, `section "## ${heading}" is empty`));
    return;
  }
  const listKind = LIST_SECTIONS[key];
  if (listKind === undefined) {
    contents.text[key] = blockText(section.lines);
    return;
  }
  const parsed = parseList(section.lines, listKind);
  if (parsed.kind === 'not-a-list') {
    problems.push(
      problem(LIST_PROBLEM_CODE[listKind], heading, `section "## ${heading}" must be ${LIST_DESCRIPTION[listKind]}; found "${parsed.offendingLine}"`),
    );
  } else if (parsed.kind === 'empty-item') {
    problems.push(problem('empty-list-item', heading, `item ${parsed.itemNumber} of section "## ${heading}" is empty`));
  } else {
    contents.lists[key] = parsed.items;
  }
}

function readType(labels: readonly string[], problems: SpecProblem[]): IssueType | null {
  const typeLabels = labels.filter((label) => label.startsWith(TYPE_LABEL_PREFIX));
  const [only] = typeLabels;
  if (only === undefined) {
    problems.push(problem('missing-type-label', null, `the issue has no "${TYPE_LABEL_PREFIX}<type>" label`));
    return null;
  }
  if (typeLabels.length > 1) {
    problems.push(problem('multiple-type-labels', null, `the issue has several type labels: ${typeLabels.join(', ')}`));
    return null;
  }
  const value = only.slice(TYPE_LABEL_PREFIX.length);
  const type = ISSUE_TYPES.find((candidate) => candidate === value);
  if (type === undefined) {
    problems.push(problem('unknown-type-label', null, `label "${only}" names no known type (${ISSUE_TYPES.join(', ')})`));
    return null;
  }
  return type;
}

function readKind(labels: readonly string[], problems: SpecProblem[]): CommitKind | null {
  const kindLabels = labels.filter((label) => label.startsWith(KIND_LABEL_PREFIX));
  const [only] = kindLabels;
  if (only === undefined) return null;
  if (kindLabels.length > 1) {
    problems.push(problem('multiple-kind-labels', null, `the issue has several kind labels: ${kindLabels.join(', ')}`));
    return null;
  }
  const value = only.slice(KIND_LABEL_PREFIX.length);
  const kind = COMMIT_KINDS.find((candidate) => candidate === value);
  if (kind === undefined) {
    problems.push(problem('unknown-kind-label', null, `label "${only}" names no conventional commit type (${COMMIT_KINDS.join(', ')})`));
    return null;
  }
  return kind;
}

export function parseIssueSpec(issue: IssueRecord): IssueSpec {
  const problems: SpecProblem[] = [];
  const title = issue.title.trim();
  if (title === '') problems.push(problem('empty-title', null, 'the issue title is empty'));
  const document = splitLevelTwoSections(issue.body);
  if (!isBlank(document.preamble)) {
    problems.push(problem('unexpected-preamble', null, 'the body has text before the first "## Need" section'));
  }
  const found = collectSections(document.sections, problems);
  const contents: SectionContents = { text: {}, lists: {} };
  for (const key of SPEC_SECTION_KEYS) readSection(key, found.get(key), problems, contents);
  const type = readType(issue.labels, problems);
  const commitKind = readKind(issue.labels, problems);
  const { need, expectedProof } = contents.text;
  const { acceptanceCriteria, outOfScope } = contents.lists;
  if (
    problems.length > 0 ||
    type === null ||
    need === undefined ||
    expectedProof === undefined ||
    acceptanceCriteria === undefined ||
    outOfScope === undefined
  ) {
    throw new SpecFormatError(issue.number, problems);
  }
  return {
    number: issue.number,
    title,
    type,
    need,
    acceptanceCriteria,
    outOfScope,
    expectedProof,
    dependsOn: [...new Set(issue.blockedBy)].sort((a, b) => a - b),
    commitKind,
  };
}

export function isSpecValidated(issue: IssueRecord): boolean {
  return issue.labels.includes(SPEC_VALIDATED_LABEL);
}

export class MarkdownSpecReader implements SpecReader {
  read(issue: IssueRecord): IssueSpec {
    return parseIssueSpec(issue);
  }
}
