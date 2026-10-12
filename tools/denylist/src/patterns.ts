/**
 * The pattern file is read by the git hooks before any dependency is installed, so it is
 * validated by hand rather than with a schema library.
 */
export const PATTERN_FILE_VERSION = 1;

const SHA256_HEX = /^[0-9a-f]{64}$/;
const SALT_HEX = /^[0-9a-f]{32,}$/;

export interface DenylistPattern {
  readonly category: string;
  readonly length: number;
  readonly rolling: number;
  readonly sha256: string;
}

export interface DenylistFile {
  readonly version: typeof PATTERN_FILE_VERSION;
  readonly salt: string;
  readonly patterns: readonly DenylistPattern[];
}

export class InvalidPatternFileError extends Error {
  constructor(reason: string) {
    super(`invalid denylist pattern file: ${reason}`);
    this.name = 'InvalidPatternFileError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePattern(value: unknown, index: number): DenylistPattern {
  if (!isRecord(value)) {
    throw new InvalidPatternFileError(`patterns[${index}] is not an object`);
  }
  const { category, length, rolling, sha256 } = value;
  if (typeof category !== 'string' || category === '') {
    throw new InvalidPatternFileError(`patterns[${index}].category must be a non-empty string`);
  }
  if (typeof length !== 'number' || !Number.isInteger(length) || length <= 0) {
    throw new InvalidPatternFileError(`patterns[${index}].length must be a positive integer`);
  }
  if (typeof rolling !== 'number' || !Number.isInteger(rolling) || rolling < 0) {
    throw new InvalidPatternFileError(`patterns[${index}].rolling must be a non-negative integer`);
  }
  if (typeof sha256 !== 'string' || !SHA256_HEX.test(sha256)) {
    throw new InvalidPatternFileError(`patterns[${index}].sha256 must be 64 lowercase hexadecimal characters`);
  }
  return { category, length, rolling, sha256 };
}

export function parseDenylistFile(text: string): DenylistFile {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) {
    throw new InvalidPatternFileError('the root is not an object');
  }
  if (value['version'] !== PATTERN_FILE_VERSION) {
    throw new InvalidPatternFileError(`version must be ${PATTERN_FILE_VERSION}`);
  }
  const salt = value['salt'];
  if (typeof salt !== 'string' || !SALT_HEX.test(salt)) {
    throw new InvalidPatternFileError('salt must be at least 32 lowercase hexadecimal characters');
  }
  const patterns = value['patterns'];
  if (!Array.isArray(patterns) || patterns.length === 0) {
    throw new InvalidPatternFileError('patterns must be a non-empty array');
  }
  return { version: PATTERN_FILE_VERSION, salt, patterns: patterns.map(parsePattern) };
}
