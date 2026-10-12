import type { Step } from '../scenario/scenario.ts';
import type { WorkingTree } from '../workspace/working-tree.ts';
import { DeleteFileCall } from './delete-file-call.ts';
import type { ToolCall } from './tool-call.ts';
import { WriteFileCall } from './write-file-call.ts';

export interface Stage {
  say(text: string): Promise<void>;
  useTool(call: ToolCall): Promise<void>;
}

export interface StepAction {
  perform(stage: Stage): Promise<void>;
}

class SayAction implements StepAction {
  readonly #text: string;

  constructor(text: string) {
    this.#text = text;
  }

  perform(stage: Stage): Promise<void> {
    return stage.say(this.#text);
  }
}

class ToolAction implements StepAction {
  readonly #call: ToolCall;

  constructor(call: ToolCall) {
    this.#call = call;
  }

  perform(stage: Stage): Promise<void> {
    return stage.useTool(this.#call);
  }
}

export function actionFor(step: Step, tree: WorkingTree): StepAction {
  switch (step.kind) {
    case 'say':
      return new SayAction(step.text);
    case 'write':
      return new ToolAction(new WriteFileCall(tree.absolute(step.path), step.content));
    case 'delete':
      return new ToolAction(new DeleteFileCall(tree.absolute(step.path), step.path));
  }
}
