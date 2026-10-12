import type { AgentHarness, AgentRunEvent, AgentRunRequest, AgentRunResult } from '../ports.ts';
import type { BudgetGovernor } from '../budget/budget-governor.ts';
import type { UsageFreshener } from '../budget/usage-refresher.ts';
import type { AgentRunAdmission } from '../resources/agent-run-admission.ts';

/** Starts an agent run only when the machine has room and an account's freshly read usage leaves room for it. */
export class GovernedHarness implements AgentHarness {
  private readonly inner: AgentHarness;
  private readonly admission: AgentRunAdmission;
  private readonly governor: BudgetGovernor;
  private readonly usage: UsageFreshener;

  constructor(inner: AgentHarness, admission: AgentRunAdmission, governor: BudgetGovernor, usage: UsageFreshener) {
    this.inner = inner;
    this.admission = admission;
    this.governor = governor;
    this.usage = usage;
  }

  async run(request: AgentRunRequest, onEvent: (event: AgentRunEvent) => void, signal: AbortSignal): Promise<AgentRunResult> {
    await this.admission.assertAdmitted();
    await this.usage.ensureFresh(signal);
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
