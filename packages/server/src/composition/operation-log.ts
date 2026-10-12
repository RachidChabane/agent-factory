import type { Clock, OperationLog } from '@agent-factory/application';

const INFO = 'info';
const WARN = 'warn';

export class StreamOperationLog implements OperationLog {
  private readonly write: (line: string) => void;
  private readonly clock: Clock;

  constructor(write: (line: string) => void, clock: Clock) {
    this.write = write;
    this.clock = clock;
  }

  info(message: string): void {
    this.write(`${this.clock.now().toISOString()} ${INFO} ${message}`);
  }

  warn(message: string): void {
    this.write(`${this.clock.now().toISOString()} ${WARN} ${message}`);
  }
}

export const SILENT_LOG: OperationLog = { info: () => undefined, warn: () => undefined };
