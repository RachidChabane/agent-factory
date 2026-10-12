import type { Reading } from '../../contract/index.ts';

export const NEVER_READ: Reading<never> = { value: null, readAt: null, error: null };

export function readOn<Value>(value: Value, readAt: string): Reading<Value> {
  return { value, readAt, error: null };
}

/** A failed attempt keeps the previous value and its read time and records why it failed. */
export function failedAfter<Value>(previous: Reading<Value>, error: string): Reading<Value> {
  return { value: previous.value, readAt: previous.readAt, error };
}
