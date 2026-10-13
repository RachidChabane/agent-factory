import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluatePullRequestReadiness, type PullRequestReadinessFacts } from './pull-request-readiness.ts';

const scenarios = fc.uniqueArray(fc.constantFrom('checkout-flow', 'cart-badge', 'refund'));
const checks = fc.uniqueArray(fc.constantFrom('lint', 'unit', 'e2e', 'quality-gate'));
const facts: fc.Arbitrary<PullRequestReadinessFacts> = fc.record({
  failedChecks: checks,
  runningChecks: checks,
  checksReported: fc.boolean(),
  pendingFilms: scenarios,
  failedFilms: scenarios,
});

const GREEN: PullRequestReadinessFacts = { failedChecks: [], runningChecks: [], checksReported: true, pendingFilms: [], failedFilms: [] };

describe('pull request readiness', () => {
  it('is ready when every check of the head passed and no film is queued, recording or failed', () => {
    expect(evaluatePullRequestReadiness(GREEN)).toEqual({ ready: true, blockers: [] });
  });

  it('is ready exactly when nothing blocks it', () => {
    fc.assert(
      fc.property(facts, (candidate) => {
        const readiness = evaluatePullRequestReadiness(candidate);
        const clear =
          candidate.failedChecks.length === 0 &&
          candidate.runningChecks.length === 0 &&
          candidate.checksReported &&
          candidate.pendingFilms.length === 0 &&
          candidate.failedFilms.length === 0;
        return readiness.ready === clear && readiness.ready === (readiness.blockers.length === 0);
      }),
    );
  });

  it('is never ready while a check failed, and names each failed check', () => {
    fc.assert(
      fc.property(facts.filter((candidate) => candidate.failedChecks.length > 0), (candidate) => {
        const readiness = evaluatePullRequestReadiness(candidate);
        return !readiness.ready && readiness.blockers.some((blocker) => blocker.kind === 'checks-failed' && blocker.checks === candidate.failedChecks);
      }),
    );
  });

  it('is never ready while a check runs, and names each running check', () => {
    fc.assert(
      fc.property(facts.filter((candidate) => candidate.runningChecks.length > 0), (candidate) => {
        const readiness = evaluatePullRequestReadiness(candidate);
        return !readiness.ready && readiness.blockers.some((blocker) => blocker.kind === 'checks-running' && blocker.checks === candidate.runningChecks);
      }),
    );
  });

  it('is never ready before the forge reported the checks, and then names none', () => {
    fc.assert(
      fc.property(facts.filter((candidate) => !candidate.checksReported && candidate.runningChecks.length === 0), (candidate) => {
        const readiness = evaluatePullRequestReadiness(candidate);
        return !readiness.ready && readiness.blockers.some((blocker) => blocker.kind === 'checks-running' && blocker.checks.length === 0);
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

  it('names every blocker, the checks first, a failure before a check that still runs', () => {
    expect(
      evaluatePullRequestReadiness({ failedChecks: ['quality-gate'], runningChecks: ['e2e', 'unit'], checksReported: true, pendingFilms: ['checkout-flow'], failedFilms: ['cart-badge'] }).blockers,
    ).toEqual([
      { kind: 'checks-failed', checks: ['quality-gate'] },
      { kind: 'checks-running', checks: ['e2e', 'unit'] },
      { kind: 'films-pending', scenarios: ['checkout-flow'] },
      { kind: 'films-failed', scenarios: ['cart-badge'] },
    ]);
    expect(evaluatePullRequestReadiness({ ...GREEN, failedChecks: ['lint'] }).blockers).toEqual([{ kind: 'checks-failed', checks: ['lint'] }]);
  });

  it('says that no check was reported yet without naming one', () => {
    expect(evaluatePullRequestReadiness({ ...GREEN, checksReported: false }).blockers).toEqual([{ kind: 'checks-running', checks: [] }]);
  });
});
