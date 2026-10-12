const NEWLINE_BYTE = 0x0a;
const CARRIAGE_RETURN = '\r';
const UTF8 = 'utf8';

export type LineListener = (line: string, truncated: boolean) => void;

export class BoundedLineSplitter {
  readonly #maxLineBytes: number;
  readonly #onLine: LineListener;
  #pending: Buffer[] = [];
  #pendingBytes = 0;
  #truncated = false;

  constructor(maxLineBytes: number, onLine: LineListener) {
    this.#maxLineBytes = maxLineBytes;
    this.#onLine = onLine;
  }

  push(chunk: Buffer): void {
    let start = 0;
    let newline = chunk.indexOf(NEWLINE_BYTE, start);
    while (newline !== -1) {
      this.#retain(chunk.subarray(start, newline));
      this.#emit();
      start = newline + 1;
      newline = chunk.indexOf(NEWLINE_BYTE, start);
    }
    this.#retain(chunk.subarray(start));
  }

  flush(): void {
    if (this.#pendingBytes > 0 || this.#truncated) {
      this.#emit();
    }
  }

  #retain(part: Buffer): void {
    const room = this.#maxLineBytes - this.#pendingBytes;
    if (part.length > room) {
      this.#truncated = true;
    }
    const kept = part.length > room ? part.subarray(0, room) : part;
    if (kept.length > 0) {
      this.#pending.push(Buffer.from(kept));
      this.#pendingBytes += kept.length;
    }
  }

  #emit(): void {
    const line = Buffer.concat(this.#pending).toString(UTF8);
    const truncated = this.#truncated;
    this.#pending = [];
    this.#pendingBytes = 0;
    this.#truncated = false;
    const withoutCarriageReturn = line.endsWith(CARRIAGE_RETURN) ? line.slice(0, -CARRIAGE_RETURN.length) : line;
    if (withoutCarriageReturn.trim() !== '' || truncated) {
      this.#onLine(withoutCarriageReturn, truncated);
    }
  }
}
