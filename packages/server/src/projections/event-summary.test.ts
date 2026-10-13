import { describe, expect, it } from 'vitest';
import { summarizeEvent } from './event-summary.ts';

describe('the one-line summary of an event', () => {
  it('names the issues that wait for a worktree, and says when a worktree is free again', () => {
    expect(summarizeEvent({ type: 'scheduler.worktrees-full', subject: 'daemon', payload: { poolSize: 3, waiting: [14, 15], holders: [] } })).toBe(
      '#14, #15 wait: every worktree of the pool is held',
    );
    expect(summarizeEvent({ type: 'scheduler.worktrees-free', subject: 'daemon', payload: {} })).toBe('a worktree is free again');
  });

  it('names the tool the films wait for, and says when every tool passes its check', () => {
    expect(summarizeEvent({ type: 'films.tools-unavailable', subject: 'films', payload: { tool: 'vault', status: 'unauthenticated' } })).toBe('the films wait for vault: unauthenticated');
    expect(summarizeEvent({ type: 'films.tools-unavailable', subject: 'films', payload: {} })).toBe('the films wait for a tool: its check fails');
    expect(summarizeEvent({ type: 'films.tools-available', subject: 'films', payload: {} })).toBe('every tool the films need passes its check');
  });

  it('says who made a gesture of the operator: the delegate when the event names one', () => {
    expect(summarizeEvent({ type: 'issue.spec-validated', subject: 'issue/12', payload: { operator: 'alex' } })).toBe('the spec of issue #12 was validated by alex');
    expect(summarizeEvent({ type: 'issue.spec-validated', subject: 'issue/12', payload: { operator: 'alex', actor: 'orchestrator', reason: 'the spec follows the template' } })).toBe(
      'the spec of issue #12 was validated by orchestrator',
    );
    expect(summarizeEvent({ type: 'pipeline.decision-answered', subject: 'issue/12', payload: { runId: 'r1', answer: 'yes' } })).toBe('the operator answered the question of issue #12');
    expect(summarizeEvent({ type: 'pipeline.decision-answered', subject: 'issue/12', payload: { runId: 'r1', answer: 'yes', actor: 'orchestrator', reason: 'the spec answers it' } })).toBe(
      'orchestrator answered the question of issue #12',
    );
    expect(summarizeEvent({ type: 'pipeline.pull-request-merged', subject: 'issue/12', payload: { mergeSha: 'abc' } })).toBe('the pull request of issue #12 was merged');
    expect(summarizeEvent({ type: 'pipeline.pull-request-merged', subject: 'issue/12', payload: { mergeSha: 'abc', actor: 'orchestrator', reason: 'documentation only' } })).toBe(
      'the pull request of issue #12 was merged by orchestrator',
    );
  });

  it('describes a gesture of the delegate by what it did, and a ready notice by its head', () => {
    const decision = { actor: 'orchestrator', gesture: 'merge', target: { kind: 'pull-request', number: 31 }, issueNumber: 12, reason: 'documentation only', rule: 'autonomy.merge for docs' };
    expect(summarizeEvent({ type: 'autonomy.gesture-made', subject: 'issue/12', payload: decision })).toBe('orchestrator merged pull request #31');
    expect(summarizeEvent({ type: 'autonomy.gesture-made', subject: 'issue/12', payload: { actor: 'orchestrator' } })).toBe('the delegate made a gesture of the operator');
    expect(summarizeEvent({ type: 'pipeline.pull-request-ready-announced', subject: 'issue/12', payload: { pullRequestNumber: 31, headSha: 'abcdef0123456789', links: [], failures: [] } })).toBe(
      'the pull request of issue #12 was announced as ready for head abcdef0',
    );
  });

  it('describes an event of an unknown kind by its type and subject', () => {
    expect(summarizeEvent({ type: 'something.else', subject: 'issue/4', payload: null })).toBe('something.else on issue/4');
  });
});
