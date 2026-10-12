import { describe, expect, it } from 'vitest';
import { HEAD_VISIBILITY_ATTEMPTS, HEAD_VISIBILITY_DELAY_MS } from './head-visibility.ts';
import { checksBlockingMerge, failingOnBase } from './merge-on-order.ts';
import { MergeRefusedError, PullRequestHeadMovedError, PullRequestNotFromFactoryError, PushedHeadNotVisibleError } from './pipeline-errors.ts';
import { ISSUE_NUMBER, PipelineScenario } from './testing/pipeline-scenario.ts';

async function scenarioWithOpenPullRequest(): Promise<{ scenario: PipelineScenario; head: string }> {
  const scenario = new PipelineScenario();
  const outcome = await scenario.pipeline().runIssue(ISSUE_NUMBER);
  if (outcome.kind !== 'pr-open') throw new Error(`expected an open pull request, got ${outcome.kind}`);
  return { scenario, head: outcome.pullRequest.headSha };
}

/** The forge keeps reporting the reviewed head for `staleReads` reads (forever when null) after the evidence removal was pushed. */
function showHeadAfterReads(scenario: PipelineScenario, staleReads: number | null, staleHead: string): void {
  const find = scenario.github.findOpenPullRequest.bind(scenario.github);
  let removalReads = 0;
  scenario.github.findOpenPullRequest = async (branch) => {
    const found = await find(branch);
    if (found === null || found.headSha === staleHead) return found;
    removalReads += 1;
    return staleReads === null || removalReads <= staleReads ? { ...found, headSha: staleHead } : found;
  };
}

describe('MergeOnOrder', () => {
  it('removes the evidence in a final commit, pushes, then squash-merges that head', async () => {
    const { scenario, head } = await scenarioWithOpenPullRequest();
    scenario.github.checkRuns = [{ name: 'ci', conclusion: 'success', url: 'https://ci.example/1', durationMs: null }];
    const worktree = scenario.worktree();

    const outcome = await scenario.mergeOnOrder().merge({ pullRequestNumber: 100, expectedHeadSha: head });

    const history = scenario.sourceControl.history(worktree);
    const finalCommit = history.at(-1);
    expect(finalCommit?.message).toBe('chore(evidence): remove proof of #42 before merge');
    expect([...(finalCommit?.snapshot.keys() ?? [])].some((path) => path.startsWith('.evidence/'))).toBe(false);
    expect(history.at(-2)?.sha).toBe(head);
    expect(scenario.github.merges).toEqual([{ number: 100, headSha: finalCommit?.sha }]);
    expect(outcome).toEqual({ issueNumber: ISSUE_NUMBER, pullRequestNumber: 100, mergeSha: `merge-of-${finalCommit?.sha ?? ''}` });
    expect((await scenario.states.path(ISSUE_NUMBER)).slice(-4)).toEqual(['pr-open', 'ci', 'ready-to-merge', 'merged']);
    expect(scenario.pool.released).toEqual([worktree]);
    expect((await scenario.journal()).worktree).toBeNull();
  });

  it('refuses when the head moved since the operator reviewed it', async () => {
    const { scenario } = await scenarioWithOpenPullRequest();
    await expect(scenario.mergeOnOrder().merge({ pullRequestNumber: 100, expectedHeadSha: 'deadbeef' })).rejects.toBeInstanceOf(
      MergeRefusedError,
    );
    expect(scenario.github.merges).toEqual([]);
  });

  it('refuses while checks fail or still run', async () => {
    const { scenario, head } = await scenarioWithOpenPullRequest();
    scenario.github.checkRuns = [{ name: 'ci', conclusion: 'failure', url: 'https://ci.example/1', durationMs: null }];
    await expect(scenario.mergeOnOrder().merge({ pullRequestNumber: 100, expectedHeadSha: head })).rejects.toThrow('checks failed: ci (failure)');
    scenario.github.checkRuns = [{ name: 'ci', conclusion: 'pending', url: 'https://ci.example/1', durationMs: null }];
    await expect(scenario.mergeOnOrder().merge({ pullRequestNumber: 100, expectedHeadSha: head })).rejects.toThrow('checks still running');
    expect((await scenario.journal()).state).toBe('pr-open');
  });

  it('merges despite a check that fails the same way on the base branch, which the change did not cause', async () => {
    const { scenario, head } = await scenarioWithOpenPullRequest();
    scenario.github.checkRuns = [
      { name: 'lint-pull-request-title', conclusion: 'failure', url: 'https://ci.example/2', durationMs: null },
      { name: 'unit', conclusion: 'success', url: 'https://ci.example/3', durationMs: null },
    ];
    scenario.github.baseCheckRuns = [{ name: 'lint-pull-request-title', conclusion: 'failure', url: 'https://ci.example/1', durationMs: null }];
    await scenario.mergeOnOrder().merge({ pullRequestNumber: 100, expectedHeadSha: head });
    expect(scenario.github.merges).toHaveLength(1);
  });

  it('tells which failing checks the change caused and which already failed on the base', () => {
    const checks = [
      { name: 'lint', conclusion: 'failure' as const, url: '', durationMs: null },
      { name: 'unit', conclusion: 'failure' as const, url: '', durationMs: null },
    ];
    const base = [
      { name: 'lint', conclusion: 'failure' as const, url: '', durationMs: null },
      { name: 'unit', conclusion: 'success' as const, url: '', durationMs: null },
    ];
    expect(failingOnBase(checks, base)).toEqual(new Set(['lint']));
    expect(checksBlockingMerge(checks, base)).toBe('checks failed: unit (failure)');
    expect(checksBlockingMerge(checks, [])).toBe('checks failed: lint (failure), unit (failure)');
  });

  it('resumes a merge interrupted after the evidence removal was pushed', async () => {
    const { scenario, head } = await scenarioWithOpenPullRequest();
    const worktree = scenario.worktree();
    const squash = scenario.github.squashMerge.bind(scenario.github);
    let interrupted = false;
    scenario.github.squashMerge = (number, sha) => {
      if (!interrupted) {
        interrupted = true;
        return Promise.reject(new Error('required checks are pending'));
      }
      return squash(number, sha);
    };
    await expect(scenario.mergeOnOrder().merge({ pullRequestNumber: 100, expectedHeadSha: head })).rejects.toThrow('required checks');
    expect((await scenario.journal()).state).toBe('ready-to-merge');
    const outcome = await scenario.mergeOnOrder().merge({ pullRequestNumber: 100, expectedHeadSha: head });
    expect(outcome.mergeSha.startsWith('merge-of-')).toBe(true);
    const removals = scenario.sourceControl.history(worktree).filter((commit) => commit.message.includes('remove proof'));
    expect(removals).toHaveLength(1);
  });

  it('waits for the forge to report the pushed head before merging', async () => {
    const { scenario, head } = await scenarioWithOpenPullRequest();
    showHeadAfterReads(scenario, 2, head);

    await scenario.mergeOnOrder().merge({ pullRequestNumber: 100, expectedHeadSha: head });

    expect(scenario.github.merges).toHaveLength(1);
    expect(scenario.sleeper.naps).toEqual([HEAD_VISIBILITY_DELAY_MS, HEAD_VISIBILITY_DELAY_MS]);
  });

  it('fails retryably without merging when the forge never reports the pushed head', async () => {
    const { scenario, head } = await scenarioWithOpenPullRequest();
    showHeadAfterReads(scenario, null, head);

    await expect(scenario.mergeOnOrder().merge({ pullRequestNumber: 100, expectedHeadSha: head })).rejects.toBeInstanceOf(PushedHeadNotVisibleError);
    await expect(scenario.mergeOnOrder().merge({ pullRequestNumber: 100, expectedHeadSha: head })).rejects.toThrow('is not visible yet');

    expect(scenario.github.merges).toEqual([]);
    expect(scenario.sleeper.naps).toHaveLength(2 * (HEAD_VISIBILITY_ATTEMPTS - 1));
    expect((await scenario.journal()).state).toBe('ready-to-merge');
  });

  it('merges a re-sent order after a visibility failure without removing the evidence again', async () => {
    const { scenario, head } = await scenarioWithOpenPullRequest();
    const worktree = scenario.worktree();
    const find = scenario.github.findOpenPullRequest.bind(scenario.github);
    let hidden = true;
    scenario.github.findOpenPullRequest = async (branch) => {
      const found = await find(branch);
      return hidden && found !== null ? { ...found, headSha: head } : found;
    };
    await expect(scenario.mergeOnOrder().merge({ pullRequestNumber: 100, expectedHeadSha: head })).rejects.toBeInstanceOf(PushedHeadNotVisibleError);
    hidden = false;

    const outcome = await scenario.mergeOnOrder().merge({ pullRequestNumber: 100, expectedHeadSha: head });

    expect(outcome.mergeSha.startsWith('merge-of-')).toBe(true);
    expect(scenario.sourceControl.history(worktree).filter((commit) => commit.message.includes('remove proof'))).toHaveLength(1);
    expect(scenario.github.merges).toHaveLength(1);
  });

  it('retries the merge while the forge still reports the reviewed head', async () => {
    const { scenario, head } = await scenarioWithOpenPullRequest();
    const squash = scenario.github.squashMerge.bind(scenario.github);
    let staleReads = 2;
    scenario.github.squashMerge = (number, sha) => {
      if (staleReads > 0) {
        staleReads -= 1;
        return Promise.reject(new PullRequestHeadMovedError(number, sha, head));
      }
      return squash(number, sha);
    };

    await scenario.mergeOnOrder().merge({ pullRequestNumber: 100, expectedHeadSha: head });

    expect(scenario.github.merges).toHaveLength(1);
    expect(scenario.sleeper.naps).toEqual([HEAD_VISIBILITY_DELAY_MS, HEAD_VISIBILITY_DELAY_MS]);
  });

  it('does not retry a merge whose head moved to an unrelated commit', async () => {
    const { scenario, head } = await scenarioWithOpenPullRequest();
    scenario.github.squashMerge = (number, sha) => Promise.reject(new PullRequestHeadMovedError(number, sha, 'someone-elses-commit'));

    await expect(scenario.mergeOnOrder().merge({ pullRequestNumber: 100, expectedHeadSha: head })).rejects.toBeInstanceOf(PullRequestHeadMovedError);
    expect(scenario.sleeper.naps).toEqual([]);
  });

  it('refuses a pull request the factory did not open', async () => {
    const { scenario, head } = await scenarioWithOpenPullRequest();
    await expect(scenario.mergeOnOrder().merge({ pullRequestNumber: 999, expectedHeadSha: head })).rejects.toBeInstanceOf(
      PullRequestNotFromFactoryError,
    );
  });
});
