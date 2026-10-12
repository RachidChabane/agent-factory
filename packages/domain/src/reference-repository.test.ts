import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  isReferenceName,
  isReferenceRevision,
  referenceProblems,
  referenceSnapshotName,
  REFERENCE_NAME_MAX_LENGTH,
  REFERENCE_REVISION_MAX_LENGTH,
} from './reference-repository.ts';

const SEPARATORS_AND_WILDCARDS = ['/', '\\', '*', '?', ' ', ':', '@', '[', '{'] as const;

describe('reference name', () => {
  it('accepts lowercase slugs', () => {
    for (const name of ['design-tokens', 'tokens-v2', 'a', '2024-assets']) expect(isReferenceName(name)).toBe(true);
  });

  it('refuses anything that is not a plain slug', () => {
    for (const name of ['', 'Tokens', '-tokens', 'tokens-', 'tokens--v2', 'a/b', 'a b', 'a.b', 'a_b', '..', 'é', 'a@b']) expect(isReferenceName(name)).toBe(false);
  });

  it('refuses names beyond the maximum length', () => {
    expect(isReferenceName('a'.repeat(REFERENCE_NAME_MAX_LENGTH))).toBe(true);
    expect(isReferenceName('a'.repeat(REFERENCE_NAME_MAX_LENGTH + 1))).toBe(false);
  });

  it('never accepts a name that holds a path separator, a wildcard or a blank', () => {
    fc.assert(fc.property(fc.string(), fc.constantFrom(...SEPARATORS_AND_WILDCARDS), fc.string(), (left, mark, right) => !isReferenceName(`${left}${mark}${right}`)));
  });

  it('only accepts names that can be one directory segment', () => {
    fc.assert(fc.property(fc.string(), (name) => !isReferenceName(name) || (name !== '' && !name.startsWith('.') && !/[^a-z0-9-]/.test(name))));
  });
});

describe('reference revision', () => {
  it('accepts tags and commit ids', () => {
    for (const ref of ['v1.0.0', 'v1', '1d3e4a9ce003af09489551fd6398fc44c24069cc', 'release_2024.1', 'tokens-v0.3.0']) expect(isReferenceRevision(ref)).toBe(true);
  });

  it('refuses what could pass for an option, leave the directory or widen a rule', () => {
    for (const ref of ['', '-rf', '--output=x', '../x', 'a..b', 'a/b', 'a b', 'a*', 'a?', 'a@{1}', 'a:b', '.hidden', 'a\nb', "a'b", 'a"b', 'a`b', 'a$b', 'a;b']) {
      expect(isReferenceRevision(ref), JSON.stringify(ref)).toBe(false);
    }
  });

  it('refuses revisions beyond the maximum length', () => {
    expect(isReferenceRevision('a'.repeat(REFERENCE_REVISION_MAX_LENGTH))).toBe(true);
    expect(isReferenceRevision('a'.repeat(REFERENCE_REVISION_MAX_LENGTH + 1))).toBe(false);
  });

  it('never accepts a revision that starts with a hyphen, climbs, or holds anything but name characters', () => {
    fc.assert(
      fc.property(fc.string(), (ref) => !isReferenceRevision(ref) || (!ref.startsWith('-') && !ref.includes('..') && /^[A-Za-z0-9._-]+$/.test(ref))),
      { numRuns: 500 },
    );
  });

  it('never accepts a revision with a separator, a wildcard or a blank in it', () => {
    fc.assert(fc.property(fc.string(), fc.constantFrom(...SEPARATORS_AND_WILDCARDS), fc.string(), (left, mark, right) => !isReferenceRevision(`${left}${mark}${right}`)));
  });
});

describe('reference problems', () => {
  it('is empty for a name and a ref that make a snapshot name', () => {
    expect(referenceProblems({ name: 'design-tokens', ref: 'v1.0.0' })).toEqual([]);
  });

  it('names what is wrong, the name and the ref separately', () => {
    expect(referenceProblems({ name: 'Tokens', ref: 'v1.0.0' })).toEqual([expect.stringContaining('the name must be lowercase letters')]);
    expect(referenceProblems({ name: 'tokens', ref: '--output=x' })).toEqual([expect.stringContaining('the ref must be a tag or commit')]);
    expect(referenceProblems({ name: '../x', ref: '../y' })).toHaveLength(2);
  });
});

describe('reference snapshot name', () => {
  it('joins the name and the ref with an at sign', () => {
    expect(referenceSnapshotName({ name: 'design-tokens', ref: 'v1.0.0' })).toBe('design-tokens@v1.0.0');
  });
});
