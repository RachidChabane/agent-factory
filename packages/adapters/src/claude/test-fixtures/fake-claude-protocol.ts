import { fileURLToPath } from 'node:url';

export const FAKE_CLAUDE_SCRIPT = fileURLToPath(new URL('./fake-claude.ts', import.meta.url));
export const FAKE_MODE_FLAG = '--fake-mode';
export const FAKE_FIXTURE_FLAG = '--fake-fixture';
export const FAKE_MODES = ['replay', 'echo', 'fail', 'hang', 'stubborn', 'flood', 'tamper'] as const;
export type FakeMode = (typeof FAKE_MODES)[number];

export const FAKE_SESSION_ID = 'fake-session';
export const FAKE_FAILURE_MESSAGE = 'fatal: fake claude could not start';
export const FAKE_FAILURE_EXIT_CODE = 3;
export const FAKE_FLOOD_LINE_COUNT = 5_000;
export const FAKE_OVERSIZED_LINE_CHARACTERS = 300_000;
export const FAKE_INVOCATION_TYPE = 'fake_invocation';
export const FAKE_GRANDCHILD_TYPE = 'fake_grandchild';

export const FAKE_SUCCESS_RESULT = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  session_id: FAKE_SESSION_ID,
  result: 'fake done',
  total_cost_usd: 0.01,
  duration_ms: 5,
  num_turns: 1,
  usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 },
} as const;
