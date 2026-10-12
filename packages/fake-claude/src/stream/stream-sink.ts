import { appendFile } from 'node:fs/promises';
import type { Writable } from 'node:stream';
import { hasErrorCode } from '../errors.ts';
import type { StreamLine } from './stream-line.ts';

const LINE_TERMINATOR = '\n';
const BROKEN_PIPE = 'EPIPE';

export interface StreamSink {
  emit(line: StreamLine): Promise<void>;
}

export function serializeLine(line: StreamLine): string {
  return `${JSON.stringify(line)}${LINE_TERMINATOR}`;
}

export function writeText(output: Writable, text: string): Promise<void> {
  return new Promise((resolve) => {
    output.write(text, () => resolve());
  });
}

/** Writes each line to a stream and resolves once the stream accepted it, so output keeps pace with the run. */
export class WritableSink implements StreamSink {
  readonly #output: Writable;

  constructor(output: Writable) {
    this.#output = output;
    output.on('error', rethrowUnlessBrokenPipe);
  }

  emit(line: StreamLine): Promise<void> {
    return writeText(this.#output, serializeLine(line));
  }
}

function rethrowUnlessBrokenPipe(error: Error): void {
  if (!hasErrorCode(error, BROKEN_PIPE)) {
    throw error;
  }
}

export class FileSink implements StreamSink {
  readonly #file: string;

  constructor(file: string) {
    this.#file = file;
  }

  async emit(line: StreamLine): Promise<void> {
    await appendFile(this.#file, serializeLine(line));
  }
}

export class TeeSink implements StreamSink {
  readonly #sinks: readonly StreamSink[];

  constructor(sinks: readonly StreamSink[]) {
    this.#sinks = sinks;
  }

  async emit(line: StreamLine): Promise<void> {
    for (const sink of this.#sinks) {
      await sink.emit(line);
    }
  }
}
