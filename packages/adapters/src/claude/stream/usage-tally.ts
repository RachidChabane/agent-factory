import type { TokenUsage } from '@agent-factory/domain';
import { AssistantUsageSchema, MessageDeltaSchema, MessageStartSchema, type MessageUsage } from './stream-schemas.ts';

export interface UsageObservation {
  readonly messageId: string | null;
  readonly mainThread: boolean;
  readonly usage: MessageUsage;
}

export interface UsageProgress {
  readonly usage: TokenUsage;
  readonly turns: number;
}

interface MessageTally {
  readonly mainThread: boolean;
  readonly usage: TokenUsage;
}

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

export function usageObservationOf(value: unknown): UsageObservation | null {
  const assistant = AssistantUsageSchema.safeParse(value);
  if (assistant.success) {
    const { message, parent_tool_use_id: parent } = assistant.data;
    return { messageId: message.id, mainThread: (parent ?? null) === null, usage: message.usage };
  }
  const start = MessageStartSchema.safeParse(value);
  if (start.success) {
    const { event, parent_tool_use_id: parent } = start.data;
    return { messageId: event.message.id, mainThread: (parent ?? null) === null, usage: event.message.usage };
  }
  const delta = MessageDeltaSchema.safeParse(value);
  return delta.success ? { messageId: null, mainThread: true, usage: delta.data.event.usage } : null;
}

function grown(previous: TokenUsage, usage: MessageUsage): TokenUsage {
  return {
    inputTokens: Math.max(previous.inputTokens, usage.input_tokens ?? 0),
    outputTokens: Math.max(previous.outputTokens, usage.output_tokens ?? 0),
    cacheReadTokens: Math.max(previous.cacheReadTokens, usage.cache_read_input_tokens ?? 0),
    cacheCreationTokens: Math.max(previous.cacheCreationTokens, usage.cache_creation_input_tokens ?? 0),
  };
}

function sameUsage(a: TokenUsage, b: TokenUsage): boolean {
  return a.inputTokens === b.inputTokens && a.outputTokens === b.outputTokens && a.cacheReadTokens === b.cacheReadTokens && a.cacheCreationTokens === b.cacheCreationTokens;
}

export class UsageTally {
  readonly #messages = new Map<string, MessageTally>();
  #currentMessageId: string | null = null;

  observe(observation: UsageObservation): boolean {
    const messageId = observation.messageId ?? this.#currentMessageId;
    if (messageId === null) return false;
    if (observation.messageId !== null) this.#currentMessageId = observation.messageId;
    const previous = this.#messages.get(messageId);
    const usage = grown(previous?.usage ?? ZERO_USAGE, observation.usage);
    if (previous !== undefined && sameUsage(previous.usage, usage)) return false;
    this.#messages.set(messageId, { mainThread: previous?.mainThread ?? observation.mainThread, usage });
    return true;
  }

  progress(): UsageProgress {
    const tallies = [...this.#messages.values()];
    const usage = tallies.reduce<TokenUsage>(
      (total, tally) => ({
        inputTokens: total.inputTokens + tally.usage.inputTokens,
        outputTokens: total.outputTokens + tally.usage.outputTokens,
        cacheReadTokens: total.cacheReadTokens + tally.usage.cacheReadTokens,
        cacheCreationTokens: total.cacheCreationTokens + tally.usage.cacheCreationTokens,
      }),
      ZERO_USAGE,
    );
    return { usage, turns: tallies.filter((tally) => tally.mainThread).length };
  }
}
