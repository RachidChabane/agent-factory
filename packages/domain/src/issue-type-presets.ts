import { typeLabel, type CommitRule, type IssueTypeDefinition, type ProofStrategy } from './issue-types.ts';
import type { CommitKind } from './model.ts';

function commit(type: CommitKind, scope: string | null = null): CommitRule {
  return { type, scope, whenChanged: [] };
}

function preset(
  id: string,
  proof: ProofStrategy,
  checks: string,
  rule: CommitRule,
  extra: Partial<Pick<IssueTypeDefinition, 'evidence' | 'review' | 'paths'>> = {},
): IssueTypeDefinition {
  return {
    id,
    label: typeLabel(id),
    proof,
    checks,
    commit: rule,
    evidence: extra.evidence ?? ['acceptance-tests', 'diff-stat'],
    review: extra.review ?? [],
    paths: extra.paths ?? [],
  };
}

const NO_CHECK = 'none: the existing tests and the gate steps are the proof';

/** The typology `init` starts from; a project keeps, edits or removes any of these types. */
export const DEFAULT_ISSUE_TYPES: readonly IssueTypeDefinition[] = [
  preset('feature', 'fails-on-base', "unit or integration tests in the repository's existing test layout and framework", commit('feat')),
  preset('fix', 'fails-on-base', 'a test that reproduces the defect', commit('fix')),
  preset(
    'ui',
    'fails-on-base',
    'an end-to-end journey (for example Playwright) asserting what the criterion says is visible or possible, capturing the screenshots the expected proof names',
    commit('feat'),
    { evidence: ['acceptance-tests', 'screenshots', 'diff-stat'] },
  ),
  preset('api', 'fails-on-base', 'unit or integration tests of the observable behaviour of the API', commit('feat')),
  preset('security', 'fails-on-base', 'a test that reproduces the attack: it succeeds on the base and is refused on the branch', commit('fix'), {
    review: ['security'],
  }),
  preset(
    'infra',
    'fails-on-base-when-expressible',
    'a test that renders or parses the configuration and asserts on it (a template render, a schema validation, a workflow linter or a small parser), never on prose',
    commit('ci'),
    { paths: ['.github/**', 'infrastructure/**', 'deploy/**', '**/Dockerfile*', 'Dockerfile*'] },
  ),
  preset('data', 'fails-on-base', 'a migration test on a copy of the database asserting the expected schema or counts', commit('feat'), {
    paths: ['migrations/**', '**/migrations/**'],
  }),
  preset('dependencies', 'none', NO_CHECK, commit('build', 'deps'), {
    paths: ['package.json', '**/package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'pyproject.toml', 'uv.lock', 'poetry.lock', 'go.mod', 'go.sum', 'Cargo.toml', 'Cargo.lock', 'pom.xml', '**/build.gradle*'],
  }),
  preset('docs', 'none', NO_CHECK, commit('docs'), { paths: ['docs/**', '**/*.md'] }),
  preset('refactor', 'none', 'the existing tests, unchanged: they pass before and after with the same results', commit('refactor')),
  preset('release', 'none', NO_CHECK, commit('chore')),
  preset(
    'prompt',
    'base-score',
    "evaluation cases in the repository's evaluation format, one per criterion, with the rubric the score is computed from",
    commit('feat'),
    { evidence: ['acceptance-tests', 'score', 'diff-stat'] },
  ),
];
