import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ISSUE_TYPES, IssueTypology, type IssueSpec, type IssueTypeDefinition } from '@agent-factory/domain';
import { DEFAULT_PROJECT_CONVENTIONS, type ProjectConventions } from '../conventions/project-conventions.ts';
import { commitKindFor, conventionalSubject, implementationCommitMessage, pullRequestTitle } from './conventional-commit.ts';

const MINIMUM_SUBJECT_LENGTH = 3;
/** What a conventional-commit linter accepts as a subject: no leading capital, no trailing period. */
const LINTED_SUBJECT = /^(?![A-Z])\S.*[^.\s]$/;

function withCommit(id: string, commit: Partial<IssueTypeDefinition['commit']>): IssueTypeDefinition {
  const type = DEFAULT_ISSUE_TYPES.find((candidate) => candidate.id === id);
  if (type === undefined) throw new Error(`no preset ${id}`);
  return { ...type, commit: { ...type.commit, ...commit } };
}

const CONVENTIONS: ProjectConventions = {
  ...DEFAULT_PROJECT_CONVENTIONS,
  defaultScope: 'main',
  typology: new IssueTypology(
    DEFAULT_ISSUE_TYPES.map((type) => {
      if (type.id === 'infra') return withCommit('infra', { scope: 'infra', whenChanged: [{ paths: ['infrastructure/**', 'environments/**'], type: 'feat' }] });
      if (type.id === 'ui') return withCommit('ui', { scope: 'app' });
      return type;
    }),
  ),
};

const SPEC: IssueSpec = {
  number: 3,
  title: 'Serve shop.example.com from the storefront in production.',
  type: 'infra',
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

describe('conventional pull request titles', () => {
  it('lowercases the first letter, drops the trailing period and scopes by issue type', () => {
    expect(pullRequestTitle(SPEC, CONVENTIONS)).toBe('ci(infra): serve shop.example.com from the storefront in production');
    expect(implementationCommitMessage(SPEC, CONVENTIONS)).toBe('ci(infra): serve shop.example.com from the storefront in production\n\nRefs #3');
    expect(pullRequestTitle({ ...SPEC, type: 'refactor', title: 'Tidy the store' }, CONVENTIONS)).toBe('refactor(main): tidy the store');
  });

  it('takes the commit type from a kind label before the issue type', () => {
    expect(pullRequestTitle({ ...SPEC, type: 'ui', title: 'Speed up the board', commitKind: 'perf' }, CONVENTIONS)).toBe('perf(app): speed up the board');
  });

  it('defaults the commit type to the one of the issue type', () => {
    const types = ['feature', 'fix', 'ui', 'api', 'security', 'data', 'dependencies', 'docs', 'release', 'refactor', 'prompt'];
    expect(types.map((type) => commitKindFor({ ...SPEC, type }, CONVENTIONS))).toEqual([
      'feat',
      'fix',
      'feat',
      'feat',
      'fix',
      'feat',
      'build',
      'docs',
      'chore',
      'refactor',
      'feat',
    ]);
    expect(pullRequestTitle({ ...SPEC, type: 'dependencies', title: 'Bump vitest' }, CONVENTIONS)).toBe('build(deps): bump vitest');
  });

  it('takes the commit type of the first path rule the change touches', () => {
    expect(commitKindFor(SPEC, CONVENTIONS, ['.github/workflows/ci.yml'])).toBe('ci');
    expect(commitKindFor(SPEC, CONVENTIONS, ['.github/workflows/ci.yml', 'infrastructure/charts/app/values.yaml'])).toBe('feat');
    expect(commitKindFor(SPEC, CONVENTIONS, ['environments/prod/app.yaml'])).toBe('feat');
    expect(commitKindFor(SPEC, DEFAULT_PROJECT_CONVENTIONS, ['environments/prod/app.yaml'])).toBe('ci');
  });

  it('produces a subject a conventional-commit linter accepts for every title of three characters or more', () => {
    fc.assert(
      fc.property(title, (candidate) => {
        fc.pre(conventionalSubject(candidate).length >= MINIMUM_SUBJECT_LENGTH);
        expect(conventionalSubject(candidate)).toMatch(LINTED_SUBJECT);
      }),
    );
  });
});
