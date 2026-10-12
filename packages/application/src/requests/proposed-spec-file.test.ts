import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FILM_SCENARIO_MAX_LENGTH, isFilmScenarioName } from '@agent-factory/domain';
import { DEFAULT_PROJECT_CONVENTIONS } from '../conventions/project-conventions.ts';
import { parseSpecFile, specFileLabels } from '../spec/index.ts';
import { renderSpecFile, singleLine, slugOf, specFilePath, type ProposedSpecDraft } from './proposed-spec-file.ts';

const DRAFT: ProposedSpecDraft = {
  title: 'Add a thing',
  type: 'docs',
  need: 'Need.',
  acceptanceCriteria: ['It exists.'],
  outOfScope: ['More.'],
  expectedProof: 'A page.',
};
const SCENARIO_CHARACTERS = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'];
const scenarioNames = fc
  .array(fc.constantFrom(...SCENARIO_CHARACTERS), { minLength: 1, maxLength: FILM_SCENARIO_MAX_LENGTH })
  .map((characters) => characters.join(''))
  .filter(isFilmScenarioName);

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
      type: 'docs',
      need: 'Need.',
      acceptanceCriteria: ['It exists.'],
      outOfScope: ['More.'],
      expectedProof: 'A page.',
    }, DEFAULT_PROJECT_CONVENTIONS);
    expect(rendered.problems).toEqual([]);
    expect(rendered.content.startsWith('Title: Add a thing\nLabels: type:docs\n\n## Need')).toBe(true);
  });
});

describe('renderSpecFile with films', () => {
  it('writes the declared scenarios as a Films header after the labels', () => {
    const rendered = renderSpecFile({ ...DRAFT, films: ['checkout-flow', 'order.history'] }, DEFAULT_PROJECT_CONVENTIONS);
    expect(rendered.problems).toEqual([]);
    expect(rendered.content.startsWith('Title: Add a thing\nLabels: type:docs\nFilms: checkout-flow, order.history\n\n## Need')).toBe(true);
  });

  it('writes no Films header for a spec that declares none', () => {
    expect(renderSpecFile({ ...DRAFT, films: [] }, DEFAULT_PROJECT_CONVENTIONS).content).toBe(renderSpecFile(DRAFT, DEFAULT_PROJECT_CONVENTIONS).content);
    expect(renderSpecFile(DRAFT, DEFAULT_PROJECT_CONVENTIONS).content).not.toContain('Films:');
  });

  it('is read back as the same scenarios, and each one becomes a film label', () => {
    fc.assert(
      fc.property(fc.uniqueArray(scenarioNames, { minLength: 1, maxLength: 4 }), (films) => {
        const file = parseSpecFile(renderSpecFile({ ...DRAFT, films }, DEFAULT_PROJECT_CONVENTIONS).content);
        expect(file.films).toEqual(films);
        expect(specFileLabels(file)).toEqual(['type:docs', ...films.map((film) => `film:${film}`)]);
      }),
    );
  });
});

