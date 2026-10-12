import type { WorkingTree } from '../workspace/working-tree.ts';

export type ToolInput = Readonly<Record<string, unknown>>;

export interface ToolOutcome {
  readonly failed: boolean;
  readonly content: string;
  readonly detail: unknown;
}

export interface ToolCall {
  readonly toolName: string;
  readonly toolInput: ToolInput;
  execute(tree: WorkingTree): Promise<ToolOutcome>;
}

export function failedOutcome(message: string): ToolOutcome {
  return { failed: true, content: message, detail: `Error: ${message}` };
}
