import { admitAgentRun } from '@agent-factory/domain';
import type { ResourceAdmission, ResourceAdmissionPolicy } from '@agent-factory/domain';
import type { ResourceGuard } from '../ports.ts';

export class ResourcesUnavailableError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`No agent run starts while resources are short: ${reason}`);
    this.name = 'ResourcesUnavailableError';
    this.reason = reason;
  }
}

export class AgentRunAdmission {
  private readonly guard: ResourceGuard;
  private policy: ResourceAdmissionPolicy;

  constructor(guard: ResourceGuard, policy: ResourceAdmissionPolicy) {
    this.guard = guard;
    this.policy = policy;
  }

  get currentPolicy(): ResourceAdmissionPolicy {
    return this.policy;
  }

  updatePolicy(policy: ResourceAdmissionPolicy): void {
    this.policy = policy;
  }

  async check(): Promise<ResourceAdmission> {
    return admitAgentRun(await this.guard.snapshot(), this.policy);
  }

  async assertAdmitted(): Promise<void> {
    const admission = await this.check();
    if (!admission.admitted) throw new ResourcesUnavailableError(admission.reason);
  }
}
