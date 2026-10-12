import { describe, expect, it } from 'vitest';
import type { IssueRecord } from '../ports.ts';
import { isSpecValidated, MarkdownSpecReader } from './markdown-spec-reader.ts';
import { SpecFormatError, type SpecProblemCode } from './spec-errors.ts';

const VALID_BODY = [
  '## Need',
  '',
  'Operators lose track of which conversation produced a mockup.',
  'They need the source conversation linked from the mockup.',
  '',
  '## Acceptance criteria',
  '',
  '1. The mockup header shows a link to its conversation.',
  '2. Following the link opens the conversation',
  '   at the message that produced the mockup.',
  '',
  '## Out of scope',
  '',
  '- Editing the conversation from the mockup.',
  '* Sharing links outside the workspace.',
  '',
  '## Expected proof',
  '',
  'A Playwright journey and screenshots of the header.',
  '',
  '```text',
  '## not a heading inside a fence',
  '```',
  '',
].join('\r\n');

function issue(overrides: Partial<IssueRecord> = {}): IssueRecord {
  return {
    number: 42,
    title: '  Link mockups to their conversation  ',
    body: VALID_BODY,
    labels: ['type:ui', 'spec:validated'],
    state: 'open',
    blockedBy: [12, 7, 12],
    ...overrides,
  };
}

function problemCodes(record: IssueRecord): readonly SpecProblemCode[] {
  try {
    new MarkdownSpecReader().read(record);
  } catch (error) {
    if (error instanceof SpecFormatError) return error.problems.map((problem) => problem.code);
    throw error;
  }
  return [];
}

describe('MarkdownSpecReader', () => {
  it('parses every section, the type label and the blocked-by dependencies', () => {
    expect(new MarkdownSpecReader().read(issue())).toEqual({
      number: 42,
      title: 'Link mockups to their conversation',
      type: 'ui',
      need: 'Operators lose track of which conversation produced a mockup.\nThey need the source conversation linked from the mockup.',
      acceptanceCriteria: [
        'The mockup header shows a link to its conversation.',
        'Following the link opens the conversation at the message that produced the mockup.',
      ],
      outOfScope: ['Editing the conversation from the mockup.', 'Sharing links outside the workspace.'],
      expectedProof: 'A Playwright journey and screenshots of the header.\n\n```text\n## not a heading inside a fence\n```',
      dependsOn: [7, 12],
      commitKind: null,
    });
  });

  it('reports every missing section by name', () => {
    const body = '## Need\n\nSomething.\n';
    let caught: unknown;
    try {
      new MarkdownSpecReader().read(issue({ body }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SpecFormatError);
    expect(caught instanceof SpecFormatError ? caught.problems : []).toEqual([
      { code: 'missing-section', section: 'Acceptance criteria', message: 'section "## Acceptance criteria" is missing' },
      { code: 'missing-section', section: 'Out of scope', message: 'section "## Out of scope" is missing' },
      { code: 'missing-section', section: 'Expected proof', message: 'section "## Expected proof" is missing' },
    ]);
  });

  it('reports an empty section', () => {
    const body = VALID_BODY.replace('A Playwright journey and screenshots of the header.', '').replace(/```text[\s\S]*```/, '');
    expect(problemCodes(issue({ body }))).toEqual(['empty-section']);
  });

  it('requires a numbered list of acceptance criteria and a bullet list out of scope', () => {
    const body = VALID_BODY.replace('1. The mockup header', '- The mockup header').replace(
      '- Editing the conversation',
      'Editing the conversation',
    );
    expect(problemCodes(issue({ body }))).toEqual(['not-a-numbered-list', 'not-a-bullet-list']);
  });

  it('rejects an empty list item', () => {
    const body = VALID_BODY.replace('1. The mockup header shows a link to its conversation.', '1.');
    expect(problemCodes(issue({ body }))).toEqual(['empty-list-item']);
  });

  it('rejects unknown, duplicate sections and text before the first section', () => {
    const body = `Intro text.\n\n${VALID_BODY}\n## Notes\n\nextra\n\n## Need\n\nagain\n`;
    expect(problemCodes(issue({ body }))).toEqual(['unexpected-preamble', 'unknown-section', 'duplicate-section']);
  });

  it('accepts level-three headings inside a section as content', () => {
    const body = VALID_BODY.replace('## Expected proof\r\n\r\n', '## Expected proof\r\n\r\n### Screens\r\n\r\n');
    expect(new MarkdownSpecReader().read(issue({ body })).expectedProof.startsWith('### Screens')).toBe(true);
  });

  it('requires exactly one known type label', () => {
    expect(problemCodes(issue({ labels: ['spec:validated'] }))).toEqual(['missing-type-label']);
    expect(problemCodes(issue({ labels: ['type:ui', 'type:doc'] }))).toEqual(['multiple-type-labels']);
    expect(problemCodes(issue({ labels: ['type:feature'] }))).toEqual(['unknown-type-label']);
  });

  it('reads an optional kind label as the conventional commit type', () => {
    expect(new MarkdownSpecReader().read(issue({ labels: ['type:ui', 'kind:perf', 'spec:validated'] })).commitKind).toBe('perf');
    expect(problemCodes(issue({ labels: ['type:ui', 'kind:feat', 'kind:fix'] }))).toEqual(['multiple-kind-labels']);
    expect(problemCodes(issue({ labels: ['type:ui', 'kind:feature'] }))).toEqual(['unknown-kind-label']);
  });

  it('rejects an empty title', () => {
    expect(problemCodes(issue({ title: '   ' }))).toEqual(['empty-title']);
  });

  it('recognises the validated marker label only', () => {
    expect(isSpecValidated(issue())).toBe(true);
    expect(isSpecValidated(issue({ labels: ['type:ui', 'spec:draft'] }))).toBe(false);
  });
});
