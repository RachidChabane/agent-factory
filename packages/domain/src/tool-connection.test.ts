import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_TOOLS, isBuiltInTool, REQUIRED_TOOLS, TOOL_STATUSES } from './tool-connection.ts';

describe('tool connection vocabulary', () => {
  it('names the tools the factory cannot run without', () => {
    expect(BUILT_IN_TOOLS).toEqual(['git', 'gh', 'claude', 'sandbox']);
  });

  it('keeps every required tool among the built-in ones', () => {
    for (const tool of REQUIRED_TOOLS) expect(isBuiltInTool(tool)).toBe(true);
  });

  it('lists the statuses a probe can report', () => {
    expect(TOOL_STATUSES).toEqual(['connected', 'unauthenticated', 'missing', 'error']);
  });

  it.each(BUILT_IN_TOOLS)('recognises %s as a built-in tool', (tool) => {
    expect(isBuiltInTool(tool)).toBe(true);
  });

  it.each(['', 'GIT', 'git ', 'pup', 'sandbox-exec'])('does not take %j for a built-in tool', (name) => {
    expect(isBuiltInTool(name)).toBe(false);
  });

  it('refuses every name that is not spelled exactly like a built-in one', () => {
    fc.assert(fc.property(fc.string().filter((name) => BUILT_IN_TOOLS.every((tool) => tool !== name)), (name) => !isBuiltInTool(name)));
  });
});
