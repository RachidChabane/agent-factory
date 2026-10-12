export class CommandSpawnError extends Error {
  readonly command: readonly string[];

  constructor(command: readonly string[], cause: unknown) {
    super(`Cannot start ${command.join(' ')}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = 'CommandSpawnError';
    this.command = command;
  }
}

export class CommandAbortedError extends Error {
  readonly command: readonly string[];

  constructor(command: readonly string[]) {
    super(`${command.join(' ')} was stopped because the factory is shutting down`);
    this.name = 'CommandAbortedError';
    this.command = command;
  }
}

export class EmptyCommandError extends Error {
  constructor() {
    super('A command needs at least an executable');
    this.name = 'EmptyCommandError';
  }
}
