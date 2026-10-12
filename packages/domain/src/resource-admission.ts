export const MEMORY_PRESSURE_LEVELS = ['normal', 'warn', 'critical'] as const;
export type MemoryPressureLevel = (typeof MEMORY_PRESSURE_LEVELS)[number];

export const ADMITTED_PRESSURE_LEVEL: MemoryPressureLevel = 'normal';
export const PAUSE_ABOVE_PRESSURE_LEVELS = ['normal', 'warn'] as const satisfies readonly MemoryPressureLevel[];
export type PauseAbovePressureLevel = (typeof PAUSE_ABOVE_PRESSURE_LEVELS)[number];
export const DEFAULT_MINIMUM_FREE_MEMORY_PERCENT = 40;
export const MAX_PERCENT = 100;

export interface ResourceSnapshot {
  readonly freeMemoryPercent: number;
  readonly pressure: MemoryPressureLevel;
}

export interface ResourceAdmissionPolicy {
  readonly minimumFreeMemoryPercent: number;
  readonly pauseAbovePressure: PauseAbovePressureLevel;
}

export const DEFAULT_RESOURCE_ADMISSION_POLICY: ResourceAdmissionPolicy = {
  minimumFreeMemoryPercent: DEFAULT_MINIMUM_FREE_MEMORY_PERCENT,
  pauseAbovePressure: ADMITTED_PRESSURE_LEVEL,
};

export type ResourceAdmission =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly reason: string };

export function isPressureAdmitted(pressure: MemoryPressureLevel, pauseAbove: PauseAbovePressureLevel): boolean {
  return MEMORY_PRESSURE_LEVELS.indexOf(pressure) <= MEMORY_PRESSURE_LEVELS.indexOf(pauseAbove);
}

export function admitAgentRun(snapshot: ResourceSnapshot, policy: ResourceAdmissionPolicy): ResourceAdmission {
  const reasons: string[] = [];
  if (!isPressureAdmitted(snapshot.pressure, policy.pauseAbovePressure)) {
    reasons.push(`memory pressure is ${snapshot.pressure}`);
  }
  if (snapshot.freeMemoryPercent < policy.minimumFreeMemoryPercent) {
    reasons.push(`free memory ${snapshot.freeMemoryPercent}% is below ${policy.minimumFreeMemoryPercent}%`);
  }
  return reasons.length === 0 ? { admitted: true } : { admitted: false, reason: reasons.join('; ') };
}
