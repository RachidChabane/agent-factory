import { addTokenUsage, NO_TOKENS, type TokenUsage } from '@agent-factory/domain';
import type { GateStepView, RunLogEvent, SubscriptionWindowView } from '../../contract/index.ts';
import { hexDigest } from './time.ts';
import { costOf, FRESH_CONTEXT_TOKENS, usageOfTurn } from './token-model.ts';

/** One event of a session and the relative time the agent spent before it happened. */
export interface ScriptStep {
  readonly weight: number;
  readonly event: RunLogEvent;
}

export const SUBAGENT_TOOL = 'Task';

const SESSION_WEIGHT = 900;
const SAY_WEIGHT = 2_600;
const CALL_WEIGHT = 3_000;
const RESULT_WEIGHT = 300;
const LONG_RESULT_WEIGHT = 4_000;
const BOOKKEEPING_WEIGHT = 120;
const TOOL_ID_DIGITS = 22;

export interface ToolOptions {
  readonly isError?: boolean;
  readonly parent?: string | null;
  readonly long?: boolean;
}

export interface SayOptions {
  readonly parent?: string | null;
  /** Whether the usage report of the turn comes after the text (the default) or before it. */
  readonly usage?: 'before' | 'after';
}

/**
 * Writes the events of an agent session in the order the CLI streams them: a model turn adds
 * its tokens to the running totals, and the totals are reported after the turn.
 */
export class ScriptBuilder {
  private readonly steps: ScriptStep[] = [];
  private readonly prefix: string;
  private readonly model: string;
  private toolCount = 0;
  private turns = 0;
  private usage: TokenUsage = NO_TOKENS;

  private readonly contextTokens: number;

  constructor(prefix: string, model: string, contextTokens: number = FRESH_CONTEXT_TOKENS) {
    this.prefix = prefix;
    this.model = model;
    this.contextTokens = contextTokens;
  }

  get turnCount(): number {
    return this.turns;
  }

  session(): this {
    return this.push(SESSION_WEIGHT, { kind: 'session-started', sessionId: `${this.prefix}-session`, model: this.model });
  }

  say(text: string, options: SayOptions = {}): this {
    const parent = options.parent ?? null;
    if (parent !== null) return this.push(CALL_WEIGHT, { kind: 'assistant-text', text, parentToolUseId: parent });
    this.takeTurn();
    const usageFirst = options.usage === 'before';
    if (usageFirst) this.reportUsage();
    this.push(SAY_WEIGHT, { kind: 'assistant-text', text, parentToolUseId: null });
    if (!usageFirst) this.reportUsage();
    return this;
  }

  /**
   * A tool call whose result has not arrived yet; the identifier lets the caller answer it later.
   * Calls made together in one turn pass `sameTurn` after the first.
   */
  call(toolName: string, input: unknown, parent: string | null = null, sameTurn = false): string {
    this.toolCount += 1;
    const toolUseId = `toolu_${hexDigest(`${this.prefix}:${this.toolCount}`, TOOL_ID_DIGITS)}`;
    if (parent === null && !sameTurn) this.takeTurn();
    this.push(CALL_WEIGHT, { kind: 'tool-call', toolUseId, toolName, input, parentToolUseId: parent });
    return toolUseId;
  }

  result(toolUseId: string, content: string, options: ToolOptions = {}): this {
    const weight = options.long === true ? LONG_RESULT_WEIGHT : RESULT_WEIGHT;
    return this.push(weight, { kind: 'tool-result', toolUseId, isError: options.isError ?? false, content });
  }

  tool(toolName: string, input: unknown, content: string, options: ToolOptions = {}): this {
    const toolUseId = this.call(toolName, input, options.parent ?? null);
    return this.result(toolUseId, content, options);
  }

  /** A subagent that has finished: its own calls carry the Task call as their parent. */
  subagent(description: string, agentType: string, body: (parent: string) => void, summary: string): this {
    const toolUseId = this.call(SUBAGENT_TOOL, { description, subagent_type: agentType, prompt: description });
    body(toolUseId);
    return this.result(toolUseId, summary);
  }

  permissionDenied(toolName: string, message: string): this {
    return this.push(BOOKKEEPING_WEIGHT, { kind: 'permission-denied', toolName, message });
  }

  hook(hookEvent: string, exitCode: number | null, output: string): this {
    return this.push(CALL_WEIGHT, { kind: 'hook', hookEvent, exitCode, output });
  }

  raw(line: Readonly<Record<string, unknown>>): this {
    return this.push(BOOKKEEPING_WEIGHT, { kind: 'raw', line: JSON.stringify(line) });
  }

  rateLimit(snapshots: readonly SubscriptionWindowView[]): this {
    return this.push(BOOKKEEPING_WEIGHT, { kind: 'rate-limit', snapshots: [...snapshots] });
  }

  gate(steps: readonly GateStepView[]): this {
    const passed = steps.every((step) => step.outcome !== 'failed');
    return this.push(LONG_RESULT_WEIGHT, { kind: 'gate', passed, steps: [...steps] });
  }

  progress(): this {
    return this.push(BOOKKEEPING_WEIGHT, { kind: 'progress', usage: this.usage, turns: this.turns });
  }

  reportUsage(): this {
    return this.push(BOOKKEEPING_WEIGHT, { kind: 'usage', usage: this.usage, costUsd: costOf(this.model, this.usage), turns: this.turns });
  }

  build(): readonly ScriptStep[] {
    return this.steps;
  }

  private takeTurn(): void {
    this.turns += 1;
    this.usage = addTokenUsage(this.usage, usageOfTurn(this.turns, this.contextTokens));
  }

  private push(weight: number, event: RunLogEvent): this {
    this.steps.push({ weight, event });
    return this;
  }
}
