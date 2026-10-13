import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CHECKS_VERDICTS, evaluatePullRequestReadiness, type PullRequestReadinessFacts } from './pull-request-readiness.ts';

const scenarios = fc.uniqueArray(fc.constantFrom('checkout-flow', 'cart-badge', 'refund'));
const facts: fc.Arbitrary<PullRequestReadinessFacts> = fc.record({
  checks: fc.constantFrom(...CHECKS_VERDICTS),
  pendingFilms: scenarios,
  failedFilms: scenarios,
});

describe('pull request readiness', () => {
  it('is ready when the required checks passed and no film is queued, recording or failed', () => {
    expect(evaluatePullRequestReadiness({ checks: 'passed', pendingFilms: [], failedFilms: [] })).toEqual({ ready: true, blockers: [] });
  });

  it('is ready exactly when nothing blocks it', () => {
    fc.assert(
      fc.property(facts, (candidate) => {
        const readiness = evaluatePullRequestReadiness(candidate);
        return readiness.ready === (candidate.checks === 'passed' && candidate.pendingFilms.length === 0 && candidate.failedFilms.length === 0) && readiness.ready === (readiness.blockers.length === 0);
      }),
    );
  });

  it('is never ready while a film is queued or recording', () => {
    fc.assert(fc.property(facts.filter((candidate) => candidate.pendingFilms.length > 0), (candidate) => !evaluatePullRequestReadiness(candidate).ready));
  });

  it('is never ready while a film has failed, and says which', () => {
    fc.assert(
      fc.property(facts.filter((candidate) => candidate.failedFilms.length > 0), (candidate) => {
        const readiness = evaluatePullRequestReadiness(candidate);
        return !readiness.ready && readiness.blockers.some((blocker) => blocker.kind === 'films-failed' && blocker.scenarios === candidate.failedFilms);
      }),
    );
  });

  it('is never ready unless the checks passed', () => {
    fc.assert(fc.property(facts.filter((candidate) => candidate.checks !== 'passed'), (candidate) => !evaluatePullRequestReadiness(candidate).ready));
  });

  it('names every blocker, the checks first', () => {
    expect(evaluatePullRequestReadiness({ checks: 'running', pendingFilms: ['checkout-flow'], failedFilms: ['cart-badge'] }).blockers).toEqual([
      { kind: 'checks-running' },
      { kind: 'films-pending', scenarios: ['checkout-flow'] },
      { kind: 'films-failed', scenarios: ['cart-badge'] },
    ]);
    expect(evaluatePullRequestReadiness({ checks: 'failed', pendingFilms: [], failedFilms: [] }).blockers).toEqual([{ kind: 'checks-failed' }]);
  });
});
