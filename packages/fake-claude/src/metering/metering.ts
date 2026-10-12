export const CHARACTERS_PER_TOKEN = 4;
export const FRESH_INPUT_TOKENS_PER_MESSAGE = 3;
export const OUTPUT_TOKENS_PER_MESSAGE = 6;
export const BASE_CONTEXT_TOKENS = 2_000;
export const API_MILLISECONDS_PER_MESSAGE = 400;
export const API_MILLISECONDS_PER_OUTPUT_TOKEN = 8;
export const TOOL_MILLISECONDS = 120;

/** USD per million tokens of the emulated model. */
export const PRICE_PER_MILLION_TOKENS = {
  input: 1,
  output: 5,
  cacheRead: 0.1,
  cacheCreation: 1.25,
} as const;

const TOKENS_PER_MILLION = 1_000_000;
const COST_DECIMALS = 8;

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}

export const NO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

export interface RunSummary {
  readonly usage: TokenUsage;
  readonly costUsd: number;
  readonly turns: number;
  readonly durationMs: number;
  readonly apiDurationMs: number;
}

export function tokensOf(characters: number): number {
  return Math.ceil(characters / CHARACTERS_PER_TOKEN);
}

export function costOf(usage: TokenUsage): number {
  const dollars =
    (usage.inputTokens * PRICE_PER_MILLION_TOKENS.input +
      usage.outputTokens * PRICE_PER_MILLION_TOKENS.output +
      usage.cacheReadTokens * PRICE_PER_MILLION_TOKENS.cacheRead +
      usage.cacheCreationTokens * PRICE_PER_MILLION_TOKENS.cacheCreation) /
    TOKENS_PER_MILLION;
  return Number(dollars.toFixed(COST_DECIMALS));
}

function sum(left: TokenUsage, right: TokenUsage): TokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheCreationTokens: left.cacheCreationTokens + right.cacheCreationTokens,
  };
}

/**
 * Bills every assistant message like a cached conversation: the context built so far is read from
 * the cache and whatever was appended since the previous message is written to it.
 */
export class RunMeter {
  #contextTokens = BASE_CONTEXT_TOKENS;
  #uncachedTokens: number;
  #total: TokenUsage = NO_USAGE;
  #messages = 0;
  #toolExecutions = 0;
  #apiDurationMs = 0;

  constructor(promptCharacters: number) {
    this.#uncachedTokens = tokensOf(promptCharacters);
  }

  appendToContext(characters: number): void {
    this.#uncachedTokens += tokensOf(characters);
  }

  billMessage(outputCharacters: number): TokenUsage {
    const outputTokens = OUTPUT_TOKENS_PER_MESSAGE + tokensOf(outputCharacters);
    const usage: TokenUsage = {
      inputTokens: FRESH_INPUT_TOKENS_PER_MESSAGE,
      outputTokens,
      cacheReadTokens: this.#contextTokens,
      cacheCreationTokens: this.#uncachedTokens,
    };
    this.#contextTokens += this.#uncachedTokens + outputTokens;
    this.#uncachedTokens = 0;
    this.#total = sum(this.#total, usage);
    this.#messages += 1;
    this.#apiDurationMs += API_MILLISECONDS_PER_MESSAGE + outputTokens * API_MILLISECONDS_PER_OUTPUT_TOKEN;
    return usage;
  }

  countToolExecution(): void {
    this.#toolExecutions += 1;
  }

  summary(): RunSummary {
    return {
      usage: this.#total,
      costUsd: costOf(this.#total),
      turns: this.#messages,
      durationMs: this.#apiDurationMs + this.#toolExecutions * TOOL_MILLISECONDS,
      apiDurationMs: this.#apiDurationMs,
    };
  }
}
