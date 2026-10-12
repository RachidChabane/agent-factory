export class InvalidToolDeclarationError extends Error {
  readonly tool: string;

  constructor(tool: string, problem: string) {
    super(`The tool ${JSON.stringify(tool)} cannot be probed: ${problem}`);
    this.name = 'InvalidToolDeclarationError';
    this.tool = tool;
  }
}
