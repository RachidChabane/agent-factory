import type { TokenUsage } from './model.ts';

/**
 * Token totals always say whether they count prompt-cache reads and writes, because a
 * cached run reads far more tokens than it is charged for at the full input price.
 */
export const TOKEN_TOTAL_BASES = ['with-cache', 'without-cache'] as const;
export type TokenTotalBasis = (typeof TOKEN_TOTAL_BASES)[number];

export const NO_TOKENS: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

export function tokensWithoutCache(usage: TokenUsage): number {
  return usage.inputTokens + usage.outputTokens;
}

export function cacheTokens(usage: TokenUsage): number {
  return usage.cacheReadTokens + usage.cacheCreationTokens;
}

export function tokensWithCache(usage: TokenUsage): number {
  return tokensWithoutCache(usage) + cacheTokens(usage);
}

export function totalTokens(usage: TokenUsage, basis: TokenTotalBasis): number {
  return basis === 'with-cache' ? tokensWithCache(usage) : tokensWithoutCache(usage);
}

export function addTokenUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheCreationTokens: left.cacheCreationTokens + right.cacheCreationTokens,
  };
}
