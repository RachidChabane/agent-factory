import { describe, expect, it } from 'vitest';
import { en, enFragments } from './catalog/en/index.ts';
import { fr, frFragments } from './catalog/fr/index.ts';
import type { Message, MessageCatalog } from './catalog/types.ts';

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;
const MESSAGE_ENTRIES = (catalog: MessageCatalog): readonly [string, Message][] => Object.entries(catalog);

function textsOf(message: Message): readonly string[] {
  return typeof message === 'string' ? [message] : Object.values(message);
}

function placeholdersOf(message: Message): readonly string[] {
  const names = new Set(textsOf(message).flatMap((text) => [...text.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1] ?? '')));
  return [...names].sort();
}

function kindOf(message: Message): 'text' | 'plural' {
  return typeof message === 'string' ? 'text' : 'plural';
}

describe('message catalogs', () => {
  it('declare exactly the same keys in English and in French', () => {
    expect(Object.keys(fr).toSorted()).toEqual(Object.keys(en).toSorted());
  });

  it('declare each domain with the same keys in both languages', () => {
    for (const domain of Object.keys(enFragments) as (keyof typeof enFragments)[]) {
      expect(Object.keys(frFragments[domain]).toSorted(), domain).toEqual(Object.keys(enFragments[domain]).toSorted());
    }
  });

  it('never declare a key in two domains, where the later one would silently replace the earlier', () => {
    const owners = new Map<string, string>();
    for (const [domain, fragment] of Object.entries(enFragments)) {
      for (const key of Object.keys(fragment)) {
        expect(owners.get(key), `${key} is declared in ${owners.get(key) ?? ''} and in ${domain}`).toBeUndefined();
        owners.set(key, domain);
      }
    }
  });

  it('give each key the same shape and the same placeholders in both languages', () => {
    for (const [key, english] of MESSAGE_ENTRIES(en)) {
      const french = (fr as MessageCatalog)[key];
      expect(french, key).toBeDefined();
      if (french === undefined) continue;
      expect(kindOf(french), `${key} shape`).toBe(kindOf(english));
      expect(placeholdersOf(french), `${key} placeholders`).toEqual(placeholdersOf(english));
    }
  });

  it('declare the singular and the plural form of every plural message', () => {
    for (const catalog of [en, fr] as readonly MessageCatalog[]) {
      for (const [key, message] of MESSAGE_ENTRIES(catalog)) {
        if (typeof message === 'string') continue;
        expect(message.one, key).toMatch(/\S/);
        expect(message.other, key).toMatch(/\S/);
      }
    }
  });

  it('hold no empty message', () => {
    for (const catalog of [en, fr] as readonly MessageCatalog[]) {
      for (const [key, message] of MESSAGE_ENTRIES(catalog)) {
        for (const text of textsOf(message)) expect(text.trim().length, key).toBeGreaterThan(0);
      }
    }
  });
});
