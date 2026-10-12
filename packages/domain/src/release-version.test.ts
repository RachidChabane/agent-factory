import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareVersions, releaseVersionOf, supersedingTag, tagComponent, tagNamesVersion, titleComponent } from './release-version.ts';

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

  it('takes a release pull request as superseded once a newer version of its component is published', () => {
    expect(supersedingTag('chore(main): release 1.8.0', ['v1.7.0', 'v1.9.0', 'v1.10.0'])).toBe('v1.10.0');
    expect(supersedingTag('chore(main): release 1.11.0', ['v1.9.0', 'v1.10.0'])).toBeNull();
    expect(supersedingTag('chore(main): release app 1.3.0', ['api-v2.0.0', 'app-v1.2.0'])).toBeNull();
    expect(supersedingTag('chore(main): release app 1.3.0', ['api-v2.0.0', 'app-v1.4.0'])).toBe('app-v1.4.0');
    expect(supersedingTag('chore(main): release 2.0.0-rc.1', ['v2.0.0'])).toBe('v2.0.0');
    expect(supersedingTag('chore(main): release 2.0.0', ['v2.0.0-rc.1'])).toBeNull();
  });

  it('names the component of a tag and of a release title', () => {
    expect(tagComponent('app-v1.3.0', '1.3.0')).toBe('app');
    expect(tagComponent('v1.3.0', '1.3.0')).toBe('');
    expect(tagComponent('storefront@1.3.0', '1.3.0')).toBe('storefront');
    expect(titleComponent('chore(main): release app 1.3.0', '1.3.0')).toBe('app');
    expect(titleComponent('chore(main): release 1.3.0', '1.3.0')).toBe('');
    expect(titleComponent('chore: release v1.3.0', '1.3.0')).toBe('');
    expect(titleComponent('chore(main): release dev 1.3.0', '1.3.0')).toBe('dev');
  });

  it('orders versions as semver does', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
    expect(compareVersions('1.0.0-alpha.beta', '1.0.0-beta')).toBe(-1);
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.11')).toBe(-1);
    expect(compareVersions('1.0.0-rc.1', '1.0.0-beta.11')).toBe(1);
    expect(compareVersions('1.2.3+build.5', '1.2.3')).toBe(0);
  });

  it('orders versions consistently whatever the pair (property)', () => {
    const preRelease = fc.option(fc.constantFrom('alpha', 'alpha.1', 'beta', 'beta.2', 'rc.1'), { nil: undefined });
    const full = fc.tuple(version, preRelease).map(([core, pre]) => (pre === undefined ? core : `${core}-${pre}`));
    fc.assert(
      fc.property(full, full, (left, right) => {
        expect(compareVersions(left, right)).toBe(-compareVersions(right, left));
        expect(compareVersions(left, left)).toBe(0);
      }),
    );
  });
});
