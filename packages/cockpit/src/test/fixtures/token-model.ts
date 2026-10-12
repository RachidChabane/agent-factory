import { addTokenUsage, NO_TOKENS, tokensWithCache, tokensWithoutCache, type TokenUsage } from '@agent-factory/domain';
import type { TokenTotals } from '../../contract/index.ts';
import { MODEL_HAIKU, MODEL_OPUS, MODEL_SONNET } from './people.ts';

const TOKENS_PER_MILLION = 1_000_000;
const COST_DECIMALS = 10_000;

interface PriceList {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheCreation: number;
}

/** Dollars per million tokens. */
const PRICES: Readonly<Record<string, PriceList>> = {
  [MODEL_OPUS]: { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
  [MODEL_SONNET]: { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  [MODEL_HAIKU]: { input: 1, output: 5, cacheRead: 0.1, cacheCreation: 1.25 },
};

export function costOf(model: string, usage: TokenUsage): number {
  const prices = PRICES[model];
  if (prices === undefined) throw new Error(`no price list for the model ${model}`);
  const dollars =
    (usage.inputTokens * prices.input +
      usage.outputTokens * prices.output +
      usage.cacheReadTokens * prices.cacheRead +
      usage.cacheCreationTokens * prices.cacheCreation) /
    TOKENS_PER_MILLION;
  return Math.round(dollars * COST_DECIMALS) / COST_DECIMALS;
}

const OUTPUT_FLOOR = 180;
const OUTPUT_SPREAD = 260;
const OUTPUT_STRIDE = 73;
const CACHE_CREATION_FLOOR = 1_100;
const CACHE_CREATION_STEP = 300;
const CACHE_CREATION_CYCLE = 7;
const CONTEXT_GROWTH_PER_TURN = 600;

/** The context a session starts from; a resumed session starts from the context it ended with. */
export const FRESH_CONTEXT_TOKENS = 20_000;
export const RESUMED_CONTEXT_TOKENS = 110_000;

/** What one more turn of a session adds: the context grows, so the cache is read more as the run goes on. */
export function usageOfTurn(turn: number, contextTokens: number = FRESH_CONTEXT_TOKENS): TokenUsage {
  return {
    inputTokens: 40 + 6 * turn,
    outputTokens: OUTPUT_FLOOR + ((OUTPUT_STRIDE * turn) % OUTPUT_SPREAD),
    cacheReadTokens: contextTokens + CONTEXT_GROWTH_PER_TURN * turn,
    cacheCreationTokens: CACHE_CREATION_FLOOR + (turn % CACHE_CREATION_CYCLE) * CACHE_CREATION_STEP,
  };
}

export function usageAfterTurns(turns: number, contextTokens: number = FRESH_CONTEXT_TOKENS): TokenUsage {
  let usage = NO_TOKENS;
  for (let turn = 1; turn <= turns; turn += 1) usage = addTokenUsage(usage, usageOfTurn(turn, contextTokens));
  return usage;
}

/** The first turn at which a run on this model has spent more than its budget. */
export function turnsToExceed(model: string, budgetUsd: number, contextTokens: number = FRESH_CONTEXT_TOKENS): number {
  let turn = 1;
  while (costOf(model, usageAfterTurns(turn, contextTokens)) <= budgetUsd) turn += 1;
  return turn;
}

export function tokenTotals(usage: TokenUsage): TokenTotals {
  return {
    input: usage.inputTokens,
    output: usage.outputTokens,
    cacheRead: usage.cacheReadTokens,
    cacheCreation: usage.cacheCreationTokens,
    withoutCache: tokensWithoutCache(usage),
    withCache: tokensWithCache(usage),
  };
}
