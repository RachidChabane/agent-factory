const INCREMENT = 0x6d2b79f5;
const FIRST_SHIFT = 15;
const SECOND_SHIFT = 7;
const THIRD_SHIFT = 14;
const SECOND_MULTIPLIER = 61;
const UNIT_INTERVAL_DIVISOR = 4_294_967_296;

/** A small deterministic generator (mulberry32) so generated tests replay the same cases on every run. */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + INCREMENT) | 0;
    let mixed = Math.imul(state ^ (state >>> FIRST_SHIFT), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> SECOND_SHIFT), SECOND_MULTIPLIER | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> THIRD_SHIFT)) >>> 0) / UNIT_INTERVAL_DIVISOR;
  };
}

export function shuffled<T>(items: readonly T[], random: () => number): readonly T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const kept = result[index];
    const swapped = result[other];
    if (kept !== undefined && swapped !== undefined) {
      result[index] = swapped;
      result[other] = kept;
    }
  }
  return result;
}
