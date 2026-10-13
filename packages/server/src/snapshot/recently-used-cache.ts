/**
 * A cache of at most `capacity` entries. Past that, a new entry evicts the one used least recently, where reading an entry
 * or setting it counts as using it. A Map lists its keys in the order they were last set, so the first key is the oldest use.
 */
export class RecentlyUsedCache<Key, Value> {
  private readonly entries = new Map<Key, Value>();
  private readonly capacity: number;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError(`a cache holds at least one entry, not ${capacity}`);
    this.capacity = capacity;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: Key): Value | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) this.use(key, value);
    return value;
  }

  set(key: Key, value: Value): void {
    this.use(key, value);
    while (this.entries.size > this.capacity) this.evictOldest();
  }

  private use(key: Key, value: Value): void {
    this.entries.delete(key);
    this.entries.set(key, value);
  }

  private evictOldest(): void {
    const [oldest] = this.entries.keys();
    if (oldest !== undefined) this.entries.delete(oldest);
  }
}
