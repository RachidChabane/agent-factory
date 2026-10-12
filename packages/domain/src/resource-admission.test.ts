import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  admitAgentRun,
  DEFAULT_RESOURCE_ADMISSION_POLICY,
  MAX_PERCENT,
  MEMORY_PRESSURE_LEVELS,
  PAUSE_ABOVE_PRESSURE_LEVELS,
} from './resource-admission.ts';

describe('resource admission', () => {
  it('admits a run with normal pressure and enough free memory', () => {
    expect(admitAgentRun({ freeMemoryPercent: 40, pressure: 'normal' }, DEFAULT_RESOURCE_ADMISSION_POLICY)).toEqual({
      admitted: true,
    });
  });

  it('refuses a run below the free-memory threshold', () => {
    expect(admitAgentRun({ freeMemoryPercent: 39, pressure: 'normal' }, DEFAULT_RESOURCE_ADMISSION_POLICY)).toEqual({
      admitted: false,
      reason: 'free memory 39% is below 40%',
    });
  });

  it('refuses a run under warn or critical pressure and reports every reason', () => {
    expect(admitAgentRun({ freeMemoryPercent: 12, pressure: 'critical' }, DEFAULT_RESOURCE_ADMISSION_POLICY)).toEqual({
      admitted: false,
      reason: 'memory pressure is critical; free memory 12% is below 40%',
    });
  });

  it('admits exactly when pressure is normal and free memory meets the threshold', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_PERCENT }),
        fc.integer({ min: 0, max: MAX_PERCENT }),
        fc.constantFrom(...MEMORY_PRESSURE_LEVELS),
        (free, threshold, pressure) =>
          admitAgentRun({ freeMemoryPercent: free, pressure }, { minimumFreeMemoryPercent: threshold, pauseAbovePressure: 'normal' }).admitted ===
          (pressure === 'normal' && free >= threshold),
      ),
    );
  });

  it('admits warn pressure when the operator pauses only above warn, and never admits critical pressure', () => {
    const policy = { minimumFreeMemoryPercent: 40, pauseAbovePressure: 'warn' } as const;
    expect(admitAgentRun({ freeMemoryPercent: 50, pressure: 'warn' }, policy)).toEqual({ admitted: true });
    expect(admitAgentRun({ freeMemoryPercent: 50, pressure: 'critical' }, policy)).toEqual({
      admitted: false,
      reason: 'memory pressure is critical',
    });
  });

  it('refuses critical pressure under every configurable pause level', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PAUSE_ABOVE_PRESSURE_LEVELS), fc.integer({ min: 0, max: MAX_PERCENT }), (pauseAbovePressure, free) =>
        !admitAgentRun({ freeMemoryPercent: free, pressure: 'critical' }, { minimumFreeMemoryPercent: 0, pauseAbovePressure }).admitted,
      ),
    );
  });
});
