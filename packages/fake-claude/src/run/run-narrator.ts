import { hookOutcomeOf, hookOutputOf, type HookExecution } from '../hooks/hook-decisions.ts';
import type { HookNarration } from '../hooks/hook-dispatcher.ts';
import type { PendingToolCall } from '../hooks/hook-payloads.ts';
import { RunIds } from '../ids/deterministic-ids.ts';
import { RunMeter } from '../metering/metering.ts';
import {
  assistantLine,
  initLine,
  permissionDeniedLine,
  resultLine,
  syntheticUserLine,
  textBlock,
  toolResultLine,
  toolUseBlock,
  type ToolDenialRecord,
} from '../stream/conversation-lines.ts';
import { hookResponseLine, hookStartedLine, type HookIdentity } from '../stream/hook-lines.ts';
import { rateLimitLine, type RateLimitWindows } from '../stream/rate-limit-line.ts';
import type { Stamp } from '../stream/stream-line.ts';
import type { StreamSink } from '../stream/stream-sink.ts';
import type { HookEventName } from '../stream/stream-vocabulary.ts';
import type { ToolInput, ToolOutcome } from './tool-call.ts';

export interface NarratorSettings {
  readonly sessionId: string;
  readonly runNumber: number;
  readonly model: string;
  readonly promptCharacters: number;
}

export interface Opening {
  readonly workingDirectory: string;
  readonly tools: readonly string[];
  readonly permissionMode: string;
  readonly rateLimits: RateLimitWindows;
}

/** Turns what happens during a run into stream lines, keeping their ids and the token accounting consistent. */
export class RunNarrator implements HookNarration {
  readonly promptId: string;
  readonly #sink: StreamSink;
  readonly #sessionId: string;
  readonly #model: string;
  readonly #ids: RunIds;
  readonly #meter: RunMeter;
  readonly #denials: ToolDenialRecord[] = [];
  #lastAssistantText = '';

  constructor(sink: StreamSink, settings: NarratorSettings) {
    this.#sink = sink;
    this.#sessionId = settings.sessionId;
    this.#model = settings.model;
    this.#ids = new RunIds(settings.sessionId, settings.runNumber);
    this.#meter = new RunMeter(settings.promptCharacters);
    this.promptId = this.#ids.prompt();
  }

  get lastAssistantText(): string {
    return this.#lastAssistantText;
  }

  async open(opening: Opening): Promise<void> {
    await this.#sink.emit(
      initLine(this.#stamp(), {
        workingDirectory: opening.workingDirectory,
        tools: opening.tools,
        model: this.#model,
        permissionMode: opening.permissionMode,
      }),
    );
    await this.#sink.emit(rateLimitLine(this.#stamp(), opening.rateLimits));
  }

  async say(text: string): Promise<void> {
    this.#lastAssistantText = text;
    await this.#sink.emit(
      assistantLine(this.#stamp(), {
        id: this.#ids.message(),
        model: this.#model,
        block: textBlock(text),
        usage: this.#meter.billMessage(text.length),
      }),
    );
  }

  async announceToolUse(toolName: string, toolInput: ToolInput): Promise<string> {
    const toolUseId = this.#ids.toolUse();
    await this.#sink.emit(
      assistantLine(this.#stamp(), {
        id: this.#ids.message(),
        model: this.#model,
        block: toolUseBlock(toolUseId, toolName, toolInput),
        usage: this.#meter.billMessage(JSON.stringify(toolInput).length),
      }),
    );
    return toolUseId;
  }

  async reportToolResult(toolUseId: string, outcome: ToolOutcome): Promise<void> {
    this.#meter.countToolExecution();
    this.#meter.appendToContext(outcome.content.length);
    await this.#sink.emit(toolResultLine(this.#stamp(), { toolUseId, ...outcome }));
  }

  async reportDenial(call: PendingToolCall, reason: string): Promise<void> {
    this.#denials.push({ toolName: call.toolName, toolUseId: call.toolUseId, toolInput: call.toolInput });
    this.#meter.appendToContext(reason.length);
    await this.#sink.emit(
      permissionDeniedLine(this.#stamp(), { toolName: call.toolName, toolUseId: call.toolUseId, message: reason }),
    );
    await this.#sink.emit(
      toolResultLine(this.#stamp(), { toolUseId: call.toolUseId, content: reason, failed: true, detail: `Error: ${reason}` }),
    );
  }

  async hookStarted(hookName: string, hookEvent: HookEventName): Promise<HookIdentity> {
    const hook: HookIdentity = { hookId: this.#ids.hook(), hookName, hookEvent };
    await this.#sink.emit(hookStartedLine(this.#stamp(), hook));
    return hook;
  }

  async hookResponded(hook: HookIdentity, execution: HookExecution): Promise<void> {
    await this.#sink.emit(
      hookResponseLine(this.#stamp(), hook, {
        output: hookOutputOf(execution),
        stdout: execution.stdout,
        stderr: execution.stderr,
        exitCode: execution.exitCode,
        outcome: hookOutcomeOf(execution),
      }),
    );
  }

  async stopHookFeedback(feedback: string): Promise<void> {
    this.#meter.appendToContext(feedback.length);
    await this.#sink.emit(syntheticUserLine(this.#stamp(), feedback));
  }

  async close(): Promise<void> {
    await this.#sink.emit(
      resultLine(this.#stamp(), {
        summary: this.#meter.summary(),
        resultText: this.#lastAssistantText,
        denials: this.#denials,
      }),
    );
  }

  #stamp(): Stamp {
    return { sessionId: this.#sessionId, uuid: this.#ids.line() };
  }
}
