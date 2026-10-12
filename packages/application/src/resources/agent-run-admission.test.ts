import { describe, expect, it } from 'vitest';
import type { ResourceSnapshot } from '@agent-factory/domain';
import { AgentRunAdmission, ResourcesUnavailableError } from './agent-run-admission.ts';

function admissionWith(snapshot: ResourceSnapshot): AgentRunAdmission {
  return new AgentRunAdmission({ snapshot: () => Promise.resolve(snapshot) }, { minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal' });
}

describe('AgentRunAdmission', () => {
  it('lets a run start when resources allow it', async () => {
    await expect(admissionWith({ freeMemoryPercent: 55, pressure: 'normal' }).assertAdmitted()).resolves.toBeUndefined();
  });

  it('refuses a run with the reason when resources are short', async () => {
    const admission = admissionWith({ freeMemoryPercent: 20, pressure: 'warn' });
    await expect(admission.assertAdmitted()).rejects.toBeInstanceOf(ResourcesUnavailableError);
    expect(await admission.check()).toEqual({
      admitted: false,
      reason: 'memory pressure is warn; free memory 20% is below 40%',
    });
  });
});
