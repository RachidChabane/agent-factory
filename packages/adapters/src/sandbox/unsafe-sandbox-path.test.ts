import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { assertSafeSandboxPath, UnsafeSandboxPathError } from './unsafe-sandbox-path.ts';

const UNSAFE_CHARACTERS = ['"', '\n', '\r', '\\', '\u0000'];

describe('assertSafeSandboxPath', () => {
  it('returns a path that can be written into a profile or an argument list as it is', () => {
    expect(assertSafeSandboxPath("/Users/operator/Library/Application Support/it's here")).toBe("/Users/operator/Library/Application Support/it's here");
  });

  it.each(UNSAFE_CHARACTERS)('refuses a path holding %j', (character) => {
    expect(() => assertSafeSandboxPath(`/tmp/a${character}b`)).toThrow(UnsafeSandboxPathError);
  });

  it('names the path it refuses', () => {
    expect(() => assertSafeSandboxPath('/tmp/a")(allow default')).toThrow('"/tmp/a\\")(allow default" cannot be written into a sandbox profile');
  });

  it('accepts a path exactly when it holds none of the unsafe characters', () => {
    const characters = fc.constantFrom('a', 'b', '/', ' ', ...UNSAFE_CHARACTERS);
    fc.assert(
      fc.property(fc.array(characters).map((chosen) => chosen.join('')), (path) => {
        const unsafe = UNSAFE_CHARACTERS.some((character) => path.includes(character));
        if (unsafe) expect(() => assertSafeSandboxPath(path)).toThrow(UnsafeSandboxPathError);
        else expect(assertSafeSandboxPath(path)).toBe(path);
      }),
    );
  });
});
