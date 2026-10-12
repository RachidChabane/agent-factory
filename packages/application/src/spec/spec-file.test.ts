import { describe, expect, it } from 'vitest';
import { parseLabelList, parseSpecFile, specFileProblems, SpecFileFormatError, withExtraLabels } from './spec-file.ts';

const SPEC_FILE = [
  'Title: Serve shop.example.com from the storefront in production',
  'Labels: type:infra-ci',
  '',
  '## Need',
  'On launch day, shop.example.com reaches the UI.',
  '',
  '## Acceptance criteria',
  '1. The production UI values declare a route.',
  '2. An automated check asserts criterion 1.',
  '',
  '## Out of scope',
  '- DNS records.',
  '',
  '## Expected proof',
  'The check fails on main and passes on the branch.',
  '',
].join('\n');

describe('spec files', () => {
  it('reads the title, the labels and the spec body', () => {
    const file = parseSpecFile(SPEC_FILE);
    expect(file.title).toBe('Serve shop.example.com from the storefront in production');
    expect(file.labels).toEqual(['type:infra-ci']);
    expect(file.body.startsWith('## Need\nOn cutover day')).toBe(true);
    expect(file.body.endsWith('passes on the branch.\n')).toBe(true);
    expect(specFileProblems(file)).toEqual([]);
  });

  it('merges extra labels without duplicating the ones the file declares', () => {
    const file = withExtraLabels(parseSpecFile(SPEC_FILE), parseLabelList('type:infra-ci, spec:validated,,'));
    expect(file.labels).toEqual(['type:infra-ci', 'spec:validated']);
    expect(specFileProblems(file)).toEqual([]);
  });

  it('reports the spec problems of the body', () => {
    const file = parseSpecFile(SPEC_FILE.replace('## Out of scope\n- DNS records.\n', ''));
    expect(specFileProblems(file).map((problem) => problem.code)).toEqual(['missing-section']);
    expect(specFileProblems(withExtraLabels(file, ['type:ui'])).map((problem) => problem.code)).toEqual([
      'missing-section',
      'multiple-type-labels',
    ]);
  });

  it('requires the title and labels header lines', () => {
    expect(() => parseSpecFile(SPEC_FILE.replace('Title:', 'Name:'))).toThrow(SpecFileFormatError);
    expect(() => parseSpecFile(SPEC_FILE.replace('Labels:', 'Tags:'))).toThrow(SpecFileFormatError);
    expect(() => parseSpecFile('Title:   \nLabels: a\n## Need\nx\n')).toThrow(SpecFileFormatError);
  });
});
