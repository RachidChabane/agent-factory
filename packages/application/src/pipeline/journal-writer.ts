import { ISSUE_ESCALATION_STATE, issueSubject } from '@agent-factory/domain';
import type { IssueState } from '@agent-factory/domain';
import type { EventStore, IssueStateStore } from '../ports.ts';

export class IssueJournalWriter {
  private readonly events: EventStore;
  private readonly states: IssueStateStore;
  readonly issueNumber: number;

  constructor(events: EventStore, states: IssueStateStore, issueNumber: number) {
    this.events = events;
    this.states = states;
    this.issueNumber = issueNumber;
  }

  async record(type: string, payload: unknown): Promise<void> {
    await this.events.append(type, issueSubject(this.issueNumber), payload);
  }

  transition(to: IssueState, reason: string): Promise<void> {
    return this.states.transition(this.issueNumber, to, reason);
  }

  escalate(reason: string): Promise<void> {
    return this.transition(ISSUE_ESCALATION_STATE, reason);
  }
}
