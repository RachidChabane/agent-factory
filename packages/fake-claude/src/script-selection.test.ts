import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EXIT_CODES, FakeClaudeError } from './errors.ts';
import { builtInScript } from './scenario/built-in-scripts.ts';
import { detectRole } from './scenario/role-detection.ts';
import { parseScenario } from './scenario/scenario-parser.ts';
import { DEFAULT_ROLE_SIGNATURES, FAKE_ROLES, type Scenario } from './scenario/scenario.ts';
import { resolveScript, selectScript } from './scenario/script-selection.ts';

const PROMPT_OPENINGS = {
  'acceptance-author': 'You write the acceptance checks for one GitHub issue of acme/widgets. You do not implement the change.',
  implementer: 'You implement one GitHub issue of acme/widgets in this working tree.',
  reviewer: 'You review one change to acme/widgets against its specification. You did not write it.',
  auditor: 'You audit one change that reached the default branch of acme/widgets without going through the factory.',
  challenger: 'You examine a product request for acme/widgets before any work starts.',
} as const;

function attempt(final: string): object {
  return { attempts: [{ final }] };
}

const SCENARIO: Scenario = parseScenario({
  entries: [
    { role: 'implementer', when: 'issue 7', ...attempt('implementer for 7') },
    { role: 'reviewer', when: 'issue 7', ...attempt('reviewer for 7') },
    { role: 'implementer', when: 'ticket', ...attempt('implementer for any ticket') },
    { role: 'implementer', when: 'issue 7', ...attempt('never reached') },
  ],
  fallback: { implementer: attempt('implementer fallback') },
});

function finalOf(scenario: Scenario, prompt: string): string | null {
  return selectScript(scenario, prompt).script.attempts[0].final;
}

describe('detectRole', () => {
  for (const role of FAKE_ROLES) {
    it(`recognises the ${role} prompt by its default signature`, () => {
      assert.equal(detectRole(PROMPT_OPENINGS[role], DEFAULT_ROLE_SIGNATURES), role);
    });
  }

  it('returns null when no signature occurs in the prompt', () => {
    assert.equal(detectRole('Summarise the release notes.', DEFAULT_ROLE_SIGNATURES), null);
  });

  it('finds a signature anywhere in the prompt, not only at its start', () => {
    assert.equal(detectRole(`\n\n  Context first. ${PROMPT_OPENINGS.reviewer}`, DEFAULT_ROLE_SIGNATURES), 'reviewer');
  });

  it('prefers the signature that occurs first when a diff quotes another role', () => {
    const prompt = `${PROMPT_OPENINGS.reviewer}\n<diff>\n+ You implement one thing at a time\n</diff>`;
    assert.equal(detectRole(prompt, DEFAULT_ROLE_SIGNATURES), 'reviewer');
  });

  it('prefers the longer signature when two start at the same place', () => {
    const signatures = { ...DEFAULT_ROLE_SIGNATURES, reviewer: 'You review', auditor: 'You review one change' };
    assert.equal(detectRole('You review one change to the repository', signatures), 'auditor');
  });

  it('uses the signatures a scenario overrides', () => {
    const scenario = parseScenario({ signatures: { challenger: 'Look at this request' } });
    assert.equal(detectRole('Look at this request carefully', scenario.signatures), 'challenger');
    assert.equal(detectRole(PROMPT_OPENINGS.challenger, scenario.signatures), null);
  });
});

describe('selectScript', () => {
  it('picks the first entry of the role whose trigger occurs in the prompt', () => {
    const selected = selectScript(SCENARIO, `${PROMPT_OPENINGS.implementer} issue 7`);
    assert.deepEqual(selected.reference, { source: 'entry', index: 0 });
    assert.equal(selected.script.attempts[0].final, 'implementer for 7');
  });

  it('skips an earlier entry whose trigger does not occur and keeps the order of the file', () => {
    const selected = selectScript(SCENARIO, `${PROMPT_OPENINGS.implementer} ticket 12`);
    assert.deepEqual(selected.reference, { source: 'entry', index: 2 });
  });

  it('only looks at the entries of the role the prompt belongs to', () => {
    assert.equal(finalOf(SCENARIO, `${PROMPT_OPENINGS.reviewer} issue 7`), 'reviewer for 7');
  });

  it('uses the fallback of the role when no entry matches', () => {
    const selected = selectScript(SCENARIO, PROMPT_OPENINGS.implementer);
    assert.deepEqual(selected.reference, { source: 'fallback', role: 'implementer' });
    assert.equal(selected.script.attempts[0].final, 'implementer fallback');
  });

  it('uses the built-in behaviour of the role when there is neither an entry nor a fallback', () => {
    const selected = selectScript(SCENARIO, `${PROMPT_OPENINGS.reviewer} issue 99`);
    assert.deepEqual(selected.reference, { source: 'built-in', role: 'reviewer' });
    assert.equal(selected.script, builtInScript('reviewer'));
  });

  it('uses the generic built-in behaviour when the prompt belongs to no role', () => {
    const selected = selectScript(SCENARIO, 'Something else entirely');
    assert.deepEqual(selected.reference, { source: 'built-in', role: null });
    assert.equal(selected.script, builtInScript(null));
  });
});

describe('resolveScript', () => {
  it('finds again the script a reference points to', () => {
    assert.equal(resolveScript(SCENARIO, { source: 'entry', index: 1 }), SCENARIO.entries[1]);
    assert.equal(resolveScript(SCENARIO, { source: 'fallback', role: 'implementer' }), SCENARIO.fallback.implementer);
    assert.equal(resolveScript(parseScenario({}), { source: 'built-in', role: 'auditor' }), builtInScript('auditor'));
  });

  it('reports a reference the scenario no longer defines', () => {
    for (const reference of [
      { source: 'entry', index: 9 },
      { source: 'fallback', role: 'auditor' },
    ] as const) {
      assert.throws(
        () => resolveScript(SCENARIO, reference),
        (error: unknown) => error instanceof FakeClaudeError && error.exitCode === EXIT_CODES.invalidInvocation,
      );
    }
  });
});

describe('builtInScript', () => {
  it('gives every role and the unrecognised prompt a single attempt that changes no file', () => {
    for (const role of [...FAKE_ROLES, null] as const) {
      const script = builtInScript(role);
      assert.equal(script.attempts.length, 1);
      assert.deepEqual(script.attempts[0].steps, []);
      assert.ok((script.attempts[0].final ?? '').length > 0);
    }
  });
});
