import { describe, expect, it } from 'vitest';
import { LOCALE_STORAGE_KEY, persistLocale, readStoredLocale, resolveInitialLocale } from './locale.ts';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

const BLOCKED_STORAGE: Storage = {
  length: 0,
  clear: () => undefined,
  getItem: () => {
    throw new Error('blocked');
  },
  key: () => null,
  removeItem: () => undefined,
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('language selection', () => {
  it('starts in English', () => {
    expect(resolveInitialLocale('', memoryStorage())).toBe('en');
  });

  it('prefers the address, then the saved choice', () => {
    const storage = memoryStorage({ [LOCALE_STORAGE_KEY]: 'fr' });
    expect(resolveInitialLocale('', storage)).toBe('fr');
    expect(resolveInitialLocale('?lang=en', storage)).toBe('en');
    expect(resolveInitialLocale('?lang=de', storage)).toBe('fr');
  });

  it('saves the choice and reads it back', () => {
    const storage = memoryStorage();
    persistLocale(storage, 'fr');
    expect(readStoredLocale(storage)).toBe('fr');
  });

  it('survives a storage that refuses to be read or written', () => {
    expect(() => persistLocale(BLOCKED_STORAGE, 'fr')).not.toThrow();
    expect(readStoredLocale(BLOCKED_STORAGE)).toBeNull();
    expect(resolveInitialLocale('', BLOCKED_STORAGE)).toBe('en');
    expect(resolveInitialLocale('', null)).toBe('en');
  });

  it('ignores a saved value that is not a language', () => {
    expect(readStoredLocale(memoryStorage({ [LOCALE_STORAGE_KEY]: 'klingon' }))).toBeNull();
  });
});
