import type { ToolDecision } from '../hooks/hook-decisions.ts';
import type { PendingToolCall } from '../hooks/hook-payloads.ts';
import type { WorkingTree } from '../workspace/working-tree.ts';
import type { RunNarrator } from './run-narrator.ts';
import type { Stage } from './step-actions.ts';
import type { ToolCall } from './tool-call.ts';

export interface ToolGate {
  beforeTool(call: PendingToolCall): Promise<ToolDecision>;
}

/** Where the steps of an attempt play out: text goes to the stream, tool calls go through the hooks first. */
export class RunStage implements Stage {
  readonly #narrator: RunNarrator;
  readonly #gate: ToolGate;
  readonly #tree: WorkingTree;

  constructor(narrator: RunNarrator, gate: ToolGate, tree: WorkingTree) {
    this.#narrator = narrator;
    this.#gate = gate;
    this.#tree = tree;
  }

  say(text: string): Promise<void> {
    return this.#narrator.say(text);
  }

  async useTool(call: ToolCall): Promise<void> {
    const toolUseId = await this.#narrator.announceToolUse(call.toolName, call.toolInput);
    const pending: PendingToolCall = { toolName: call.toolName, toolInput: call.toolInput, toolUseId };
    const decision = await this.#gate.beforeTool(pending);
    if (!decision.allowed) {
      await this.#narrator.reportDenial(pending, decision.reason);
      return;
    }
    await this.#narrator.reportToolResult(toolUseId, await call.execute(this.#tree));
  }
}
