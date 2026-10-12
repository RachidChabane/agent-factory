import { DEFAULT_BLOCKER_THRESHOLDS, type BlockerThresholds } from './blocker.ts';
import { MILLISECONDS_PER_SECOND } from './time-units.ts';

export const DEFAULT_WATCH_INTERVAL_SECONDS = 20;

export interface WatchSettings {
  readonly intervalMs: number;
  readonly thresholds: BlockerThresholds;
}

export const DEFAULT_WATCH_SETTINGS: WatchSettings = {
  intervalMs: DEFAULT_WATCH_INTERVAL_SECONDS * MILLISECONDS_PER_SECOND,
  thresholds: DEFAULT_BLOCKER_THRESHOLDS,
};

export function watchSettings(intervalSeconds: number): WatchSettings {
  return { ...DEFAULT_WATCH_SETTINGS, intervalMs: intervalSeconds * MILLISECONDS_PER_SECOND };
}
