const NEWLINE = '\n';

export interface BoundedTailLimits {
  readonly maxLines: number;
  readonly maxCharacters: number;
}

export class BoundedTail {
  readonly #limits: BoundedTailLimits;
  #text = '';
  #truncated = false;

  constructor(limits: BoundedTailLimits) {
    this.#limits = limits;
  }

  append(chunk: string): void {
    this.#text += chunk;
    this.#trim();
  }

  get truncated(): boolean {
    return this.#truncated;
  }

  text(): string {
    return this.#text;
  }

  #trim(): void {
    if (this.#text.length > this.#limits.maxCharacters) {
      this.#text = this.#text.slice(this.#text.length - this.#limits.maxCharacters);
      this.#truncated = true;
    }
    const lines = this.#text.split(NEWLINE);
    const keptLineCount = this.#limits.maxLines + (this.#text.endsWith(NEWLINE) ? 1 : 0);
    if (lines.length > keptLineCount) {
      this.#text = lines.slice(lines.length - keptLineCount).join(NEWLINE);
      this.#truncated = true;
    }
  }
}

export function lastLines(text: string, maxLines: number): string {
  const tail = new BoundedTail({ maxLines, maxCharacters: Number.POSITIVE_INFINITY });
  tail.append(text);
  return tail.text();
}
