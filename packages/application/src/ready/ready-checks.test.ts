import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CHECK_CONCLUSIONS, type CheckRunSummary } from '../ports.ts';
import { checksBlockingMerge } from '../pipeline/merge-on-order.ts';
import { requiredChecksVerdict } from './ready-checks.ts';

const run = (name: string, conclusion: CheckRunSummary['conclusion']): CheckRunSummary => ({ name, conclusion, url: `https://ci.example/${name}`, durationMs: null });
const checkArbitrary = fc.record({ name: fc.constantFrom('lint', 'unit', 'e2e'), conclusion: fc.constantFrom(...CHECK_CONCLUSIONS), url: fc.constant('https://ci.example'), durationMs: fc.constant(null) });
const checksArbitrary = fc.uniqueArray(checkArbitrary, { selector: (check) => check.name, maxLength: 3 });

describe('the verdict on the required checks of a head', () => {
  it('passes when every check passed, is neutral or was skipped', () => {
    expect(requiredChecksVerdict([run('lint', 'success'), run('unit', 'neutral'), run('e2e', 'skipped')], [], false)).toBe('passed');
  });

  it('fails when a check fails or was cancelled, unless the base branch fails it too', () => {
    expect(requiredChecksVerdict([run('lint', 'failure')], [], true)).toBe('failed');
    expect(requiredChecksVerdict([run('lint', 'cancelled')], [], true)).toBe('failed');
    expect(requiredChecksVerdict([run('lint', 'failure'), run('unit', 'success')], [run('lint', 'failure')], true)).toBe('passed');
  });

  it('runs while a check is pending, and a failure outweighs a pending check', () => {
    expect(requiredChecksVerdict([run('lint', 'success'), run('unit', 'pending')], [], true)).toBe('running');
    expect(requiredChecksVerdict([run('lint', 'failure'), run('unit', 'pending')], [], true)).toBe('failed');
  });

  it('counts an empty list as passed only once the forge had time to register checks', () => {
    expect(requiredChecksVerdict([], [], false)).toBe('running');
    expect(requiredChecksVerdict([], [], true)).toBe('passed');
  });

  it('agrees with the rule that gates the merge', () => {
    fc.assert(
      fc.property(checksArbitrary, checksArbitrary, (checks, baseChecks) => {
        const verdict = requiredChecksVerdict(checks, baseChecks, true);
        return (verdict === 'passed') === (checksBlockingMerge(checks, baseChecks) === null);
      }),
    );
  });
});
