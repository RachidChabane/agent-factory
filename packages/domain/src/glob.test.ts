import { describe, expect, it } from 'vitest';
import { globPattern, matchesAnyGlob, touchesAny } from './glob.ts';

describe('path globs', () => {
  it('keeps a single star inside one segment and lets a double star cross segments', () => {
    expect(globPattern('src/*.ts').test('src/cart.ts')).toBe(true);
    expect(globPattern('src/*.ts').test('src/cart/total.ts')).toBe(false);
    expect(globPattern('infrastructure/**').test('infrastructure/prod/values.yaml')).toBe(true);
  });

  it('lets a leading double star match files at the root', () => {
    expect(globPattern('**/*.md').test('README.md')).toBe(true);
    expect(globPattern('**/*.md').test('docs/guide/setup.md')).toBe(true);
    expect(globPattern('**/Dockerfile*').test('Dockerfile')).toBe(true);
  });

  it('escapes regular-expression characters of a path', () => {
    expect(globPattern('package.json').test('packageXjson')).toBe(false);
    expect(globPattern('a+b/(x).txt').test('a+b/(x).txt')).toBe(true);
  });

  it('tells whether any path matches any glob', () => {
    expect(matchesAnyGlob('migrations/001.sql', ['docs/**', 'migrations/**'])).toBe(true);
    expect(touchesAny(['src/a.ts', 'infrastructure/x.yaml'], ['infrastructure/**'])).toBe(true);
    expect(touchesAny(['src/a.ts'], ['infrastructure/**'])).toBe(false);
  });
});
