import type { InstallationInfo } from '../contract/index.ts';
import { MINUTE_MS, toEpoch } from '../i18n/formatters.ts';

/** What a reading is about, which decides how old it may be before it is called stale. */
export const READING_KINDS = ['forge', 'health', 'resources', 'tools', 'knowledge', 'references'] as const;
export type ReadingKind = (typeof READING_KINDS)[number];

export type StaleThresholds = InstallationInfo['staleAfterMs'];

export function isOlderThan(readAt: string | null, now: number, thresholdMs: number): boolean {
  return readAt !== null && now - toEpoch(readAt) > thresholdMs;
}

export function isStaleReading(readAt: string | null, now: number, thresholds: StaleThresholds, kind: ReadingKind): boolean {
  return isOlderThan(readAt, now, thresholds[kind]);
}

/** A usage reading is stale after the interval the installation announces, in minutes. */
export function isStaleUsageReading(readAt: string | null, now: number, staleAfterMinutes: number): boolean {
  return isOlderThan(readAt, now, staleAfterMinutes * MINUTE_MS);
}
