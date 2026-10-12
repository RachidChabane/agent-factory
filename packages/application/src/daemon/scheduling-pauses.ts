import type { BudgetGovernor } from '../budget/budget-governor.ts';
import type { PauseCause } from '@agent-factory/domain';
import { NOTICES, type OperatorNotifications } from '../notifications/operator-notifications.ts';
import type { EventStore } from '../ports.ts';
import type { AgentRunAdmission } from '../resources/agent-run-admission.ts';
import { activePauses, pauseScheduling, resumeScheduling } from './pause-state.ts';

export type PauseSet = ReadonlyMap<PauseCause, unknown>;

/** Decides, at each tick, why scheduling is paused. Empty means a daemon may start work. */
export interface SchedulingPauses {
  refresh(): Promise<PauseSet>;
}

interface Refusal {
  readonly reason: string;
  readonly resumesAt: Date | null;
}

export interface MachinePauseDependencies {
  readonly events: EventStore;
  readonly admission: AgentRunAdmission;
  readonly budget: BudgetGovernor;
  readonly notifications: OperatorNotifications;
}

/**
 * Pauses that belong to the machine and the subscription: short memory and a spent budget.
 * Each change is recorded in the given log with the operator's own pause, and notified once.
 */
export class MachineSchedulingPauses implements SchedulingPauses {
  private readonly dependencies: MachinePauseDependencies;

  constructor(dependencies: MachinePauseDependencies) {
    this.dependencies = dependencies;
  }

  async refresh(): Promise<PauseSet> {
    const { events, admission, budget } = this.dependencies;
    const pauses = new Map<PauseCause, unknown>(await activePauses(events));
    const resources = await admission.check();
    await this.reconcile(pauses, 'resources', resources.admitted ? null : { reason: resources.reason, resumesAt: null });
    const choice = await budget.check();
    await this.reconcile(pauses, 'budget', choice.kind === 'selected' ? null : { reason: choice.reason, resumesAt: choice.resumesAt });
    return pauses;
  }

  private async reconcile(pauses: Map<PauseCause, unknown>, cause: PauseCause, refusal: Refusal | null): Promise<void> {
    const { events, notifications } = this.dependencies;
    if (refusal !== null && !pauses.has(cause)) {
      await pauseScheduling(events, cause, refusal.reason, refusal.resumesAt);
      pauses.set(cause, refusal);
      await notifications.send(NOTICES.paused(cause, refusal.reason, refusal.resumesAt));
    } else if (refusal === null && pauses.has(cause)) {
      await resumeScheduling(events, cause);
      pauses.delete(cause);
      await notifications.send(NOTICES.resumed(cause));
    }
  }
}

/**
 * The pauses one project of an installation obeys: its own operator pause, recorded in the
 * project's log, and whatever pauses the whole installation at this tick.
 */
export class ProjectSchedulingPauses implements SchedulingPauses {
  private readonly projectEvents: EventStore;
  private readonly installation: () => PauseSet;

  constructor(projectEvents: EventStore, installation: () => PauseSet) {
    this.projectEvents = projectEvents;
    this.installation = installation;
  }

  async refresh(): Promise<PauseSet> {
    return new Map<PauseCause, unknown>([...this.installation(), ...(await activePauses(this.projectEvents))]);
  }
}
