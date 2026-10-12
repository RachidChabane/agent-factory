export class TailBuffer {
  private chunks: Buffer[] = [];
  private size = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  append(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.size += chunk.length;
    this.dropOverflow();
  }

  toString(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }

  private dropOverflow(): void {
    while (this.size > this.capacity) {
      const first = this.chunks[0];
      if (first === undefined) return;
      const excess = this.size - this.capacity;
      if (first.length <= excess) {
        this.chunks.shift();
        this.size -= first.length;
      } else {
        this.chunks[0] = first.subarray(excess);
        this.size -= excess;
      }
    }
  }
}
