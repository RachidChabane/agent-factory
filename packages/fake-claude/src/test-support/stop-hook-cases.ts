import type { HookExecution } from '../hooks/hook-decisions.ts';

export interface StopHookCase {
  readonly name: string;
  readonly execution: HookExecution;
  readonly blocked: boolean;
  readonly reason: string | null;
}

function execution(exitCode: number | null, stdout: string, stderr = ''): HookExecution {
  return { exitCode, stdout, stderr, timedOut: exitCode === null };
}

const BLOCK_JSON = '{"decision":"block","reason":"the gate is red"}';

/** Every way a Stop hook can answer, with the outcome the factory's own reading of the response expects. */
export const STOP_HOOK_CASES: readonly StopHookCase[] = [
  { name: 'exit 0 and no output', execution: execution(0, ''), blocked: false, reason: null },
  { name: 'a JSON block on standard output', execution: execution(0, BLOCK_JSON), blocked: true, reason: 'the gate is red' },
  { name: 'a JSON block with surrounding whitespace', execution: execution(0, `  ${BLOCK_JSON}\n`), blocked: true, reason: 'the gate is red' },
  { name: 'a JSON block without a reason', execution: execution(0, '{"decision":"block"}'), blocked: false, reason: null },
  { name: 'a JSON block whose reason is not a string', execution: execution(0, '{"decision":"block","reason":3}'), blocked: false, reason: null },
  { name: 'another JSON decision', execution: execution(0, '{"decision":"approve","reason":"fine"}'), blocked: false, reason: null },
  { name: 'text that is not JSON', execution: execution(0, 'all good'), blocked: false, reason: null },
  { name: 'a JSON array', execution: execution(0, '[]'), blocked: false, reason: null },
  { name: 'exit code 2 with a reason on standard error', execution: execution(2, '', 'tests are red\n'), blocked: true, reason: 'tests are red' },
  { name: 'exit code 2 without any output', execution: execution(2, ''), blocked: true, reason: null },
  { name: 'exit code 1, a non-blocking error', execution: execution(1, '', 'warning'), blocked: false, reason: null },
  { name: 'a JSON block together with a non-zero exit code', execution: execution(1, BLOCK_JSON), blocked: true, reason: 'the gate is red' },
  { name: 'a hook killed by its timeout', execution: execution(null, ''), blocked: false, reason: null },
];
