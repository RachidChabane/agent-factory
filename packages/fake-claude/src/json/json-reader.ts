import { isAbsolute } from 'node:path';
import { childOf, formatPath, type JsonPath } from './json-path.ts';

export type JsonRecord = { readonly [key: string]: unknown };

export interface NumberBounds {
  readonly min: number;
  readonly max: number;
}

const PARENT_SEGMENT = '..';
const PATH_SEPARATORS = /[\\/]/;

export class DocumentError extends Error {
  readonly path: JsonPath;

  constructor(path: JsonPath, problem: string) {
    super(`${formatPath(path)} ${problem}`);
    this.name = 'DocumentError';
    this.path = path;
  }
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readRecord(value: unknown, path: JsonPath): JsonRecord {
  if (!isRecord(value)) {
    throw new DocumentError(path, 'must be an object');
  }
  return value;
}

export function readList(value: unknown, path: JsonPath): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new DocumentError(path, 'must be an array');
  }
  return value;
}

export function readString(value: unknown, path: JsonPath): string {
  if (typeof value !== 'string') {
    throw new DocumentError(path, 'must be a string');
  }
  return value;
}

export function readNonEmptyString(value: unknown, path: JsonPath): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DocumentError(path, 'must be a non-empty string');
  }
  return value;
}

export function readNumber(value: unknown, path: JsonPath, bounds: NumberBounds): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < bounds.min || value > bounds.max) {
    throw new DocumentError(path, `must be a number between ${String(bounds.min)} and ${String(bounds.max)}`);
  }
  return value;
}

export function readNonNegativeInteger(value: unknown, path: JsonPath): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new DocumentError(path, 'must be a non-negative integer');
  }
  return value;
}

export function readOneOf<T extends string>(value: unknown, path: JsonPath, allowed: readonly T[]): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new DocumentError(path, `must be one of ${allowed.map((candidate) => JSON.stringify(candidate)).join(', ')}`);
  }
  return match;
}

export function readRelativePath(value: unknown, path: JsonPath): string {
  const text = readNonEmptyString(value, path);
  if (isAbsolute(text)) {
    throw new DocumentError(path, 'must be relative to the working directory');
  }
  if (text.split(PATH_SEPARATORS).includes(PARENT_SEGMENT)) {
    throw new DocumentError(path, `must stay inside the working directory (no "${PARENT_SEGMENT}" segment)`);
  }
  return text;
}

export type Field = readonly [value: unknown, path: JsonPath];

export function fieldsOf(record: JsonRecord, path: JsonPath): (key: string) => Field {
  return (key) => [record[key], childOf(path, key)];
}

export function readOptional<T>([value, path]: Field, read: (value: unknown, path: JsonPath) => T): T | undefined {
  return value === undefined ? undefined : read(value, path);
}

export function rejectUnknownFields(record: JsonRecord, allowed: readonly string[], path: JsonPath): void {
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown !== undefined) {
    throw new DocumentError(childOf(path, unknown), `is not a known field (expected ${allowed.join(', ')})`);
  }
}

export function mapList<T>(
  values: readonly unknown[],
  path: JsonPath,
  readItem: (item: unknown, itemPath: JsonPath) => T,
): readonly T[] {
  return values.map((item, index) => readItem(item, childOf(path, index)));
}
