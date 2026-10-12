import { errorMessage } from '../errors.ts';
import { TOOL_NAMES } from '../stream/stream-vocabulary.ts';
import type { WorkingTree } from '../workspace/working-tree.ts';
import { failedOutcome, type ToolCall, type ToolInput, type ToolOutcome } from './tool-call.ts';

const SAFE_SHELL_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;
const SINGLE_QUOTE = "'";
const ESCAPED_SINGLE_QUOTE = `'\\''`;

export function shellQuote(word: string): string {
  return SAFE_SHELL_WORD.test(word) ? word : `${SINGLE_QUOTE}${word.replaceAll(SINGLE_QUOTE, ESCAPED_SINGLE_QUOTE)}${SINGLE_QUOTE}`;
}

export class DeleteFileCall implements ToolCall {
  readonly toolName = TOOL_NAMES.bash;
  readonly toolInput: ToolInput;
  readonly #absolutePath: string;

  constructor(absolutePath: string, displayPath: string) {
    this.toolInput = { command: `rm -f ${shellQuote(absolutePath)}`, description: `Delete ${displayPath}` };
    this.#absolutePath = absolutePath;
  }

  async execute(tree: WorkingTree): Promise<ToolOutcome> {
    try {
      await tree.remove(this.#absolutePath);
      return { failed: false, content: '', detail: { stdout: '', stderr: '', interrupted: false, isImage: false } };
    } catch (error) {
      return failedOutcome(`rm: ${this.#absolutePath}: ${errorMessage(error)}`);
    }
  }
}
