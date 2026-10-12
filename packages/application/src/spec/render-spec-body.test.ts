import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COMMIT_KINDS, DEFAULT_ISSUE_TYPES, filmLabel } from '@agent-factory/domain';
import type { IssueSpec } from '@agent-factory/domain';
import { parseIssueSpec } from './markdown-spec-reader.ts';
import { renderSpecBody } from './render-spec-body.ts';
import { SpecRenderError } from './spec-errors.ts';
import { DEFAULT_PROJECT_CONVENTIONS } from '../conventions/project-conventions.ts';
import { kindLabel } from './spec-format.ts';

const CONVENTIONS = DEFAULT_PROJECT_CONVENTIONS;

const WORD_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzéèàçABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const PUNCTUATION = [',', '.', ':', '`', '(', ')', "'", '"', '/', '!', '?'];

const word = fc
  .array(fc.constantFrom(...WORD_CHARACTERS.split('')), { minLength: 1, maxLength: 10 })
  .map((characters) => characters.join(''));
const token = fc.oneof(word, word.chain((value) => fc.constantFrom(...PUNCTUATION).map((mark) => `${value}${mark}`)));
const sentence = fc.array(token, { minLength: 1, maxLength: 8 }).map((tokens) => tokens.join(' '));
const paragraph = fc.array(sentence, { minLength: 1, maxLength: 3 }).map((lines) => lines.join('\n'));
const multiLineText = fc.array(paragraph, { minLength: 1, maxLength: 3 }).map((paragraphs) => paragraphs.join('\n\n'));

const issueSpec: fc.Arbitrary<IssueSpec> = fc.record({
  number: fc.integer({ min: 1, max: 100_000 }),
  title: sentence,
  type: fc.constantFrom(...DEFAULT_ISSUE_TYPES.map((type) => type.id)),
  need: multiLineText,
  acceptanceCriteria: fc.array(sentence, { minLength: 1, maxLength: 6 }),
  outOfScope: fc.array(sentence, { minLength: 1, maxLength: 4 }),
  expectedProof: multiLineText,
  dependsOn: fc.uniqueArray(fc.integer({ min: 1, max: 100_000 }), { maxLength: 4 }).map((numbers) => numbers.sort((a, b) => a - b)),
  commitKind: fc.option(fc.constantFrom(...COMMIT_KINDS), { nil: null }),
  films: fc.uniqueArray(fc.constantFrom('checkout-flow', 'order.history', 'v2_login'), { maxLength: 3 }),
});

function parseRendered(spec: IssueSpec, body: string): IssueSpec {
  return parseIssueSpec(
    {
      number: spec.number,
      title: spec.title,
      body,
      labels: [
        CONVENTIONS.typology.get(spec.type).label,
        ...(spec.commitKind === null ? [] : [kindLabel(spec.commitKind, CONVENTIONS.labels.kindPrefix)]),
        ...spec.films.map(filmLabel),
        CONVENTIONS.labels.validated,
      ],
      blockedBy: spec.dependsOn,
    },
    CONVENTIONS,
  );
}

describe('renderSpecBody', () => {
  it('renders the canonical sections in order', () => {
    const spec: IssueSpec = {
      number: 3,
      title: 'Export a mockup',
      type: 'ui',
      need: 'Operators need a PNG export.',
      acceptanceCriteria: ['The export button downloads a PNG.', 'The PNG matches the canvas.'],
      outOfScope: ['PDF export.'],
      expectedProof: 'A Playwright journey.',
      dependsOn: [],
      commitKind: null,
      films: [],
    };
    expect(renderSpecBody(spec, CONVENTIONS)).toBe(
      [
        '## Need',
        '',
        'Operators need a PNG export.',
        '',
        '## Acceptance criteria',
        '',
        '1. The export button downloads a PNG.',
        '2. The PNG matches the canvas.',
        '',
        '## Out of scope',
        '',
        '- PDF export.',
        '',
        '## Expected proof',
        '',
        'A Playwright journey.',
        '',
      ].join('\n'),
    );
  });

  it('refuses a spec it cannot render losslessly', () => {
    const base: IssueSpec = {
      number: 9,
      title: 'Broken',
      type: 'docs',
      need: 'Need.\n## Sneaky heading',
      acceptanceCriteria: ['One.'],
      outOfScope: ['None.'],
      expectedProof: 'Render.',
      dependsOn: [],
      commitKind: null,
      films: [],
    };
    expect(() => renderSpecBody(base, CONVENTIONS)).toThrow(SpecRenderError);
    expect(() => renderSpecBody({ ...base, need: 'Fine.', acceptanceCriteria: ['two\nlines'] }, CONVENTIONS)).toThrow(SpecRenderError);
    expect(() => renderSpecBody({ ...base, need: 'Opens a fence\n```' }, CONVENTIONS)).toThrow(SpecRenderError);
  });
});

describe('spec round trip (property)', () => {
  it('parses a rendered spec back to the same spec', () => {
    fc.assert(
      fc.property(issueSpec, (spec) => {
        expect(parseRendered(spec, renderSpecBody(spec, CONVENTIONS))).toEqual(spec);
      }),
    );
  });

  it('is stable when the rendered body is rendered again', () => {
    fc.assert(
      fc.property(issueSpec, (spec) => {
        const body = renderSpecBody(spec, CONVENTIONS);
        expect(renderSpecBody(parseRendered(spec, body), CONVENTIONS)).toBe(body);
      }),
    );
  });
});
