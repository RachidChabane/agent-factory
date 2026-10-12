import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { forPlatform, isSupportedPlatform, SUPPORTED_PLATFORMS, UnsupportedPlatformError, type PlatformTable } from './supported-platform.ts';

const TABLE: PlatformTable<string> = { darwin: 'macOS value', linux: 'Linux value' };

describe('supported platforms', () => {
  it('are the two operating systems the factory runs on', () => {
    expect(SUPPORTED_PLATFORMS).toEqual(['darwin', 'linux']);
  });

  it.each(SUPPORTED_PLATFORMS)('recognises %s', (platform) => {
    expect(isSupportedPlatform(platform)).toBe(true);
  });

  it.each(['win32', 'freebsd', 'Linux', '', 'darwin '])('does not recognise %j', (platform) => {
    expect(isSupportedPlatform(platform)).toBe(false);
  });
});

describe('forPlatform', () => {
  it('picks the entry of the platform', () => {
    expect(forPlatform(TABLE, 'darwin')).toBe('macOS value');
    expect(forPlatform(TABLE, 'linux')).toBe('Linux value');
  });

  it('names the platform it does not support', () => {
    expect(() => forPlatform(TABLE, 'win32')).toThrow(UnsupportedPlatformError);
    expect(() => forPlatform(TABLE, 'win32')).toThrow('"win32" is not supported: the factory runs on darwin and linux');
    expect(new UnsupportedPlatformError('aix')).toMatchObject({ platform: 'aix', name: 'UnsupportedPlatformError' });
  });

  it('refuses every name that is not a supported platform and answers every supported one', () => {
    fc.assert(
      fc.property(fc.string().filter((name) => !isSupportedPlatform(name)), (name) => {
        expect(() => forPlatform(TABLE, name)).toThrow(UnsupportedPlatformError);
      }),
    );
    fc.assert(fc.property(fc.constantFrom(...SUPPORTED_PLATFORMS), (platform) => forPlatform(TABLE, platform) === TABLE[platform]));
  });
});
