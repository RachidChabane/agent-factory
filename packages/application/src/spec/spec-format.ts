import type { CommitKind, IssueType } from '@agent-factory/domain';

export const SPEC_SECTION_KEYS = ['need', 'acceptanceCriteria', 'outOfScope', 'expectedProof'] as const;
export type SpecSectionKey = (typeof SPEC_SECTION_KEYS)[number];

export const SPEC_SECTION_HEADINGS: Readonly<Record<SpecSectionKey, string>> = {
  need: 'Need',
  acceptanceCriteria: 'Acceptance criteria',
  outOfScope: 'Out of scope',
  expectedProof: 'Expected proof',
};

export const SPEC_SECTION_HEADING_MARKER = '##';
export const NUMBERED_ITEM_SUFFIX = '.';
export const BULLET_MARKER = '-';
export const TYPE_LABEL_PREFIX = 'type:';
export const SPEC_VALIDATED_LABEL = 'spec:validated';
export const KIND_LABEL_PREFIX = 'kind:';

export function kindLabel(kind: CommitKind): string {
  return `${KIND_LABEL_PREFIX}${kind}`;
}

export function typeLabel(type: IssueType): string {
  return `${TYPE_LABEL_PREFIX}${type}`;
}

export function normaliseHeading(heading: string): string {
  return heading.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function sectionKeyOf(heading: string): SpecSectionKey | null {
  const normalised = normaliseHeading(heading);
  return SPEC_SECTION_KEYS.find((key) => normaliseHeading(SPEC_SECTION_HEADINGS[key]) === normalised) ?? null;
}
