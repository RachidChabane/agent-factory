import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { IssueSpec } from '@agent-factory/domain';
import {
  CONVENTIONAL_SUBJECT_PATTERN,
  commitKindFor,
  conventionalSubject,
  globPattern,
  implementationCommitMessage,
  pullRequestTitle,
} from './conventional-commit.ts';
import type { ConventionalScopes } from './pipeline-settings.ts';

const MINIMUM_SUBJECT_LENGTH = 3;
const SCOPES: ConventionalScopes = { byType: { 'infra-ci': 'infra', ui: 'app' }, defaultScope: 'main' };
const SPEC: IssueSpec = {
  number: 3,
  title: 'Serve shop.example.com from the storefront in production.',
  type: 'infra-ci',
  need: 'n',
  acceptanceCriteria: ['a'],
  outOfScope: ['o'],
  expectedProof: 'p',
  dependsOn: [],
  commitKind: null,
};

const word = fc.stringMatching(/^[A-Za-z][A-Za-z0-9.-]{0,9}$/);
const title = fc
  .tuple(fc.stringMatching(/^[A-Za-z]$/), fc.array(word, { minLength: 1, maxLength: 6 }), fc.constantFrom('', '.', '..', ' .', '. '))
  .map(([first, words, ending]) => `${first}${words.join(' ')}${ending}`);

describe('globPattern', () => {
  it('matches directories recursively and single segments', () => {
    expect(globPattern('infrastructure/**').test('infrastructure/charts/a.yaml')).toBe(true);
    expect(globPattern('environments/*.yaml').test('environments/prod.yaml')).toBe(true);
    expect(globPattern('environments/*.yaml').test('environments/prod/app.yaml')).toBe(false);
    expect(globPattern('infrastructure/**').test('infrastructure-docs/a.md')).toBe(false);
  });
});

describe('conventional pull request titles', () => {
  it('lowercases the first letter and drops the trailing period', () => {
    expect(pullRequestTitle(SPEC, SCOPES)).toBe('ci(infra): serve shop.example.com from the storefront in production');
    expect(implementationCommitMessage(SPEC, SCOPES)).toBe('ci(infra): serve shop.example.com from the storefront in production\n\nRefs #3');
    expect(pullRequestTitle({ ...SPEC, type: 'refactor', title: 'Tidy the store' }, SCOPES)).toBe('refactor(main): tidy the store');
  });

  it('takes the commit type from a kind label before the issue type', () => {
    expect(pullRequestTitle({ ...SPEC, type: 'ui', title: 'Speed up the board', commitKind: 'perf' }, SCOPES)).toBe('perf(app): speed up the board');
  });

  it('defaults the commit type by issue type', () => {
    const types: readonly IssueSpec['type'][] = ['ui', 'engine-api', 'skill-prompt', 'data', 'security', 'dependencies', 'doc', 'release', 'refactor'];
    expect(types.map((type) => commitKindFor({ ...SPEC, type }, SCOPES))).toEqual([
      'feat',
      'feat',
      'feat',
      'feat',
      'fix',
      'build',
      'docs',
      'chore',
      'refactor',
    ]);
    expect(pullRequestTitle({ ...SPEC, type: 'dependencies', title: 'Bump vitest' }, SCOPES)).toBe('build(deps): bump vitest');
  });

  it('makes an infra-ci change a feature only when it touches deployment configuration', () => {
    expect(commitKindFor(SPEC, SCOPES, ['.github/workflows/ci.yml'])).toBe('ci');
    expect(commitKindFor(SPEC, SCOPES, ['.github/workflows/ci.yml', 'infrastructure/charts/app/values.yaml'])).toBe('feat');
    expect(commitKindFor(SPEC, SCOPES, ['environments/prod/app.yaml'])).toBe('feat');
    expect(commitKindFor(SPEC, { ...SCOPES, deploymentPaths: ['deploy/**'] }, ['environments/prod/app.yaml'])).toBe('ci');
  });

  it('lets the configuration override the type of an issue type', () => {
    expect(commitKindFor({ ...SPEC, type: 'data' }, { ...SCOPES, kindByType: { data: 'chore' } })).toBe('chore');
  });

  it('produces a subject the pull request lint accepts for every title of three characters or more', () => {
    fc.assert(
      fc.property(title, (candidate) => {
        fc.pre(conventionalSubject(candidate).length >= MINIMUM_SUBJECT_LENGTH);
        expect(conventionalSubject(candidate)).toMatch(CONVENTIONAL_SUBJECT_PATTERN);
      }),
    );
  });
});
