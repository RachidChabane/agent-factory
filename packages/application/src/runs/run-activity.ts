import type { EventStore } from '../ports.ts';
import { openRunStarts } from './orphan-runs.ts';

/** Tells whether an agent run of any project is open: a film waits until none is. */
export interface AgentRunActivity {
  hasOpenRun(): Promise<boolean>;
}

/** The activity of the runs recorded in the installation's log, where every project's runs are kept. */
export class LoggedAgentRunActivity implements AgentRunActivity {
  private readonly installationEvents: EventStore;

  constructor(installationEvents: EventStore) {
    this.installationEvents = installationEvents;
  }

  async hasOpenRun(): Promise<boolean> {
    return (await openRunStarts(this.installationEvents)).length > 0;
  }
}
