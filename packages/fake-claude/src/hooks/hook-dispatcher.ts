import type { HookIdentity } from '../stream/hook-lines.ts';
import { HOOK_EVENTS, type HookEventName } from '../stream/stream-vocabulary.ts';
import { MILLISECONDS_PER_SECOND } from '../time.ts';
import { stopDecisionOf, toolDecisionOf, TOOL_ALLOWED, type HookExecution, type ToolDecision } from './hook-decisions.ts';
import {
  preToolUsePayload,
  stopPayload,
  type HookContext,
  type PendingToolCall,
  type StopInquiry,
} from './hook-payloads.ts';
import type { HookRunner } from './hook-runner.ts';
import { allHooks, hooksMatching, type CommandHook, type HookConfiguration } from './hook-settings.ts';

export interface HookNarration {
  hookStarted(hookName: string, hookEvent: HookEventName): Promise<HookIdentity>;
  hookResponded(hook: HookIdentity, execution: HookExecution): Promise<void>;
}

export type StopVerdict = { readonly blocked: false } | { readonly blocked: true; readonly feedback: string };

const NOT_BLOCKED: StopVerdict = { blocked: false };
const FEEDBACK_HEADER = 'Stop hook feedback:';
const LINE_BREAK = '\n';

export class HookDispatcher {
  readonly #configuration: HookConfiguration;
  readonly #runner: HookRunner;
  readonly #narration: HookNarration;
  readonly #context: HookContext;

  constructor(configuration: HookConfiguration, runner: HookRunner, narration: HookNarration, context: HookContext) {
    this.#configuration = configuration;
    this.#runner = runner;
    this.#narration = narration;
    this.#context = context;
  }

  async beforeTool(call: PendingToolCall): Promise<ToolDecision> {
    const payload = preToolUsePayload(this.#context, call);
    const hookName = `${HOOK_EVENTS.preToolUse}:${call.toolName}`;
    const decisions: ToolDecision[] = [];
    for (const hook of hooksMatching(this.#configuration.preToolUse, call.toolName)) {
      decisions.push(toolDecisionOf(await this.#execute(hook, HOOK_EVENTS.preToolUse, hookName, payload)));
    }
    return decisions.find((decision) => !decision.allowed) ?? TOOL_ALLOWED;
  }

  async onStop(inquiry: StopInquiry): Promise<StopVerdict> {
    const payload = stopPayload(this.#context, inquiry);
    const objections: string[] = [];
    for (const hook of allHooks(this.#configuration.stop)) {
      const decision = stopDecisionOf(await this.#execute(hook, HOOK_EVENTS.stop, HOOK_EVENTS.stop, payload));
      if (decision.blocked) {
        objections.push(`[${hook.command}]: ${decision.reason}`);
      }
    }
    return objections.length === 0 ? NOT_BLOCKED : { blocked: true, feedback: feedbackOf(objections) };
  }

  async #execute(hook: CommandHook, hookEvent: HookEventName, hookName: string, payload: unknown): Promise<HookExecution> {
    const identity = await this.#narration.hookStarted(hookName, hookEvent);
    const execution = await this.#runner.run({
      command: hook.command,
      payload,
      workingDirectory: this.#context.workingDirectory,
      timeoutMs: hook.timeoutSeconds * MILLISECONDS_PER_SECOND,
    });
    await this.#narration.hookResponded(identity, execution);
    return execution;
  }
}

function feedbackOf(objections: readonly string[]): string {
  return `${[FEEDBACK_HEADER, ...objections].join(LINE_BREAK)}${LINE_BREAK}`;
}
