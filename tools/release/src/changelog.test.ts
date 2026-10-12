import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertVersion, InvalidVersionError, parseCommit, prependSection, renderSection, repositoryPage, sectionOf } from './changelog.ts';

const REPOSITORY = 'https://github.com/example-org/agent-factory';

describe('the changelog of a release', () => {
  it('reads a Conventional Commit header, its scope and whether it breaks compatibility', () => {
    assert.deepEqual(parseCommit('a'.repeat(40), 'feat(cockpit): show the read time of every value', ''), {
      sha: 'a'.repeat(40),
      type: 'feat',
      scope: 'cockpit',
      description: 'show the read time of every value',
      breaking: false,
    });
    assert.equal(parseCommit('b', 'fix!: refuse a cap of zero', '')?.breaking, true);
    assert.equal(parseCommit('c', 'feat: rename the home variable', 'BREAKING CHANGE: AGENT_FACTORY_HOME replaces FACTORY_HOME')?.breaking, true);
    assert.equal(parseCommit('d', 'Merge branch main', ''), null);
    assert.equal(parseCommit('e', 'chore(release): v0.1.0', ''), null);
  });

  it('writes the breaking changes first, then features, fixes and the rest, each linked to its commit', () => {
    const commits = [
      parseCommit('1111111aaaa', 'docs: describe the cycle', ''),
      parseCommit('2222222bbbb', 'fix(server): keep the base of a released worktree', ''),
      parseCommit('3333333cccc', 'feat!: declare stacks', ''),
      parseCommit('4444444dddd', 'feat(cockpit): add the board', ''),
    ].filter((commit) => commit !== null);
    assert.equal(
      renderSection({ version: '0.1.0', date: '2026-10-12', commits, repositoryUrl: REPOSITORY }),
      [
        '## 0.1.0 (2026-10-12)',
        '### Breaking changes\n\n- declare stacks ([3333333](https://github.com/example-org/agent-factory/commit/3333333cccc))',
        '### Features\n\n- declare stacks ([3333333](https://github.com/example-org/agent-factory/commit/3333333cccc))\n- **cockpit:** add the board ([4444444](https://github.com/example-org/agent-factory/commit/4444444dddd))',
        '### Fixes\n\n- **server:** keep the base of a released worktree ([2222222](https://github.com/example-org/agent-factory/commit/2222222bbbb))',
        '### Other changes\n\n- describe the cycle ([1111111](https://github.com/example-org/agent-factory/commit/1111111aaaa))',
      ].join('\n\n'),
    );
  });

  it('puts a new section above the earlier ones and reads any section back as release notes', () => {
    const first = prependSection(null, '## 0.1.0 (2026-10-12)\n\n### Features\n\n- the first');
    const second = prependSection(first, '## 0.2.0 (2026-11-02)\n\n### Fixes\n\n- the second');
    assert.equal(second, '# Changelog\n\n## 0.2.0 (2026-11-02)\n\n### Fixes\n\n- the second\n\n## 0.1.0 (2026-10-12)\n\n### Features\n\n- the first\n');
    assert.equal(sectionOf(second, '0.1.0'), '### Features\n\n- the first');
    assert.equal(sectionOf(second, '0.2.0'), '### Fixes\n\n- the second');
    assert.equal(sectionOf(second, '0.3.0'), null);
  });

  it('links commits only for a GitHub remote, and accepts only semantic versions', () => {
    assert.equal(repositoryPage('git@github.com:example-org/agent-factory.git'), REPOSITORY);
    assert.equal(repositoryPage('https://github.com/example-org/agent-factory'), REPOSITORY);
    assert.equal(repositoryPage('/srv/forge/agent-factory.git'), null);
    assert.equal(assertVersion('1.4.0-rc.1'), '1.4.0-rc.1');
    assert.throws(() => assertVersion('v1.4'), InvalidVersionError);
  });
});
