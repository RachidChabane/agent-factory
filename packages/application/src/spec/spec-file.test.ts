import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT_CONVENTIONS } from '../conventions/project-conventions.ts';
import { filmsHeaderLines, parseLabelList, parseSpecFile, specFileLabels, specFileProblems, SpecFileFormatError, withExtraLabels } from './spec-file.ts';
import { FILM_SCENARIO_MAX_LENGTH } from '@agent-factory/domain';

const SPEC_FILE = [
  'Title: Serve shop.example.com from the storefront in production',
  'Labels: type:infra',
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
    expect(file.labels).toEqual(['type:infra']);
    expect(file.body.startsWith('## Need\nOn launch day')).toBe(true);
    expect(file.body.endsWith('passes on the branch.\n')).toBe(true);
    expect(specFileProblems(file, DEFAULT_PROJECT_CONVENTIONS)).toEqual([]);
  });

  it('merges extra labels without duplicating the ones the file declares', () => {
    const file = withExtraLabels(parseSpecFile(SPEC_FILE), parseLabelList('type:infra, spec:validated,,'));
    expect(file.labels).toEqual(['type:infra', 'spec:validated']);
    expect(specFileProblems(file, DEFAULT_PROJECT_CONVENTIONS)).toEqual([]);
  });

  it('reports the spec problems of the body', () => {
    const file = parseSpecFile(SPEC_FILE.replace('## Out of scope\n- DNS records.\n', ''));
    expect(specFileProblems(file, DEFAULT_PROJECT_CONVENTIONS).map((problem) => problem.code)).toEqual(['missing-section']);
    expect(specFileProblems(withExtraLabels(file, ['type:ui']), DEFAULT_PROJECT_CONVENTIONS).map((problem) => problem.code)).toEqual([
      'missing-section',
      'multiple-type-labels',
    ]);
  });

  it('reads the optional Films header without leaking it into the body', () => {
    const file = parseSpecFile(SPEC_FILE.replace('Labels: type:infra\n', 'Labels: type:infra\nFilms: checkout-flow, order.history,checkout-flow\n'));
    expect(file.films).toEqual(['checkout-flow', 'order.history']);
    expect(file.body.startsWith('## Need\n')).toBe(true);
    expect(specFileLabels(file)).toEqual(['type:infra', 'film:checkout-flow', 'film:order.history']);
    expect(specFileProblems(file, DEFAULT_PROJECT_CONVENTIONS)).toEqual([]);
  });

  it('finds the Films header after a blank line, as in a spec file the challenger rendered', () => {
    const file = parseSpecFile(SPEC_FILE.replace('Labels: type:infra\n', 'Labels: type:infra\n\nFilms: checkout-flow\n'));
    expect(file.films).toEqual(['checkout-flow']);
    expect(file.body.startsWith('## Need\n')).toBe(true);
    expect(specFileProblems(file, DEFAULT_PROJECT_CONVENTIONS)).toEqual([]);
  });

  it('declares no films when the header is absent', () => {
    const file = parseSpecFile(SPEC_FILE);
    expect(file.films).toEqual([]);
    expect(specFileLabels(file)).toEqual(['type:infra']);
  });

  it('reports a film scenario that is not a valid name or does not fit a label', () => {
    const tooLong = 'a'.repeat(FILM_SCENARIO_MAX_LENGTH + 1);
    const file = parseSpecFile(SPEC_FILE.replace('Labels: type:infra\n', `Labels: type:infra\nFilms: ${tooLong}, bad name\n`));
    expect(specFileProblems(file, DEFAULT_PROJECT_CONVENTIONS).map((problem) => problem.code)).toEqual(['invalid-film-label', 'invalid-film-label']);
  });

  it('requires the title and labels header lines', () => {
    expect(() => parseSpecFile(SPEC_FILE.replace('Title:', 'Name:'))).toThrow(SpecFileFormatError);
    expect(() => parseSpecFile(SPEC_FILE.replace('Labels:', 'Tags:'))).toThrow(SpecFileFormatError);
    expect(() => parseSpecFile('Title:   \nLabels: a\n## Need\nx\n')).toThrow(SpecFileFormatError);
  });
});

describe('filmsHeaderLines', () => {
  it('is one Films line holding every scenario', () => {
    expect(filmsHeaderLines(['checkout-flow', 'order.history'])).toEqual(['Films: checkout-flow, order.history']);
  });

  it('is no line at all when no scenario is declared', () => {
    expect(filmsHeaderLines([])).toEqual([]);
  });
});
