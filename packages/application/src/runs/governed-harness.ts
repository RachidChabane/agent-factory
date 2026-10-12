import type { AgentHarness, AgentRunEvent, AgentRunRequest, AgentRunResult } from '../ports.ts';
import type { BudgetGovernor } from '../budget/budget-governor.ts';
import type { AgentRunAdmission } from '../resources/agent-run-admission.ts';

export class GovernedHarness implements AgentHarness {
  private readonly inner: AgentHarness;
  private readonly admission: AgentRunAdmission;
  private readonly governor: BudgetGovernor;

  constructor(inner: AgentHarness, admission: AgentRunAdmission, governor: BudgetGovernor) {
    this.inner = inner;
    this.admission = admission;
    this.governor = governor;
  }

  async run(request: AgentRunRequest, onEvent: (event: AgentRunEvent) => void, signal: AbortSignal): Promise<AgentRunResult> {
    await this.admission.assertAdmitted();
    const selection = await this.governor.select(request.resumeSessionId);
    let observations: Promise<void> = Promise.resolve();
    const result = await this.inner.run(
      { ...request, account: selection.account, maxBudgetUsd: this.governor.runBudgetUsd(request.maxBudgetUsd) },
      (event) => {
        if (event.kind === 'rate-limit') {
          observations = observations.then(() => this.governor.observe(selection.name, event.snapshots));
        }
        onEvent(event);
      },
      signal,
    );
    await observations;
    return result;
  }
}
