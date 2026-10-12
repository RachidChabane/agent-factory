import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { parseAgentFactoryConfig, projectOf, type ProjectConfig } from '../../config/agent-factory-config.ts';
import { worktreesOutcome } from './validation-checks.ts';

const USER_HOME = '/Users/operator';
const HOME = `${USER_HOME}/.agent-factory`;

function projectWith(settings: Record<string, unknown>): ProjectConfig {
  const text = stringify({
    version: 1,
    projects: [{ id: 'ledger', name: 'Ledger', forge: { kind: 'local', repository: 'example-org/ledger' }, commitIdentity: { name: 'Bot', email: 'bot@example.invalid' }, ...settings }],
  });
  return projectOf(parseAgentFactoryConfig(text, HOME, `${HOME}/config.yaml`, USER_HOME), 'ledger');
}

describe('the worktrees notice of validate', () => {
  it('says how many pull requests the default pool lets await review beside the issues that run, and when new issues stop', () => {
    expect(worktreesOutcome(projectWith({}))).toEqual({
      ok: true,
      detail:
        'a pool of 5 holds 1 issue at once beside up to 4 pull requests awaiting review (2 beside 3 at the ceiling); no new issue starts once pull requests and escalated issues hold all 5',
    });
  });

  it('counts beside the configured concurrency and its ceiling', () => {
    const outcome = worktreesOutcome(projectWith({ worktrees: { size: 6 }, concurrency: { issues: 2, ceiling: 4 } }));
    expect(outcome).toEqual({
      ok: true,
      detail:
        'a pool of 6 holds 2 issues at once beside up to 4 pull requests awaiting review (2 beside 4 at the ceiling); no new issue starts once pull requests and escalated issues hold all 6',
    });
  });

  it('warns when the pool equals the ceiling, because no pull request can wait beside a run at the ceiling', () => {
    const outcome = worktreesOutcome(projectWith({ worktrees: { size: 3 } }));
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toBe(
      'a pool of 3 equals the concurrency ceiling of 3: running at the ceiling leaves no worktree for a pull request awaiting review, and new issues stop with the first one; raise worktrees.size above the ceiling',
    );
  });

  it('warns exactly when the pool leaves no room beside the ceiling', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), fc.integer({ min: 1, max: 8 }), (size, ceiling) => {
        fc.pre(ceiling <= size);
        return worktreesOutcome(projectWith({ worktrees: { size }, concurrency: { issues: 1, ceiling } })).ok === size > ceiling;
      }),
      { numRuns: 40 },
    );
  });
});
