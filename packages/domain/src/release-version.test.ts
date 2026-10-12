import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { releaseVersionOf, supersedingTag, tagNamesVersion } from './release-version.ts';

const version = fc.tuple(fc.nat(30), fc.nat(30), fc.nat(30)).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

describe('release versions', () => {
  it('reads the version a release pull request announces', () => {
    expect(releaseVersionOf('chore(main): release 1.4.0')).toBe('1.4.0');
    expect(releaseVersionOf('chore(main): release storefront 2.0.0-rc.1')).toBe('2.0.0-rc.1');
    expect(releaseVersionOf('chore: tidy the release notes')).toBeNull();
  });

  it('matches a tag that names exactly the version', () => {
    expect(tagNamesVersion('v1.4.0', '1.4.0')).toBe(true);
    expect(tagNamesVersion('storefront-v1.4.0', '1.4.0')).toBe(true);
    expect(tagNamesVersion('storefront@1.4.0', '1.4.0')).toBe(true);
    expect(tagNamesVersion('1.4.0', '1.4.0')).toBe(true);
    expect(tagNamesVersion('v11.4.0', '1.4.0')).toBe(false);
    expect(tagNamesVersion('v1.4.0', '1.4.1')).toBe(false);
  });

  it('finds the published tag that supersedes a release pull request', () => {
    expect(supersedingTag('chore(main): release 1.4.0', ['v1.3.0', 'v1.4.0'])).toBe('v1.4.0');
    expect(supersedingTag('chore(main): release 1.5.0', ['v1.3.0', 'v1.4.0'])).toBeNull();
  });

  it('recognises the version in every usual tag form (property)', () => {
    fc.assert(
      fc.property(version, fc.constantFrom('', 'v', 'storefront-v', 'storefront@', 'release/'), (value, prefix) => {
        expect(supersedingTag(`chore(main): release ${value}`, [`${prefix}${value}`])).toBe(`${prefix}${value}`);
      }),
    );
  });
});
