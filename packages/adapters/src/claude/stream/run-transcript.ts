import type { AgentRunEvent } from '@agent-factory/application';
import { STOP_HOOK_EVENT, isStopBlock } from '@agent-factory/plugin';
import type { StopHookResponse } from '../run-outcome.ts';
import { BoundedLineSplitter } from './bounded-line-splitter.ts';
import { parseStreamLine } from './stream-parser.ts';
import type { ResultLine } from './stream-schemas.ts';
import { UsageTally } from './usage-tally.ts';

export type EventListener = (event: AgentRunEvent) => void;

export class RunTranscript {
  readonly #onEvent: EventListener;
  readonly #onListenerFailure: () => void;
  readonly #splitter: BoundedLineSplitter;
  #sessionId: string | null = null;
  #result: ResultLine | null = null;
  #lastAssistantText: string | null = null;
  readonly #stopHookResponses: StopHookResponse[] = [];
  #listenerError: Error | null = null;
  readonly #usage = new UsageTally();

  constructor(maxLineBytes: number, onEvent: EventListener, onListenerFailure: () => void) {
    this.#onEvent = onEvent;
    this.#onListenerFailure = onListenerFailure;
    this.#splitter = new BoundedLineSplitter(maxLineBytes, (line, truncated) => this.#accept(line, truncated));
  }

  push(chunk: Buffer): void {
    this.#splitter.push(chunk);
  }

  end(): void {
    this.#splitter.flush();
  }

  get sessionId(): string | null {
    return this.#sessionId ?? this.#result?.session_id ?? null;
  }

  get result(): ResultLine | null {
    return this.#result;
  }

  get lastAssistantText(): string | null {
    return this.#lastAssistantText;
  }

  get stopHookResponses(): readonly StopHookResponse[] {
    return this.#stopHookResponses;
  }

  get listenerError(): Error | null {
    return this.#listenerError;
  }

  #accept(line: string, truncated: boolean): void {
    if (truncated) {
      this.#emit({ kind: 'raw', line });
      return;
    }
    const parsed = parseStreamLine(line);
    this.#sessionId ??= parsed.sessionId;
    this.#result = parsed.result ?? this.#result;
    parsed.events.forEach((event) => this.#emit(event));
    if (parsed.usage !== null && this.#usage.observe(parsed.usage)) this.#emit({ kind: 'progress', ...this.#usage.progress() });
  }

  #emit(event: AgentRunEvent): void {
    if (event.kind === 'assistant-text' && event.parentToolUseId === null) {
      this.#lastAssistantText = event.text;
    }
    if (event.kind === 'hook' && event.hookEvent === STOP_HOOK_EVENT) {
      this.#stopHookResponses.push({ blocked: isStopBlock(event.exitCode, event.output) });
    }
    if (this.#listenerError !== null) {
      return;
    }
    try {
      this.#onEvent(event);
    } catch (error) {
      this.#listenerError = error instanceof Error ? error : new Error(String(error));
      this.#onListenerFailure();
    }
  }
}
