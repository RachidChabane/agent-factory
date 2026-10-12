import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FrontMatterMissingError, parseFrontMatter, renderFrontMatter } from './frontMatter.ts';

const label = fc.stringMatching(/^[a-z][a-z:-]{0,15}$/);
const frontMatter = fc.record({
  title: fc.string({ minLength: 1, maxLength: 60 }),
  labels: fc.array(label, { maxLength: 4 }),
  state: fc.constantFrom('open', 'closed'),
  blockedBy: fc.array(fc.integer({ min: 1, max: 9999 }), { maxLength: 3 }),
});

describe('front matter documents', () => {
  it('renders a readable issue file', () => {
    const text = renderFrontMatter({ title: 'Serve the domain', labels: ['type:infra-ci'], state: 'open', blockedBy: [] }, '## Need\n\nIt.\n');
    expect(text).toBe(
      ['---', 'title: Serve the domain', 'labels:', '  - type:infra-ci', 'state: open', 'blockedBy: []', '---', '', '## Need', '', 'It.', ''].join('\n'),
    );
  });

  it('parses back exactly what it rendered', () => {
    fc.assert(
      fc.property(frontMatter, fc.string({ maxLength: 200 }), (data, body) => {
        expect(parseFrontMatter(renderFrontMatter(data, body))).toEqual({ data, body });
      }),
    );
  });

  it('keeps a body that itself contains a delimiter line', () => {
    const body = '## Need\n\n---\n\ntext\n';
    expect(parseFrontMatter(renderFrontMatter({ title: 't' }, body)).body).toBe(body);
  });

  it('refuses a document without front matter', () => {
    expect(() => parseFrontMatter('## Need\n')).toThrow(FrontMatterMissingError);
    expect(() => parseFrontMatter('---\ntitle: open ended\n')).toThrow(FrontMatterMissingError);
  });
});
