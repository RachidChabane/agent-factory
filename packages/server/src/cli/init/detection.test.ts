import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { IDENTIFIER } from '../../config/schema/common.ts';
import { detectAutomations, detectReleaseModel } from './delivery-detection.ts';
import { localRepositorySlug, projectIdOf } from './project-draft.ts';
import { githubSlugOf, type RepositoryFiles } from './repository-inspection.ts';
import { detectStack } from './stack-detectors.ts';

function files(entries: Readonly<Record<string, string>>): RepositoryFiles {
  return { has: (path) => path in entries, text: (path) => Promise.resolve(entries[path] ?? null) };
}

describe('the GitHub repository an origin points at', () => {
  it.each([
    ['git@github.com:example-org/storefront.git', 'example-org/storefront'],
    ['https://github.com/example-org/storefront', 'example-org/storefront'],
    ['https://github.com/example-org/storefront.git', 'example-org/storefront'],
    ['https://token@github.com/example-org/storefront.git', 'example-org/storefront'],
    ['ssh://git@github.com/example-org/storefront.git', 'example-org/storefront'],
    ['https://github.com/example-org/my.dotted.repo.git', 'example-org/my.dotted.repo'],
  ])('reads %s as %s', (url, slug) => {
    expect(githubSlugOf(url)).toBe(slug);
  });

  it.each(['https://gitlab.example.com/example-org/storefront.git', '/srv/git/storefront.git', 'git@github.example.com:example-org/storefront.git'])('finds no GitHub repository in %s', (url) => {
    expect(githubSlugOf(url)).toBeNull();
  });
});

describe('the id and slug init derives from a repository name', () => {
  it('turns any directory name into a valid project id', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 40 }), (name) => {
        expect(projectIdOf(name)).toMatch(IDENTIFIER);
      }),
    );
  });

  it('keeps a name that is already an id', () => {
    expect(projectIdOf('storefront')).toBe('storefront');
    expect(projectIdOf('Billing_API')).toBe('billing-api');
    expect(projectIdOf('2024-report')).toBe('project-2024-report');
  });

  it('shows a repository without a GitHub origin under the local owner', () => {
    expect(localRepositorySlug('billing api')).toBe('local/billing-api');
  });
});

describe('the build init recognises', () => {
  it('prefers the repository scripts in script/ over everything else', async () => {
    const stack = await detectStack(files({ 'script/test': '', 'script/lint': '', 'script/setup': '', 'package.json': '{"scripts":{"test":"vitest"}}' }));
    expect(stack).toMatchObject({
      setup: [{ name: 'install', run: 'script/setup' }],
      beforeAcceptance: [{ name: 'lint', run: 'script/lint' }],
      afterAcceptance: [{ name: 'test', run: 'script/test' }],
    });
  });

  it('runs the mise tasks of a repository that declares a test task', async () => {
    const stack = await detectStack(files({ 'mise.toml': '[tools]\nnode = "24"\n\n[tasks.lint]\nrun = "eslint ."\n\n[tasks."test"]\nrun = "vitest run"\n' }));
    expect(stack).toMatchObject({ beforeAcceptance: [{ run: 'mise run lint' }], afterAcceptance: [{ run: 'mise run test' }] });
  });

  it('runs the Makefile targets when there is a test target', async () => {
    const stack = await detectStack(files({ Makefile: 'deps:\n\tnpm ci\nlint:\n\tnpm run lint\ntest: deps\n\tnpm test\nVERSION := 1\n' }));
    expect(stack).toMatchObject({ setup: [{ run: 'make deps' }], beforeAcceptance: [{ run: 'make lint' }], afterAcceptance: [{ run: 'make test' }] });
  });

  it('installs a Node.js package with its package manager and runs its own scripts', async () => {
    const manifest = JSON.stringify({ packageManager: 'pnpm@10.32.1', scripts: { lint: 'eslint .', typecheck: 'tsc --noEmit', test: 'vitest run' } });
    const stack = await detectStack(files({ 'package.json': manifest, 'pnpm-lock.yaml': '' }));
    expect(stack).toEqual({
      stack: 'Node.js with pnpm',
      setup: [{ name: 'install', run: 'pnpm install --frozen-lockfile', network: 'downloads the locked dependencies from the package registry' }],
      beforeAcceptance: [
        { name: 'lint', run: 'pnpm run lint' },
        { name: 'typecheck', run: 'pnpm run typecheck' },
      ],
      afterAcceptance: [{ name: 'test', run: 'pnpm run test' }],
    });
  });

  it('tells yarn 1 from later versions, and skips the placeholder test script npm writes', async () => {
    const classic = await detectStack(files({ 'package.json': JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }), 'yarn.lock': '' }));
    expect(classic).toMatchObject({ setup: [{ run: 'yarn install --frozen-lockfile' }], afterAcceptance: [] });
    const berry = await detectStack(files({ 'package.json': '{}', 'yarn.lock': '', '.yarnrc.yml': '' }));
    expect(berry).toMatchObject({ setup: [{ run: 'yarn install --immutable' }] });
    const npm = await detectStack(files({ 'package.json': '{}', 'package-lock.json': '' }));
    expect(npm).toMatchObject({ setup: [{ run: 'npm ci' }] });
  });

  it('runs a Python project through uv, with the linters its pyproject configures', async () => {
    const stack = await detectStack(files({ 'pyproject.toml': '[project]\nname = "ledger"\n\n[tool.ruff]\nline-length = 100\n', 'uv.lock': '' }));
    expect(stack).toMatchObject({ setup: [{ run: 'uv sync --frozen' }], beforeAcceptance: [{ run: 'uv run ruff check .' }], afterAcceptance: [{ run: 'uv run pytest' }] });
  });

  it.each([
    [{ 'go.mod': 'module example.com/ledger\n' }, 'go test ./...'],
    [{ 'Cargo.toml': '[package]\n', 'Cargo.lock': '' }, 'cargo test --locked --offline'],
    [{ 'pom.xml': '<project/>', mvnw: '' }, './mvnw -B -o test'],
    [{ 'build.gradle.kts': '', gradlew: '' }, './gradlew --no-daemon --offline test'],
  ])('recognises %o and tests it with %s', async (entries, test) => {
    expect((await detectStack(files(entries)))?.afterAcceptance).toEqual([{ name: 'test', run: test }]);
  });

  it('recognises nothing in a repository without a build', async () => {
    expect(await detectStack(files({ 'README.md': '# notes\n' }))).toBeNull();
  });
});

describe('the delivery init recognises', () => {
  it('reads the release model from release-please files, then from version tags', () => {
    expect(detectReleaseModel(files({ 'release-please-config.json': '{}' }), [])).toEqual({ kind: 'release-please' });
    expect(detectReleaseModel(files({}), ['v1.4.0', 'nightly'])).toEqual({ kind: 'tags' });
    expect(detectReleaseModel(files({}), ['nightly'])).toEqual({ kind: 'none' });
  });

  it('names the other automations of the repository so their changes are not audited', () => {
    expect(detectAutomations(files({ '.github/dependabot.yml': '', 'renovate.json': '', '.release-please-manifest.json': '' }))).toEqual([
      { name: 'Dependabot', authors: ['dependabot[bot]'] },
      { name: 'Renovate', authors: ['renovate[bot]'] },
      { name: 'Release Please', branches: ['release-please--*'] },
    ]);
  });
});
