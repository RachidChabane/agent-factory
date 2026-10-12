import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { assessPreflight, blocksAgentSpend, PREFLIGHT_VERDICTS } from './gate-preflight.ts';

describe('gate preflight assessment', () => {
  it('passes a step that exits cleanly in time', () => {
    expect(assessPreflight({ exitCode: 0, timedOut: false, output: 'ok', networkDeclared: false })).toEqual({ verdict: 'passed', evidence: null });
  });

  it('names an undeclared network need from the refusal it caused', () => {
    const output = 'Validating charts\nError: dial tcp: lookup raw.githubusercontent.com: no such host\n';
    expect(assessPreflight({ exitCode: 1, timedOut: false, output, networkDeclared: false })).toEqual({
      verdict: 'network-undeclared',
      evidence: 'Error: dial tcp: lookup raw.githubusercontent.com: no such host',
    });
  });

  it('reports a write refusal of the sandbox separately', () => {
    const output = "PermissionError: [Errno 1] Operation not permitted: '/opt/cache/x'";
    expect(assessPreflight({ exitCode: 1, timedOut: false, output, networkDeclared: false }).verdict).toBe('sandbox-refused');
  });

  it('keeps a declared network need from being reported as undeclared', () => {
    const output = 'curl: (6) Could not resolve host: example.com';
    expect(assessPreflight({ exitCode: 6, timedOut: false, output, networkDeclared: true }).verdict).toBe('sandbox-refused');
  });

  it('calls a step that ran out of preflight time without refusal unfinished, and one that could not start not runnable', () => {
    expect(assessPreflight({ exitCode: 143, timedOut: true, output: 'running 412 tests', networkDeclared: false }).verdict).toBe('unfinished');
    expect(assessPreflight({ exitCode: null, timedOut: false, output: '', networkDeclared: false }).verdict).toBe('not-runnable');
    expect(assessPreflight({ exitCode: 2, timedOut: false, output: 'lint error', networkDeclared: false }).verdict).toBe('failed');
  });

  it('never blocks agent spend on a passed or unfinished step', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PREFLIGHT_VERDICTS), (verdict) => blocksAgentSpend(verdict) === !['passed', 'unfinished', 'skipped'].includes(verdict)),
    );
  });
});
