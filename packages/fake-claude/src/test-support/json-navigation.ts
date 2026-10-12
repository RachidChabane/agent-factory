import assert from 'node:assert/strict';

export type JsonObject = { readonly [key: string]: unknown };
export type PathSegment = string | number;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asObject(value: unknown, description = 'value'): JsonObject {
  assert.ok(isObject(value), `${description} is not an object: ${JSON.stringify(value)}`);
  return value;
}

export function dig(value: unknown, ...path: readonly PathSegment[]): unknown {
  let current = value;
  for (const segment of path) {
    if (typeof segment === 'number') {
      current = Array.isArray(current) ? current[segment] : undefined;
    } else {
      current = isObject(current) ? current[segment] : undefined;
    }
  }
  return current;
}

export function digString(value: unknown, ...path: readonly PathSegment[]): string {
  const found = dig(value, ...path);
  assert.equal(typeof found, 'string', `${path.join('.')} is not a string: ${JSON.stringify(found)}`);
  return String(found);
}

export function digNumber(value: unknown, ...path: readonly PathSegment[]): number {
  const found = dig(value, ...path);
  assert.equal(typeof found, 'number', `${path.join('.')} is not a number: ${JSON.stringify(found)}`);
  return Number(found);
}

export function digList(value: unknown, ...path: readonly PathSegment[]): readonly unknown[] {
  const found = dig(value, ...path);
  assert.ok(Array.isArray(found), `${path.join('.')} is not an array: ${JSON.stringify(found)}`);
  return found;
}

export function parseJsonLines(text: string): readonly JsonObject[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const parsed: unknown = JSON.parse(line);
      return asObject(parsed, `line ${line}`);
    });
}
