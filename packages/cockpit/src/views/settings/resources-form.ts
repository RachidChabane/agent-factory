import type { PauseAbovePressureLevel } from '@agent-factory/domain';
import {
  MAX_CONCURRENT_RUNS,
  MAX_FREE_MEMORY_THRESHOLD_PERCENT,
  MIN_CONCURRENT_RUNS,
  MIN_FREE_MEMORY_THRESHOLD_PERCENT,
  PAUSE_ABOVE_PRESSURE_LEVELS,
} from '@agent-factory/domain';
import type { CommandBody, InstallationSettingsView } from '../../contract/index.ts';
import type { DecimalNotation } from './decimal-notation.ts';
import { isWithin } from './limits.ts';

export type ResourcesSetting = InstallationSettingsView['resources'];

export interface ResourcesDraft {
  readonly minimumFreeMemory: string;
  readonly pauseAbovePressure: PauseAbovePressureLevel;
  readonly maxConcurrentRuns: string;
}

export interface ResourcesProblems {
  readonly minimumFreeMemory: boolean;
  readonly maxConcurrentRuns: boolean;
}

/** Whether the text of a select is one of the levels the factory accepts: pausing above critical pressure would never pause. */
export function isPauseAbovePressure(level: string): level is PauseAbovePressureLevel {
  return PAUSE_ABOVE_PRESSURE_LEVELS.some((allowed) => allowed === level);
}

export function resourcesDraftOf(setting: ResourcesSetting, notation: DecimalNotation): ResourcesDraft {
  return {
    minimumFreeMemory: notation.format(setting.minimumFreeMemoryPercent),
    pauseAbovePressure: setting.pauseAbovePressure,
    maxConcurrentRuns: notation.format(setting.maxConcurrentRuns),
  };
}

function isFreeMemoryThreshold(value: number | null): value is number {
  return isWithin(value, MIN_FREE_MEMORY_THRESHOLD_PERCENT, MAX_FREE_MEMORY_THRESHOLD_PERCENT);
}

function isRunCount(value: number | null): value is number {
  return isWithin(value, MIN_CONCURRENT_RUNS, MAX_CONCURRENT_RUNS);
}

export function resourcesProblems(draft: ResourcesDraft, notation: DecimalNotation): ResourcesProblems {
  return {
    minimumFreeMemory: !isFreeMemoryThreshold(notation.parse(draft.minimumFreeMemory)),
    maxConcurrentRuns: !isRunCount(notation.parseWhole(draft.maxConcurrentRuns)),
  };
}

/** The change the factory takes, with the three fields it needs, or null while a field is invalid. */
export function resourcesChangeOf(draft: ResourcesDraft, notation: DecimalNotation): CommandBody<'settings.update-resources'> | null {
  const minimumFreeMemoryPercent = notation.parse(draft.minimumFreeMemory);
  const maxConcurrentRuns = notation.parseWhole(draft.maxConcurrentRuns);
  if (!isFreeMemoryThreshold(minimumFreeMemoryPercent) || !isRunCount(maxConcurrentRuns)) return null;
  return { minimumFreeMemoryPercent, pauseAbovePressure: draft.pauseAbovePressure, maxConcurrentRuns };
}

export function isResourcesChanged(draft: ResourcesDraft, setting: ResourcesSetting, notation: DecimalNotation): boolean {
  return (
    notation.parse(draft.minimumFreeMemory) !== setting.minimumFreeMemoryPercent ||
    draft.pauseAbovePressure !== setting.pauseAbovePressure ||
    notation.parseWhole(draft.maxConcurrentRuns) !== setting.maxConcurrentRuns
  );
}
