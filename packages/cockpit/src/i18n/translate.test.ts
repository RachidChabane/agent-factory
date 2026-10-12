import { describe, expect, it } from 'vitest';
import type { MessageCatalog } from './catalog/types.ts';
import { createTranslator } from './translate.ts';

const CATALOG: MessageCatalog = {
  greeting: 'Hello {name}',
  runs: { none: 'No runs', one: '{count} run', other: '{count} runs' },
  twice: '{value} and {value}',
};

describe('createTranslator', () => {
  it('fills the placeholders of a message', () => {
    expect(createTranslator('en', CATALOG).text('greeting', { name: 'Dana' })).toBe('Hello Dana');
    expect(createTranslator('en', CATALOG).text('twice', { value: 4 })).toBe('4 and 4');
  });

  it('keeps a placeholder it has no value for, and returns the key of an unknown message', () => {
    expect(createTranslator('en', CATALOG).text('greeting')).toBe('Hello {name}');
    expect(createTranslator('en', CATALOG).text('missing')).toBe('missing');
  });

  it('chooses the plural form of the active language', () => {
    const english = createTranslator('en', CATALOG);
    expect(english.text('runs', { count: 1 })).toBe('1 run');
    expect(english.text('runs', { count: 2 })).toBe('2 runs');
    expect(english.text('runs', { count: 0 })).toBe('No runs');
  });

  it('counts zero as singular in French, as the language does', () => {
    const french = createTranslator('fr', { runs: { one: '{count} exécution', other: '{count} exécutions' } });
    expect(french.text('runs', { count: 0 })).toBe('0 exécution');
    expect(french.text('runs', { count: 1 })).toBe('1 exécution');
    expect(french.text('runs', { count: 2 })).toBe('2 exécutions');
  });

  it('formats numbers with the separators of the language', () => {
    expect(createTranslator('en', CATALOG).text('runs', { count: 1234 })).toBe('1,234 runs');
    expect(createTranslator('fr', CATALOG).text('runs', { count: 1234 }).replace(/\s/g, ' ')).toBe('1 234 runs');
  });

  it('reports whether a key exists', () => {
    const translator = createTranslator('en', CATALOG);
    expect(translator.has('greeting')).toBe(true);
    expect(translator.has('absent')).toBe(false);
  });
});
