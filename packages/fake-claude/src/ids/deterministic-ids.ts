import { createHash } from 'node:crypto';

const HASH_ALGORITHM = 'sha256';
const HEX = 'hex';
const HEX_RADIX = 16;
const UUID_DIGITS = 32;
const UUID_VERSION_POSITION = 12;
const UUID_VARIANT_POSITION = 16;
const UUID_VERSION_DIGIT = '4';
const UUID_VARIANT_MASK = 0x3;
const UUID_VARIANT_MARKER = 0x8;
const UUID_GROUP_SIZES = [8, 4, 4, 4, 12] as const;
const UUID_GROUP_SEPARATOR = '-';
const API_IDENTIFIER_DIGITS = 24;
const MESSAGE_ID_PREFIX = 'msg_';
const TOOL_USE_ID_PREFIX = 'toolu_';
const SEED_SEPARATOR = '/';

export const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function digestOf(seed: string): string {
  return createHash(HASH_ALGORITHM).update(seed).digest(HEX);
}

export function uuidFrom(seed: string): string {
  const digits = [...digestOf(seed).slice(0, UUID_DIGITS)];
  digits[UUID_VERSION_POSITION] = UUID_VERSION_DIGIT;
  digits[UUID_VARIANT_POSITION] = variantDigitOf(digits[UUID_VARIANT_POSITION] ?? '0');
  return groupDigits(digits.join(''));
}

function variantDigitOf(digit: string): string {
  return ((Number.parseInt(digit, HEX_RADIX) & UUID_VARIANT_MASK) | UUID_VARIANT_MARKER).toString(HEX_RADIX);
}

function groupDigits(digits: string): string {
  let offset = 0;
  return UUID_GROUP_SIZES.map((size) => {
    const group = digits.slice(offset, offset + size);
    offset += size;
    return group;
  }).join(UUID_GROUP_SEPARATOR);
}

export function sessionIdOf(sessionNumber: number): string {
  return uuidFrom(['session', String(sessionNumber)].join(SEED_SEPARATOR));
}

export type IdKind = 'line' | 'hook' | 'prompt' | 'message' | 'tool-use';

export class RunIds {
  readonly #namespace: string;
  readonly #counters = new Map<IdKind, number>();

  constructor(sessionId: string, runNumber: number) {
    this.#namespace = [sessionId, String(runNumber)].join(SEED_SEPARATOR);
  }

  line(): string {
    return uuidFrom(this.#next('line'));
  }

  hook(): string {
    return uuidFrom(this.#next('hook'));
  }

  prompt(): string {
    return uuidFrom(this.#next('prompt'));
  }

  message(): string {
    return `${MESSAGE_ID_PREFIX}${digestOf(this.#next('message')).slice(0, API_IDENTIFIER_DIGITS)}`;
  }

  toolUse(): string {
    return `${TOOL_USE_ID_PREFIX}${digestOf(this.#next('tool-use')).slice(0, API_IDENTIFIER_DIGITS)}`;
  }

  #next(kind: IdKind): string {
    const sequence = (this.#counters.get(kind) ?? 0) + 1;
    this.#counters.set(kind, sequence);
    return [this.#namespace, kind, String(sequence)].join(SEED_SEPARATOR);
  }
}
