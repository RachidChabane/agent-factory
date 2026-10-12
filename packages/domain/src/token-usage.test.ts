import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { TokenUsage } from './model.ts';
import { addTokenUsage, cacheTokens, NO_TOKENS, tokensWithCache, tokensWithoutCache, totalTokens } from './token-usage.ts';

const USAGE: TokenUsage = { inputTokens: 1_200, outputTokens: 300, cacheReadTokens: 40_000, cacheCreationTokens: 2_000 };

const usage = fc.record({
  inputTokens: fc.nat(),
  outputTokens: fc.nat(),
  cacheReadTokens: fc.nat(),
  cacheCreationTokens: fc.nat(),
});

describe('token totals', () => {
  it('counts input and output without the cache, and adds cache reads and writes with it', () => {
    expect(tokensWithoutCache(USAGE)).toBe(1_500);
    expect(cacheTokens(USAGE)).toBe(42_000);
    expect(tokensWithCache(USAGE)).toBe(43_500);
    expect(totalTokens(USAGE, 'without-cache')).toBe(1_500);
    expect(totalTokens(USAGE, 'with-cache')).toBe(43_500);
  });

  it('adds usages field by field, with no tokens as the neutral element', () => {
    fc.assert(
      fc.property(usage, usage, (left, right) => {
        expect(tokensWithCache(addTokenUsage(left, right))).toBe(tokensWithCache(left) + tokensWithCache(right));
        expect(addTokenUsage(left, NO_TOKENS)).toEqual(left);
      }),
    );
  });
});
