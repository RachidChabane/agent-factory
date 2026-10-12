import { describe, expect, it } from 'vitest';
import { renderSpecFile, singleLine, slugOf, specFilePath } from './proposed-spec-file.ts';

describe('slugOf', () => {
  it('lowercases and replaces runs of non-alphanumerics with one dash', () => {
    expect(slugOf('  Show the Cost -- on /run page! ')).toBe('show-the-cost-on-run-page');
  });

  it('caps the length without leaving a trailing dash', () => {
    const slug = slugOf(`${'a'.repeat(47)} bbbb`);
    expect(slug).toBe('a'.repeat(47));
  });

  it('falls back to a fixed slug when nothing alphanumeric remains', () => {
    expect(slugOf('???')).toBe('spec');
  });
});

describe('specFilePath', () => {
  it('numbers the file and places it under specs', () => {
    expect(specFilePath(2, 'Add a Thing')).toBe('specs/2-add-a-thing.md');
  });
});

describe('singleLine', () => {
  it('collapses line breaks and repeated spaces', () => {
    expect(singleLine(' a\n  b\t c ')).toBe('a b c');
  });
});

describe('renderSpecFile', () => {
  it('reports no problem for a well-formed spec', () => {
    const rendered = renderSpecFile({
      title: 'Add a thing',
      type: 'doc',
      need: 'Need.',
      acceptanceCriteria: ['It exists.'],
      outOfScope: ['More.'],
      expectedProof: 'A page.',
    });
    expect(rendered.problems).toEqual([]);
    expect(rendered.content.startsWith('Title: Add a thing\nLabels: type:doc\n\n## Need')).toBe(true);
  });
});
