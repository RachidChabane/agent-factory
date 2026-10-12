import { describe, expect, it } from 'vitest';
import { commitReference } from './format.ts';

describe('commitReference', () => {
  it('shortens a full commit sha and leaves any other reference as it is', () => {
    expect(commitReference('c0ffee14802ab85811fbd907f94990dfa598b157')).toBe('c0ffee1');
    expect(commitReference('A-15')).toBe('A-15');
    expect(commitReference('req-1')).toBe('req-1');
  });
});
