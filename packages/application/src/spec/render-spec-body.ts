import { isDeepStrictEqual } from 'node:util';
import type { IssueSpec } from '@agent-factory/domain';
import type { ProjectConventions } from '../conventions/project-conventions.ts';
import { parseIssueSpec } from './markdown-spec-reader.ts';
import { SpecFormatError, SpecRenderError } from './spec-errors.ts';
import {
  BULLET_MARKER,
  NUMBERED_ITEM_SUFFIX,
  SPEC_SECTION_HEADING_MARKER,
  SPEC_SECTION_HEADINGS,
  kindLabel,
  type SpecSectionKey,
} from './spec-format.ts';

const PARAGRAPH_BREAK = '\n\n';
const NEWLINE = '\n';
const ROUND_TRIP_OPEN_STATE = 'open';

function heading(key: SpecSectionKey): string {
  return `${SPEC_SECTION_HEADING_MARKER} ${SPEC_SECTION_HEADINGS[key]}`;
}

function section(key: SpecSectionKey, content: string): string {
  return `${heading(key)}${PARAGRAPH_BREAK}${content}`;
}

function numberedList(items: readonly string[]): string {
  return items.map((item, index) => `${index + 1}${NUMBERED_ITEM_SUFFIX} ${item}`).join(NEWLINE);
}

function bulletList(items: readonly string[]): string {
  return items.map((item) => `${BULLET_MARKER} ${item}`).join(NEWLINE);
}

export function formatSpecSections(spec: IssueSpec): string {
  const body = [
    section('need', spec.need),
    section('acceptanceCriteria', numberedList(spec.acceptanceCriteria)),
    section('outOfScope', bulletList(spec.outOfScope)),
    section('expectedProof', spec.expectedProof),
  ].join(PARAGRAPH_BREAK);
  return `${body}${NEWLINE}`;
}

export function renderSpecBody(spec: IssueSpec, conventions: ProjectConventions): string {
  const body = formatSpecSections(spec);
  assertRoundTrips(spec, body, conventions);
  return body;
}

function assertRoundTrips(spec: IssueSpec, body: string, conventions: ProjectConventions): void {
  let parsed: IssueSpec;
  try {
    const typeLabel = conventions.typology.get(spec.type).label;
    parsed = parseIssueSpec(
      {
        number: spec.number,
        title: spec.title,
        body,
        labels: [typeLabel, ...(spec.commitKind === null ? [] : [kindLabel(spec.commitKind, conventions.labels.kindPrefix)])],
        state: ROUND_TRIP_OPEN_STATE,
        blockedBy: spec.dependsOn,
      },
      conventions,
    );
  } catch (error) {
    if (error instanceof SpecFormatError) throw new SpecRenderError(spec.number, error.message);
    throw error;
  }
  if (!isDeepStrictEqual(parsed, { ...spec })) {
    throw new SpecRenderError(spec.number, 'the rendered body parses back to a different spec');
  }
}
