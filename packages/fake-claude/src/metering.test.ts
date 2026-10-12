import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  API_MILLISECONDS_PER_MESSAGE,
  API_MILLISECONDS_PER_OUTPUT_TOKEN,
  BASE_CONTEXT_TOKENS,
  CHARACTERS_PER_TOKEN,
  FRESH_INPUT_TOKENS_PER_MESSAGE,
  NO_USAGE,
  OUTPUT_TOKENS_PER_MESSAGE,
  PRICE_PER_MILLION_TOKENS,
  RunMeter,
  TOOL_MILLISECONDS,
  costOf,
  tokensOf,
} from './metering/metering.ts';
import { seededRandom } from './test-support/seeded-random.ts';

const PROMPT_CHARACTERS = 40;
const PROMPT_TOKENS = 10;

describe('tokensOf', () => {
  it('rounds the characters up to whole tokens', () => {
    assert.equal(tokensOf(0), 0);
    assert.equal(tokensOf(1), 1);
    assert.equal(tokensOf(CHARACTERS_PER_TOKEN), 1);
    assert.equal(tokensOf(CHARACTERS_PER_TOKEN + 1), 2);
  });
});

describe('costOf', () => {
  it('prices every kind of token at its own rate', () => {
    const million = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheCreationTokens: 1_000_000 };
    const expected =
      PRICE_PER_MILLION_TOKENS.input + PRICE_PER_MILLION_TOKENS.output + PRICE_PER_MILLION_TOKENS.cacheRead + PRICE_PER_MILLION_TOKENS.cacheCreation;
    assert.equal(costOf(million), expected);
    assert.equal(costOf(NO_USAGE), 0);
  });

  it('rounds the cost to eight decimals', () => {
    assert.equal(costOf({ ...NO_USAGE, inputTokens: 1 }), 0.000001);
    assert.equal(costOf({ ...NO_USAGE, cacheReadTokens: 1 }), 0.0000001);
  });
});

describe('RunMeter', () => {
  it('bills the first message for the prompt it creates in the cache and for the context it reads', () => {
    const meter = new RunMeter(PROMPT_CHARACTERS);
    const usage = meter.billMessage(CHARACTERS_PER_TOKEN * 3);
    assert.deepEqual(usage, {
      inputTokens: FRESH_INPUT_TOKENS_PER_MESSAGE,
      outputTokens: OUTPUT_TOKENS_PER_MESSAGE + 3,
      cacheReadTokens: BASE_CONTEXT_TOKENS,
      cacheCreationTokens: PROMPT_TOKENS,
    });
  });

  it('reads the whole previous context from the cache and creates only what was appended since', () => {
    const meter = new RunMeter(PROMPT_CHARACTERS);
    const first = meter.billMessage(0);
    meter.appendToContext(CHARACTERS_PER_TOKEN * 5);
    const second = meter.billMessage(0);
    assert.equal(second.cacheReadTokens, BASE_CONTEXT_TOKENS + PROMPT_TOKENS + first.outputTokens);
    assert.equal(second.cacheCreationTokens, 5);
    assert.equal(meter.billMessage(0).cacheCreationTokens, 0);
  });

  it('sums the usage of every message, prices it and derives the durations from the work done', () => {
    const meter = new RunMeter(PROMPT_CHARACTERS);
    const messages = [meter.billMessage(10), meter.billMessage(100), meter.billMessage(0)];
    meter.countToolExecution();
    meter.countToolExecution();
    const summary = meter.summary();
    const total = (pick: (usage: (typeof messages)[number]) => number): number => messages.reduce((sum, usage) => sum + pick(usage), 0);
    assert.deepEqual(summary.usage, {
      inputTokens: total((usage) => usage.inputTokens),
      outputTokens: total((usage) => usage.outputTokens),
      cacheReadTokens: total((usage) => usage.cacheReadTokens),
      cacheCreationTokens: total((usage) => usage.cacheCreationTokens),
    });
    assert.equal(summary.costUsd, costOf(summary.usage));
    assert.equal(summary.turns, 3);
    const apiDuration = messages.length * API_MILLISECONDS_PER_MESSAGE + summary.usage.outputTokens * API_MILLISECONDS_PER_OUTPUT_TOKEN;
    assert.equal(summary.apiDurationMs, apiDuration);
    assert.equal(summary.durationMs, apiDuration + 2 * TOOL_MILLISECONDS);
  });

  it('reports no work for a run that billed nothing', () => {
    assert.deepEqual(new RunMeter(0).summary(), { usage: NO_USAGE, costUsd: 0, turns: 0, durationMs: 0, apiDurationMs: 0 });
  });

  it('gives the same figures for the same work, and more work always costs more', () => {
    const SEEDS = 100;
    const MAX_PROMPT_CHARACTERS = 2_000;
    const MAX_MESSAGES = 8;
    const MAX_MESSAGE_CHARACTERS = 500;
    const EXTRA_MESSAGE_CHARACTERS = 50;
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const random = seededRandom(seed);
      const promptCharacters = Math.floor(random() * MAX_PROMPT_CHARACTERS);
      const work = Array.from({ length: 1 + Math.floor(random() * MAX_MESSAGES) }, () => Math.floor(random() * MAX_MESSAGE_CHARACTERS));
      const summarise = (messages: readonly number[]): ReturnType<RunMeter['summary']> => {
        const meter = new RunMeter(promptCharacters);
        messages.forEach((characters) => meter.billMessage(characters));
        return meter.summary();
      };
      const first = summarise(work);
      assert.deepEqual(summarise(work), first);
      const longer = summarise([...work, EXTRA_MESSAGE_CHARACTERS]);
      assert.ok(longer.costUsd > first.costUsd);
      assert.ok(longer.durationMs > first.durationMs);
    }
  });
});
