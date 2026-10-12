import { DAY_MS, MINUTE_MS } from '../../i18n/formatters.ts';

export const SINCE_QUERY_PARAMETER = 'since';
export const SEEN_STORAGE_KEY = 'agent-factory.changes.seen-at';
export const DEFAULT_SINCE_WINDOW_MS = DAY_MS;

export const SINCE_PRESETS = ['24h', '3d', '7d'] as const;
export type SincePreset = (typeof SINCE_PRESETS)[number];
export const CUSTOM_SINCE = 'custom';
export type SinceChoice = SincePreset | typeof CUSTOM_SINCE;

export const SINCE_PRESET_WINDOWS_MS: Readonly<Record<SincePreset, number>> = {
  '24h': DAY_MS,
  '3d': 3 * DAY_MS,
  '7d': 7 * DAY_MS,
};

const PRESET_MATCH_TOLERANCE_MS = MINUTE_MS;
const LOCAL_INPUT_LENGTH = 'YYYY-MM-DDTHH:mm'.length;

/** An instant written as a date, or null when the text is empty or reads as none. */
export function parseInstant(value: string | null): number | null {
  if (value === null || value === '') return null;
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : epoch;
}

/** When the operator last said they had seen the changes in this browser; null before they ever did, or without storage. */
export function readSeenAt(storage: Storage | null): number | null {
  try {
    return parseInstant(storage?.getItem(SEEN_STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

/** Keeps the moment in the browser; false when the storage is blocked, so that the operator is told it was not kept. */
export function persistSeenAt(storage: Storage | null, at: number): boolean {
  try {
    if (storage === null) return false;
    storage.setItem(SEEN_STORAGE_KEY, new Date(at).toISOString());
    return true;
  } catch {
    return false;
  }
}

/** The moment the changes are counted from when the address names none: the last time they were seen, or a day ago. */
export function defaultSince(seenAt: number | null, now: number): number {
  return seenAt ?? now - DEFAULT_SINCE_WINDOW_MS;
}

export function presetSince(preset: SincePreset, now: number): number {
  return now - SINCE_PRESET_WINDOWS_MS[preset];
}

export function matchingPreset(since: number, now: number): SinceChoice {
  const match = SINCE_PRESETS.find((preset) => Math.abs(presetSince(preset, now) - since) <= PRESET_MATCH_TOLERANCE_MS);
  return match ?? CUSTOM_SINCE;
}

/** The value of a `datetime-local` input for an instant, in the operator's time zone. */
export function toLocalInputValue(epoch: number): string {
  const date = new Date(epoch);
  const local = new Date(epoch - date.getTimezoneOffset() * MINUTE_MS);
  return local.toISOString().slice(0, LOCAL_INPUT_LENGTH);
}

export function fromLocalInputValue(value: string): number | null {
  return parseInstant(value === '' ? null : value);
}
