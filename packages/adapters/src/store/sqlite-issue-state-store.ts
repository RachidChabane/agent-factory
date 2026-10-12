import { IssueTransitionedPayloadSchema } from '@agent-factory/application';
import type { EventStore, FactoryEventRecord, IssueStateStore } from '@agent-factory/application';
import {
  assertResumeTarget,
  assertTransition,
  ISSUE_ESCALATION_STATE,
  ISSUE_INITIAL_STATE,
  ISSUE_TRANSITIONED_EVENT,
  issueSubject,
  InvalidTransitionError,
} from '@agent-factory/domain';
import type { IssueState } from '@agent-factory/domain';

const FIRST_SEQUENCE = 0;

export interface IssueStateProjection {
  readonly state: IssueState;
  readonly resumeTarget: IssueState | null;
}

function advance(previous: IssueStateProjection | null, to: IssueState): IssueStateProjection {
  const resumeTarget = to === ISSUE_ESCALATION_STATE ? (previous?.state ?? null) : null;
  return { state: to, resumeTarget };
}

export function projectIssueState(events: readonly FactoryEventRecord[]): IssueStateProjection | null {
  return events
    .filter((event) => event.type === ISSUE_TRANSITIONED_EVENT)
    .reduce<IssueStateProjection | null>(
      (projection, event) => advance(projection, IssueTransitionedPayloadSchema.parse(event.payload).to),
      null,
    );
}

export class EventSourcedIssueStateStore implements IssueStateStore {
  private readonly events: EventStore;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(events: EventStore) {
    this.events = events;
  }

  async get(issueNumber: number): Promise<IssueState | null> {
    return (await this.load(issueNumber))?.state ?? null;
  }

  transition(issueNumber: number, to: IssueState, reason: string): Promise<void> {
    const run = this.queue.then(() => this.applyTransition(issueNumber, to, reason));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(issueNumber: number): Promise<IssueStateProjection | null> {
    const subject = issueSubject(issueNumber);
    const events = await this.events.read(subject, FIRST_SEQUENCE);
    return projectIssueState(events.filter((event) => event.subject === subject));
  }

  private async applyTransition(issueNumber: number, to: IssueState, reason: string): Promise<void> {
    const current = await this.load(issueNumber);
    if (current === null) {
      if (to !== ISSUE_INITIAL_STATE) {
        throw new InvalidTransitionError('issue', 'none', to);
      }
    } else {
      assertTransition(current.state, to);
      if (current.state === ISSUE_ESCALATION_STATE && current.resumeTarget !== null) {
        assertResumeTarget(current.resumeTarget, to);
      }
    }
    await this.events.append(ISSUE_TRANSITIONED_EVENT, issueSubject(issueNumber), {
      from: current?.state ?? null,
      to,
      reason,
    });
  }
}
