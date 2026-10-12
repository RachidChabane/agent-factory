import type { TokenUsage } from '../metering/metering.ts';

export type StreamLine = Readonly<Record<string, unknown>>;

export interface Stamp {
  readonly sessionId: string;
  readonly uuid: string;
}

const SERVICE_TIER = 'standard';

export function stampFields(stamp: Stamp): { readonly session_id: string; readonly uuid: string } {
  return { session_id: stamp.sessionId, uuid: stamp.uuid };
}

export function usageFields(usage: TokenUsage): Readonly<Record<string, number | string>> {
  return {
    input_tokens: usage.inputTokens,
    cache_creation_input_tokens: usage.cacheCreationTokens,
    cache_read_input_tokens: usage.cacheReadTokens,
    output_tokens: usage.outputTokens,
    service_tier: SERVICE_TIER,
  };
}
