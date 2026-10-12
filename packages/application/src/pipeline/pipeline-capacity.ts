import { ISSUE_SUBJECT_PREFIX, ISSUE_TRANSITIONED_EVENT } from '@agent-factory/domain';
import type { IssueState } from '@agent-factory/domain';
import type { EventStore } from '../ports.ts';
import { IssueTransitionedPayloadSchema } from './journal-events.ts';

export const RUNNING_PIPELINE_STATES: readonly IssueState[] = [
  'authoring-checks',
  'checks-frozen',
  'rewriting-check',
  'implementing',
  'gating',
  'reviewing',
  'producing-evidence',
];

const FIRST_SEQUENCE = 0;
const ISSUE_NUMBER_PATTERN = new RegExp(`^${ISSUE_SUBJECT_PREFIX}(\\d+)$`);

export class PipelineCapacityError extends Error {
  readonly running: readonly number[];

  constructor(limit: number, running: readonly number[]) {
    super(
      `${running.length} issue pipeline(s) already run (${running.map((number) => `#${number}`).join(', ')}) and the limit is ${limit}; resume or finish them first`,
    );
    this.name = 'PipelineCapacityError';
    this.running = running;
  }
}

export async function issueStates(events: EventStore): Promise<ReadonlyMap<number, IssueState>> {
  const states = new Map<number, IssueState>();
  for (const event of await events.read(ISSUE_SUBJECT_PREFIX, FIRST_SEQUENCE)) {
    if (event.type !== ISSUE_TRANSITIONED_EVENT) continue;
    const issueNumber = Number(ISSUE_NUMBER_PATTERN.exec(event.subject)?.[1]);
    if (!Number.isInteger(issueNumber)) continue;
    states.set(issueNumber, IssueTransitionedPayloadSchema.parse(event.payload).to);
  }
  return states;
}

export async function assertPipelineCapacity(events: EventStore, issueNumber: number, limit: number): Promise<void> {
  const running = [...(await issueStates(events))]
    .filter(([number, state]) => number !== issueNumber && RUNNING_PIPELINE_STATES.includes(state))
    .map(([number]) => number)
    .sort((a, b) => a - b);
  if (running.length >= limit) throw new PipelineCapacityError(limit, running);
}
