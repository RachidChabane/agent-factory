import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DocumentError } from './json/json-reader.ts';
import { parseScenario } from './scenario/scenario-parser.ts';
import { DEFAULT_ACCOUNT, DEFAULT_ROLE_SIGNATURES, DEFAULT_USAGE } from './scenario/scenario.ts';

function entryWith(overrides: object): object {
  return { role: 'implementer', when: 'issue 7', attempts: [{ steps: [{ say: 'hello' }], final: 'done' }], ...overrides };
}

function attemptWith(attempt: object): object {
  return { entries: [entryWith({ attempts: [attempt] })] };
}

function messageOf(document: unknown): string {
  try {
    parseScenario(document);
  } catch (error) {
    assert.ok(error instanceof DocumentError, `expected a DocumentError, got ${String(error)}`);
    return error.message;
  }
  return assert.fail('the scenario was accepted');
}

describe('parseScenario', () => {
  it('fills every section a scenario leaves out with its defaults', () => {
    assert.deepEqual(parseScenario({}), { signatures: DEFAULT_ROLE_SIGNATURES, account: DEFAULT_ACCOUNT, usage: DEFAULT_USAGE, entries: [], fallback: {} });
  });

  it('reads signatures, usage, entries and fallbacks', () => {
    const scenario = parseScenario({
      signatures: { implementer: 'Build it' },
      usage: {
        session: { percent: 90, resetsInHours: 1.5 },
        weeklyScoped: [{ model: 'Sonnet', percent: 20 }],
      },
      entries: [
        {
          role: 'implementer',
          when: 'issue 7',
          attempts: [
            { steps: [{ say: 'Reading.' }, { write: { path: 'a/b.txt', content: 'x' } }, { delete: 'old.txt' }], final: 'first' },
            { final: 'second' },
          ],
        },
      ],
      fallback: { reviewer: { attempts: [{}] } },
    });
    assert.deepEqual(scenario.signatures, { ...DEFAULT_ROLE_SIGNATURES, implementer: 'Build it' });
    assert.deepEqual(scenario.usage, {
      session: { percent: 90, resetsInHours: 1.5 },
      weeklyAll: DEFAULT_USAGE.weeklyAll,
      weeklyScoped: [{ model: 'Sonnet', percent: 20, resetsInHours: 80 }],
    });
    assert.deepEqual(scenario.entries, [
      {
        role: 'implementer',
        when: 'issue 7',
        attempts: [
          {
            steps: [
              { kind: 'say', text: 'Reading.' },
              { kind: 'write', path: 'a/b.txt', content: 'x' },
              { kind: 'delete', path: 'old.txt' },
            ],
            final: 'first',
          },
          { steps: [], final: 'second' },
        ],
      },
    ]);
    assert.deepEqual(scenario.fallback, { reviewer: { attempts: [{ steps: [], final: null }] } });
  });

  it('accepts an empty file content and no scoped usage at all', () => {
    const scenario = parseScenario({ usage: { weeklyScoped: [] }, ...attemptWith({ steps: [{ write: { path: 'empty.txt', content: '' } }] }) });
    assert.deepEqual(scenario.usage.weeklyScoped, []);
    assert.deepEqual(scenario.entries[0]?.attempts[0].steps, [{ kind: 'write', path: 'empty.txt', content: '' }]);
  });
});

describe('parseScenario errors name the bad field', () => {
  const CASES: readonly (readonly [string, unknown, string])[] = [
    ['a document that is not an object', [], 'the document must be an object'],
    ['a misspelled section', { entires: [] }, 'entires is not a known field (expected signatures, account, usage, entries, fallback)'],
    [
      'an unknown role',
      { entries: [entryWith({ role: 'wizard' })] },
      'entries[0].role must be one of "acceptance-author", "implementer", "reviewer", "auditor", "challenger"',
    ],
    ['an entry without a trigger', { entries: [{ role: 'implementer', attempts: [{}] }] }, 'entries[0].when must be a non-empty string'],
    ['a blank trigger', { entries: [entryWith({ when: '  ' })] }, 'entries[0].when must be a non-empty string'],
    ['an entry without attempts', { entries: [entryWith({ attempts: [] })] }, 'entries[0].attempts must contain at least one attempt'],
    ['attempts that are not a list', { entries: [entryWith({ attempts: {} })] }, 'entries[0].attempts must be an array'],
    ['a misspelled attempt field', attemptWith({ fianl: 'x' }), 'entries[0].attempts[0].fianl is not a known field (expected steps, final)'],
    ['an empty final text', attemptWith({ final: '' }), 'entries[0].attempts[0].final must be a non-empty string'],
    ['steps that are not a list', attemptWith({ steps: 'write' }), 'entries[0].attempts[0].steps must be an array'],
    [
      'a step with two actions',
      attemptWith({ steps: [{ say: 'a' }, { say: 'b', delete: 'c' }] }),
      'entries[0].attempts[0].steps[1] must have exactly one of "write", "delete", "say"',
    ],
    ['an empty step', attemptWith({ steps: [{}] }), 'entries[0].attempts[0].steps[0] must have exactly one of "write", "delete", "say"'],
    [
      'an unknown step',
      attemptWith({ steps: [{ rename: 'a' }] }),
      'entries[0].attempts[0].steps[0].rename is not a step (expected one of "write", "delete", "say")',
    ],
    ['a write without content', attemptWith({ steps: [{ write: { path: 'a' } }] }), 'entries[0].attempts[0].steps[0].write.content must be a string'],
    [
      'a write with an unknown field',
      attemptWith({ steps: [{ write: { path: 'a', content: '', mode: 1 } }] }),
      'entries[0].attempts[0].steps[0].write.mode is not a known field (expected path, content)',
    ],
    [
      'an absolute path',
      attemptWith({ steps: [{ write: { path: '/etc/passwd', content: '' } }] }),
      'entries[0].attempts[0].steps[0].write.path must be relative to the working directory',
    ],
    [
      'a path that leaves the working directory',
      attemptWith({ steps: [{ delete: 'a/../../b' }] }),
      'entries[0].attempts[0].steps[0].delete must stay inside the working directory (no ".." segment)',
    ],
    ['an empty say', attemptWith({ steps: [{ say: '' }] }), 'entries[0].attempts[0].steps[0].say must be a non-empty string'],
    ['a percentage above 100', { usage: { session: { percent: 101 } } }, 'usage.session.percent must be a number between 0 and 100'],
    ['a percentage that is not a number', { usage: { weeklyAll: { percent: '12' } } }, 'usage.weeklyAll.percent must be a number between 0 and 100'],
    ['negative hours', { usage: { weeklyAll: { resetsInHours: -1 } } }, 'usage.weeklyAll.resetsInHours must be a number between 0 and 8760'],
    ['a scoped limit without a model', { usage: { weeklyScoped: [{ percent: 1 }] } }, 'usage.weeklyScoped[0].model must be a non-empty string'],
    ['a scoped limit without a percentage', { usage: { weeklyScoped: [{ model: 'Opus' }] } }, 'usage.weeklyScoped[0].percent must be a number between 0 and 100'],
    [
      'a signature for an unknown role',
      { signatures: { wizard: 'x' } },
      'signatures.wizard is not a known field (expected acceptance-author, implementer, reviewer, auditor, challenger)',
    ],
    ['an empty signature', { signatures: { reviewer: '' } }, 'signatures.reviewer must be a non-empty string'],
    [
      'two roles with the same signature',
      { signatures: { reviewer: 'Same words', auditor: 'Same words' } },
      'signatures must give "reviewer" and "auditor" different signatures',
    ],
    ['a fallback for an unknown role', { fallback: { wizard: { attempts: [{}] } } }, 'fallback.wizard is not a known field'],
    ['a fallback without attempts', { fallback: { reviewer: {} } }, 'fallback.reviewer.attempts must be an array'],
    ['a fallback with a trigger', { fallback: { reviewer: { when: 'x', attempts: [{}] } } }, 'fallback.reviewer.when is not a known field (expected attempts)'],
  ];

  for (const [name, document, expected] of CASES) {
    it(`rejects ${name}`, () => {
      assert.ok(messageOf(document).startsWith(expected), `got: ${messageOf(document)}`);
    });
  }
});
