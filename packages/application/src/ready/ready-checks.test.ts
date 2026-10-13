import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluatePullRequestReadiness } from '@agent-factory/domain';
import { CHECK_CONCLUSIONS, type CheckConclusion, type CheckRunSummary } from '../ports.ts';
import { checksBlockingMerge } from '../pipeline/merge-on-order.ts';
import { readinessChecksOf } from './ready-checks.ts';

const run = (name: string, conclusion: CheckRunSummary['conclusion']): CheckRunSummary => ({ name, conclusion, url: `https://ci.example/${name}`, durationMs: null });
const checkArbitrary = fc.record({ name: fc.constantFrom('lint', 'unit', 'e2e', 'quality-gate'), conclusion: fc.constantFrom(...CHECK_CONCLUSIONS), url: fc.constant('https://ci.example'), durationMs: fc.constant(null) });
const checksArbitrary = fc.uniqueArray(checkArbitrary, { selector: (check) => check.name, maxLength: 4 });
const PASSING: readonly CheckConclusion[] = ['success', 'neutral', 'skipped'];

const readyWith = (checks: readonly CheckRunSummary[], settled: boolean): boolean =>
  evaluatePullRequestReadiness({ ...readinessChecksOf(checks, settled), pendingFilms: [], failedFilms: [] }).ready;

describe('the checks of a head for the ready notice', () => {
  it('pass when every check passed, is neutral or was skipped', () => {
    expect(readinessChecksOf([run('lint', 'success'), run('unit', 'neutral'), run('e2e', 'skipped')], false)).toEqual({ failedChecks: [], runningChecks: [], checksReported: true });
  });

  it('name each check that failed or was cancelled, and each that has not completed', () => {
    expect(readinessChecksOf([run('lint', 'failure'), run('e2e', 'cancelled'), run('unit', 'pending'), run('quality-gate', 'success')], true)).toEqual({
      failedChecks: ['lint', 'e2e'],
      runningChecks: ['unit'],
      checksReported: true,
    });
  });

  it('count a failure the base branch has too, which the merge excuses', () => {
    const checks = [run('lint', 'failure'), run('unit', 'success')];
    expect(readinessChecksOf(checks, true).failedChecks).toEqual(['lint']);
    expect(checksBlockingMerge(checks, [run('lint', 'failure')])).toBeNull();
  });

  it('name a check once when the forge reports it as a check run and as a status', () => {
    expect(readinessChecksOf([run('quality-gate', 'failure'), run('quality-gate', 'failure')], true).failedChecks).toEqual(['quality-gate']);
  });

  it('count an empty report as made only once the forge had time to register checks', () => {
    expect(readinessChecksOf([], false).checksReported).toBe(false);
    expect(readinessChecksOf([], true).checksReported).toBe(true);
    expect(readyWith([], false)).toBe(false);
    expect(readyWith([], true)).toBe(true);
  });

  it('make a pull request ready exactly when every reported check passed', () => {
    fc.assert(
      fc.property(checksArbitrary, (checks) => readyWith(checks, true) === checks.every((check) => PASSING.includes(check.conclusion))),
    );
  });

  it('never make a pull request ready while a check failed or runs', () => {
    fc.assert(
      fc.property(
        checksArbitrary.filter((checks) => checks.some((check) => !PASSING.includes(check.conclusion))),
        fc.boolean(),
        (checks, settled) => !readyWith(checks, settled),
      ),
    );
  });

  it('never ready a pull request whose merge the checks block, whatever the base branch shows', () => {
    fc.assert(
      fc.property(checksArbitrary, checksArbitrary, (checks, baseChecks) => !readyWith(checks, true) || checksBlockingMerge(checks, baseChecks) === null),
    );
  });
});
