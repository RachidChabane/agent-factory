import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FALLBACK_SLUG, issueBranchName, MAX_SLUG_LENGTH, slugify } from './branch-name.ts';

const GIT_SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('issue branch name', () => {
  it('builds <prefix><number>-<slug> without diacritics', () => {
    expect(issueBranchName('factory/', 42, 'Créer un aperçu : « Mockup » déjà validé!')).toBe('factory/42-creer-un-apercu-mockup-deja-valide');
    expect(issueBranchName('bots/factory-', 7, 'Fix the cart')).toBe('bots/factory-7-fix-the-cart');
  });

  it('falls back when the title has no usable character', () => {
    expect(slugify('🚀 ??? 🚀')).toBe(FALLBACK_SLUG);
  });

  it('bounds the slug length without a trailing dash', () => {
    expect(slugify('a'.repeat(39) + ' bcd')).toBe('a'.repeat(39));
  });

  it('always yields a short git-safe slug (property)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 200 }), (title) => {
        const slug = slugify(title);
        expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
        expect(slug).toMatch(GIT_SAFE_SLUG);
      }),
    );
  });
});
