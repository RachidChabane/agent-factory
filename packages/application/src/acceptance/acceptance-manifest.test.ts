import { execFileSync } from 'node:child_process';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { IssueSpec } from '@agent-factory/domain';
import {
  acceptanceCommand,
  checkPaths,
  checksProving,
  criterionChecks,
  isSafeRelativePath,
  readAcceptanceManifest,
} from './acceptance-manifest.ts';
import { shellCommandLine } from './shell-quote.ts';

const SHELL_ROUND_TRIPS = 25;
const SHELL_PROPERTY_TIMEOUT_MS = 60_000;

const SPEC: IssueSpec = {
  number: 42,
  title: 'Link mockups to their conversation',
  type: 'ui',
  need: 'Operators lose track of the source conversation.',
  acceptanceCriteria: ['The header links the conversation.', 'The link opens the producing message.'],
  outOfScope: ['Editing the conversation.'],
  expectedProof: 'A Playwright journey.',
  dependsOn: [],
  commitKind: null,
};

const MANIFEST = {
  runner: 'playwright',
  checks: [
    { criterion: 1, paths: ['app/e2e/mockup-link.spec.ts'], description: 'the header shows the link' },
    { criterion: 2, paths: ['app/e2e/mockup-link.spec.ts'], description: 'the link opens the message' },
  ],
  command: ['pnpm', '--filter', 'app', 'exec', 'playwright', 'test', 'e2e/mockup-link.spec.ts'],
  evidence: ['app/test-results/mockup-link/header.png'],
};

function read(manifest: unknown, spec: IssueSpec = SPEC): ReturnType<typeof readAcceptanceManifest> {
  return readAcceptanceManifest(JSON.stringify(manifest), spec);
}

function problems(manifest: unknown, spec: IssueSpec = SPEC): readonly string[] {
  const reading = read(manifest, spec);
  return reading.valid ? [] : reading.problems;
}

describe('acceptance manifest', () => {
  it('accepts a manifest covering every criterion and exposes its checks and command', () => {
    const reading = read(MANIFEST);
    expect(reading.valid).toBe(true);
    if (!reading.valid) return;
    expect(reading.manifest.score).toBeNull();
    expect(checkPaths(reading.manifest)).toEqual(['app/e2e/mockup-link.spec.ts']);
    expect(checksProving(reading.manifest, 2)).toEqual(['app/e2e/mockup-link.spec.ts']);
    expect(acceptanceCommand(reading.manifest)).toBe('pnpm --filter app exec playwright test e2e/mockup-link.spec.ts');
  });

  it('reports a missing manifest and invalid JSON', () => {
    expect(readAcceptanceManifest(null, SPEC)).toEqual({ valid: false, problems: ['.factory/acceptance.json was not written'] });
    expect(readAcceptanceManifest('{', SPEC).valid).toBe(false);
  });

  it('rejects unknown fields and unsafe paths', () => {
    expect(problems({ ...MANIFEST, extra: true })[0]).toContain('extra');
    expect(problems({ ...MANIFEST, evidence: ['../escape.png'] })[0]).toContain('evidence.0');
    expect(problems({ ...MANIFEST, checks: [{ criterion: 1, paths: ['.evidence/42/a.ts'], description: 'x' }] })[0]).toContain(
      'must not be under',
    );
  });

  it('requires every criterion to be proven and criteria to exist', () => {
    const checks = [
      { criterion: 1, paths: ['app/e2e/a.spec.ts'], description: 'one' },
      { criterion: 3, paths: ['app/e2e/a.spec.ts'], description: 'three' },
    ];
    expect(problems({ ...MANIFEST, checks })).toEqual([
      'a check proves criterion 3 but the spec has 2',
      'acceptance criterion 2 has no proving check',
    ]);
  });

  it('requires checks for types whose before proof must fail on base', () => {
    expect(problems({ ...MANIFEST, command: null, checks: [] })).toEqual([
      'a ui issue needs at least one acceptance check (Playwright journey asserting the new behaviour)',
    ]);
  });

  it('allows a manifest without checks for types without a before proof', () => {
    expect(read({ checks: [], command: [], evidence: [] }, { ...SPEC, type: 'doc' }).valid).toBe(true);
  });

  it('requires a score output for skill-prompt issues', () => {
    const scored = { ...MANIFEST, runner: 'eval' };
    expect(problems(scored, { ...SPEC, type: 'skill-prompt' })).toEqual(['a skill-prompt issue needs a "score" output']);
    expect(read({ ...scored, score: { path: 'agent/eval/out/score.json' } }, { ...SPEC, type: 'skill-prompt' }).valid).toBe(true);
  });

  it('rejects duplicate outputs and outputs that are also checks', () => {
    expect(problems({ ...MANIFEST, evidence: ['app/e2e/mockup-link.spec.ts', 'app/e2e/mockup-link.spec.ts'] })).toEqual([
      'output app/e2e/mockup-link.spec.ts is declared more than once',
      'app/e2e/mockup-link.spec.ts is declared both as a check and as an output',
    ]);
  });

  it('pairs a command with checks', () => {
    expect(problems({ ...MANIFEST, command: [] })).toEqual(['checks are declared but no command runs them']);
  });

  it('requires the runner that runs the checks, eval only for skill-prompt issues', () => {
    expect(problems({ ...MANIFEST, runner: null })).toEqual([
      'checks are declared but no "runner" says which test runner runs them (pytest, vitest, playwright, eval)',
    ]);
    expect(problems({ ...MANIFEST, runner: 'eval' })).toEqual(['the "eval" runner only proves skill-prompt issues']);
    expect(problems({ ...MANIFEST, runner: 'vitest', score: { path: 'out/score.json' } }, { ...SPEC, type: 'skill-prompt' })).toEqual([
      'a skill-prompt issue runs its checks with the "eval" runner',
    ]);
    expect(problems({ ...MANIFEST, runner: 'jest' })[0]).toContain('runner');
  });

  it('defaults every check to failing on base and lets a criterion keep today\'s behaviour', () => {
    const reading = read({
      ...MANIFEST,
      checks: [
        { criterion: 1, paths: ['app/e2e/mockup-link.spec.ts'], description: 'new' },
        { criterion: 2, paths: ['app/e2e/conversation.spec.ts'], description: 'kept', onBase: 'passes' },
      ],
    });
    expect(reading.valid).toBe(true);
    if (!reading.valid) return;
    expect(criterionChecks(reading.manifest)).toEqual([
      { criterion: 1, files: ['app/e2e/mockup-link.spec.ts'], onBase: 'fails' },
      { criterion: 2, files: ['app/e2e/conversation.spec.ts'], onBase: 'passes' },
    ]);
  });

  it('keeps new and kept behaviour in separate files and requires one check that fails on base', () => {
    expect(
      problems({
        ...MANIFEST,
        checks: [
          { criterion: 1, paths: ['app/e2e/mockup-link.spec.ts'], description: 'new' },
          { criterion: 2, paths: ['app/e2e/mockup-link.spec.ts'], description: 'kept', onBase: 'passes' },
        ],
      }),
    ).toEqual(['app/e2e/mockup-link.spec.ts is declared both as failing and as passing on base; keep new and kept behaviour in separate files']);
    const keptOnly = MANIFEST.checks.map((check) => ({ ...check, onBase: 'passes' }));
    expect(problems({ ...MANIFEST, checks: keptOnly })).toEqual(['a ui issue needs at least one check that fails on base']);
    expect(problems({ ...MANIFEST, runner: 'vitest' }, { ...SPEC, type: 'refactor' })).toEqual([
      "a refactor issue keeps today's behaviour, so every check passes on base",
    ]);
  });

  it('recognises safe relative paths', () => {
    expect(['a/b.ts', '.github/workflows/x.yml'].every(isSafeRelativePath)).toBe(true);
    expect(['/abs', '~/x', 'a/../b', './a', 'a//b', 'a\\b'].some(isSafeRelativePath)).toBe(false);
  });
});

describe('shell command line (property)', () => {
  it('quotes every argument so the shell passes it back unchanged', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: 'grapheme-ascii', maxLength: 12 }), { minLength: 1, maxLength: 5 }), (argv) => {
        const printed = execFileSync('/bin/sh', ['-c', `printf '%s\\0' ${shellCommandLine(argv)}`], { encoding: 'utf8' });
        expect(printed.split('\0').slice(0, -1)).toEqual(argv);
      }),
      { numRuns: SHELL_ROUND_TRIPS },
    );
  }, SHELL_PROPERTY_TIMEOUT_MS);
});
