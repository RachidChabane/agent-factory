import { errorMessage } from '../errors.ts';
import { TOOL_NAMES } from '../stream/stream-vocabulary.ts';
import type { WorkingTree } from '../workspace/working-tree.ts';
import { failedOutcome, type ToolCall, type ToolInput, type ToolOutcome } from './tool-call.ts';

const CREATED_TYPE = 'create';
const UPDATED_TYPE = 'update';

export class WriteFileCall implements ToolCall {
  readonly toolName = TOOL_NAMES.write;
  readonly toolInput: ToolInput;
  readonly #absolutePath: string;
  readonly #content: string;

  constructor(absolutePath: string, content: string) {
    this.toolInput = { file_path: absolutePath, content };
    this.#absolutePath = absolutePath;
    this.#content = content;
  }

  async execute(tree: WorkingTree): Promise<ToolOutcome> {
    try {
      const receipt = await tree.write(this.#absolutePath, this.#content);
      return receipt.created ? this.#created() : this.#updated(receipt.previousContent);
    } catch (error) {
      return failedOutcome(errorMessage(error));
    }
  }

  #created(): ToolOutcome {
    return {
      failed: false,
      content: `File created successfully at: ${this.#absolutePath} (file state is current in your context — no need to Read it back)`,
      detail: this.#detail(CREATED_TYPE, null),
    };
  }

  #updated(previousContent: string | null): ToolOutcome {
    return {
      failed: false,
      content: `The file ${this.#absolutePath} has been updated successfully.`,
      detail: this.#detail(UPDATED_TYPE, previousContent),
    };
  }

  #detail(type: string, originalFile: string | null): Readonly<Record<string, unknown>> {
    return {
      type,
      filePath: this.#absolutePath,
      content: this.#content,
      structuredPatch: [],
      originalFile,
      userModified: false,
    };
  }
}
