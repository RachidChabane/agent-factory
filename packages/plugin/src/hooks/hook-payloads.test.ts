import { describe, expect, it } from 'vitest';
import { BLOCKING_HOOK_EXIT_CODE, isStopBlock, stopHookBlock } from './hook-payloads.ts';

describe('isStopBlock', () => {
  it('recognises the JSON block decision the gate prints', () => {
    expect(isStopBlock(0, `${JSON.stringify(stopHookBlock('tests failed'))}\n`)).toBe(true);
  });

  it('recognises a blocking exit code', () => {
    expect(isStopBlock(BLOCKING_HOOK_EXIT_CODE, 'tests failed')).toBe(true);
  });

  it('treats an empty successful response as a release', () => {
    expect(isStopBlock(0, '')).toBe(false);
  });

  it('treats a crashed hook as a release, which the decision log then contradicts', () => {
    expect(isStopBlock(1, 'SyntaxError: Unexpected token')).toBe(false);
  });
});
