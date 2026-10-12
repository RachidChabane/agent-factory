import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hookOutcomeOf,
  hookOutputOf,
  stopDecisionOf,
  toolDecisionOf,
  type HookExecution,
  type ToolDecision,
} from './hooks/hook-decisions.ts';
import { STOP_HOOK_CASES } from './test-support/stop-hook-cases.ts';

function execution(exitCode: number | null, stdout: string, stderr = ''): HookExecution {
  return { exitCode, stdout, stderr, timedOut: exitCode === null };
}

const DENY_JSON = (reason: string): string =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });

const ALLOWED: ToolDecision = { allowed: true };

describe('toolDecisionOf', () => {
  const CASES: readonly (readonly [string, HookExecution, ToolDecision])[] = [
    ['no output', execution(0, ''), ALLOWED],
    ['a JSON deny with a reason', execution(0, DENY_JSON('this path is frozen')), { allowed: false, reason: 'this path is frozen' }],
    ['a JSON deny without a reason', execution(0, DENY_JSON('')), { allowed: false, reason: 'The tool call was blocked by a PreToolUse hook.' }],
    ['a JSON allow', execution(0, '{"hookSpecificOutput":{"permissionDecision":"allow"}}'), ALLOWED],
    ['a JSON ask', execution(0, '{"hookSpecificOutput":{"permissionDecision":"ask"}}'), ALLOWED],
    ['a specific output that is not an object', execution(0, '{"hookSpecificOutput":"deny"}'), ALLOWED],
    ['text that is not JSON', execution(0, 'denied!'), ALLOWED],
    ['exit code 2 with a reason on standard error', execution(2, '', 'no writes here\n'), { allowed: false, reason: 'no writes here' }],
    ['exit code 2 without output', execution(2, ''), { allowed: false, reason: 'The tool call was blocked by a PreToolUse hook.' }],
    ['exit code 2 together with a JSON deny', execution(2, DENY_JSON('from json'), 'from stderr'), { allowed: false, reason: 'from stderr' }],
    ['exit code 2 and a JSON deny, nothing on standard error', execution(2, DENY_JSON('from json')), { allowed: false, reason: 'from json' }],
    ['exit code 1, a non-blocking error', execution(1, '', 'oops'), ALLOWED],
    ['a hook killed by its timeout', execution(null, ''), ALLOWED],
  ];

  for (const [name, hookExecution, expected] of CASES) {
    it(`decides ${name}`, () => {
      assert.deepEqual(toolDecisionOf(hookExecution), expected);
    });
  }
});

describe('stopDecisionOf', () => {
  for (const { name, execution: hookExecution, blocked, reason } of STOP_HOOK_CASES) {
    it(`decides ${name}`, () => {
      const decision = stopDecisionOf(hookExecution);
      assert.equal(decision.blocked, blocked);
      if (decision.blocked && reason !== null) {
        assert.equal(decision.reason, reason);
      }
    });
  }

  it('gives a blocking hook without any reason a default one', () => {
    const decision = stopDecisionOf(execution(2, ''));
    assert.ok(decision.blocked && decision.reason.length > 0);
  });
});

describe('the response a hook leaves in the stream', () => {
  it('reports success only for exit code 0', () => {
    assert.equal(hookOutcomeOf(execution(0, '')), 'success');
    assert.equal(hookOutcomeOf(execution(2, '')), 'error');
    assert.equal(hookOutcomeOf(execution(1, '')), 'error');
    assert.equal(hookOutcomeOf(execution(null, '')), 'error');
  });

  it('puts standard output first and standard error after it in the combined output', () => {
    assert.equal(hookOutputOf(execution(0, 'out', 'err')), 'outerr');
    assert.equal(hookOutputOf(execution(0, '{"a":1}\n')), '{"a":1}\n');
  });
});
