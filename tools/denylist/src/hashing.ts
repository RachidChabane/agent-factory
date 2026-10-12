import { createHash } from 'node:crypto';

export const ROLLING_HASH_BASE = 257;
export const ROLLING_HASH_MODULUS = 2_147_483_647;
const HEX = 'hex';
const UTF8 = 'utf8';

/** Lower-cases character by character, keeping every offset of the input valid. */
export function normalize(text: string): string {
  const lowered = text.toLowerCase();
  if (lowered.length === text.length) {
    return lowered;
  }
  let result = '';
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    const lower = character.toLowerCase();
    result += lower.length === character.length ? lower : character;
  }
  return result;
}

export function rollingHash(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * ROLLING_HASH_BASE + text.charCodeAt(index)) % ROLLING_HASH_MODULUS;
  }
  return hash;
}

export function highestPower(length: number): number {
  let power = 1;
  for (let index = 1; index < length; index += 1) {
    power = (power * ROLLING_HASH_BASE) % ROLLING_HASH_MODULUS;
  }
  return power;
}

export function rollForward(hash: number, outgoing: number, incoming: number, power: number): number {
  const withoutOutgoing = (hash - ((outgoing * power) % ROLLING_HASH_MODULUS) + ROLLING_HASH_MODULUS) % ROLLING_HASH_MODULUS;
  return (withoutOutgoing * ROLLING_HASH_BASE + incoming) % ROLLING_HASH_MODULUS;
}

export function digest(salt: string, text: string): string {
  return createHash('sha256').update(salt, UTF8).update(text, UTF8).digest(HEX);
}
