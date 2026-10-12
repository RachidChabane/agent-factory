import { digest, highestPower, normalize, rollForward, rollingHash } from './hashing.ts';
import type { DenylistFile, DenylistPattern } from './patterns.ts';

/**
 * Subresource-integrity values (`sha512-<base64>`) are random base64: a short term matches inside
 * one by chance. They are masked before matching, and nothing else is.
 */
const INTEGRITY_VALUE = /\bsha(?:1|256|384|512)-[A-Za-z0-9+/]{20,}={0,2}/g;
const MASK_CHARACTER = ' ';
const NEWLINE = 10;

export interface DenylistMatch {
  readonly category: string;
  readonly offset: number;
  readonly length: number;
  readonly line: number;
  readonly column: number;
}

interface LengthBucket {
  readonly length: number;
  readonly power: number;
  readonly byRolling: ReadonlyMap<number, readonly DenylistPattern[]>;
}

export function maskIntegrityValues(text: string): string {
  return text.replace(INTEGRITY_VALUE, (value) => MASK_CHARACTER.repeat(value.length));
}

export class DenylistMatcher {
  private readonly buckets: readonly LengthBucket[];
  private readonly salt: string;

  constructor(file: DenylistFile) {
    this.salt = file.salt;
    this.buckets = bucketsByLength(file.patterns);
  }

  findAll(text: string): readonly DenylistMatch[] {
    const normalized = normalize(maskIntegrityValues(text));
    const matches: DenylistMatch[] = [];
    for (const bucket of this.buckets) {
      this.scanBucket(normalized, bucket, matches);
    }
    matches.sort((left, right) => left.offset - right.offset);
    return withPositions(normalized, matches);
  }

  private scanBucket(text: string, bucket: LengthBucket, matches: DenylistMatch[]): void {
    if (text.length < bucket.length) {
      return;
    }
    let hash = rollingHash(text.slice(0, bucket.length));
    for (let offset = 0; offset + bucket.length <= text.length; offset += 1) {
      if (offset > 0) {
        hash = rollForward(hash, text.charCodeAt(offset - 1), text.charCodeAt(offset + bucket.length - 1), bucket.power);
      }
      const candidates = bucket.byRolling.get(hash);
      if (candidates !== undefined) {
        this.confirm(text.slice(offset, offset + bucket.length), offset, candidates, matches);
      }
    }
  }

  private confirm(window: string, offset: number, candidates: readonly DenylistPattern[], matches: DenylistMatch[]): void {
    const windowDigest = digest(this.salt, window);
    for (const candidate of candidates) {
      if (candidate.sha256 === windowDigest) {
        matches.push({ category: candidate.category, offset, length: candidate.length, line: 0, column: 0 });
      }
    }
  }
}

function bucketsByLength(patterns: readonly DenylistPattern[]): readonly LengthBucket[] {
  const byLength = new Map<number, Map<number, DenylistPattern[]>>();
  for (const pattern of patterns) {
    const byRolling = byLength.get(pattern.length) ?? new Map<number, DenylistPattern[]>();
    byRolling.set(pattern.rolling, [...(byRolling.get(pattern.rolling) ?? []), pattern]);
    byLength.set(pattern.length, byRolling);
  }
  return [...byLength.entries()].map(([length, byRolling]) => ({ length, power: highestPower(length), byRolling }));
}

function withPositions(text: string, matches: readonly DenylistMatch[]): readonly DenylistMatch[] {
  let line = 1;
  let lineStart = 0;
  let cursor = 0;
  return matches.map((match) => {
    for (; cursor < match.offset; cursor += 1) {
      if (text.charCodeAt(cursor) === NEWLINE) {
        line += 1;
        lineStart = cursor + 1;
      }
    }
    return { ...match, line, column: match.offset - lineStart + 1 };
  });
}
