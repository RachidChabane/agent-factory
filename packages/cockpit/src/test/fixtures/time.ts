export const SECOND_MS = 1_000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

const ISO_DATE_LENGTH = 10;
const HASH_OFFSET = 0x811c9dc5;
const HASH_PRIME = 0x01000193;
const GENERATOR_MULTIPLIER = 1664525;
const GENERATOR_INCREMENT = 1013904223;
const GENERATOR_MODULUS = 0x100000000;
const HEX_DIGITS_PER_DRAW = 4;
const HEX_RADIX = 16;
const DRAW_RANGE = 0x10000;

const COMMIT_SHA_LENGTH = 40;
const CONTENT_HASH_LENGTH = 64;

/** Every timestamp of a world is an offset from one instant, so building a world is a pure function of `now`. */
export interface FixtureClock {
  readonly now: number;
  at(offsetMs: number): string;
  secondsAgo(seconds: number): string;
  minutesAgo(minutes: number): string;
  hoursAgo(hours: number): string;
  daysAgo(days: number): string;
  inMinutes(minutes: number): string;
  inHours(hours: number): string;
  dateDaysAgo(days: number): string;
}

export function fixtureClock(now: number): FixtureClock {
  const at = (offsetMs: number): string => new Date(now + offsetMs).toISOString();
  return {
    now,
    at,
    secondsAgo: (seconds) => at(-seconds * SECOND_MS),
    minutesAgo: (minutes) => at(-minutes * MINUTE_MS),
    hoursAgo: (hours) => at(-hours * HOUR_MS),
    daysAgo: (days) => at(-days * DAY_MS),
    inMinutes: (minutes) => at(minutes * MINUTE_MS),
    inHours: (hours) => at(hours * HOUR_MS),
    dateDaysAgo: (days) => at(-days * DAY_MS).slice(0, ISO_DATE_LENGTH),
  };
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * GENERATOR_MULTIPLIER + GENERATOR_INCREMENT) >>> 0;
    return state / GENERATOR_MODULUS;
  };
}

function seedOf(text: string): number {
  let hash = HASH_OFFSET;
  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, HASH_PRIME);
  }
  return hash >>> 0;
}

/** A stable hexadecimal digest of a seed, as long as asked. */
export function hexDigest(seed: string, length: number): string {
  const next = seededRandom(seedOf(seed));
  let digest = '';
  while (digest.length < length) {
    digest += Math.floor(next() * DRAW_RANGE)
      .toString(HEX_RADIX)
      .padStart(HEX_DIGITS_PER_DRAW, '0');
  }
  return digest.slice(0, length);
}

/** A commit identifier derived from a seed. */
export function sha(seed: string): string {
  return hexDigest(seed, COMMIT_SHA_LENGTH);
}

/** The content hash a frozen acceptance check carries. */
export function contentHash(seed: string): string {
  return hexDigest(seed, CONTENT_HASH_LENGTH);
}

/** A number of hours, as minutes, for the offsets of a world that are written in minutes. */
export function hours(count: number): number {
  return count * MINUTES_PER_HOUR;
}

export function days(count: number): number {
  return count * MINUTES_PER_DAY;
}
