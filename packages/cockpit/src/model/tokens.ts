import type { TokenTotals, TokenUsageView } from '../contract/index.ts';

/** The totals of one run's usage, stated both with and without the cache tokens. */
export function tokenTotalsOfUsage(usage: TokenUsageView): TokenTotals {
  const withoutCache = usage.inputTokens + usage.outputTokens;
  return {
    input: usage.inputTokens,
    output: usage.outputTokens,
    cacheRead: usage.cacheReadTokens,
    cacheCreation: usage.cacheCreationTokens,
    withoutCache,
    withCache: withoutCache + usage.cacheReadTokens + usage.cacheCreationTokens,
  };
}
