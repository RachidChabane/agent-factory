import { describe, expect, it } from 'vitest';
import { assertPipelineCapacity, PipelineCapacityError } from './pipeline-capacity.ts';
import { EventSourcedIssueStates, InMemoryEventStore } from './testing/pipeline-fakes.ts';

async function walk(states: EventSourcedIssueStates, issueNumber: number, path: readonly Parameters<EventSourcedIssueStates['transition']>[1][]): Promise<void> {
  for (const state of path) await states.transition(issueNumber, state, 'test');
}

describe('pipeline capacity', () => {
  it('refuses a new pipeline while the limit is reached and ignores pull requests awaiting a merge', async () => {
    const events = new InMemoryEventStore();
    const states = new EventSourcedIssueStates(events);
    await walk(states, 1, ['spec-draft', 'spec-validated', 'authoring-checks', 'checks-frozen', 'implementing']);
    await walk(states, 2, ['spec-draft', 'spec-validated', 'authoring-checks', 'checks-frozen', 'implementing', 'gating', 'reviewing', 'producing-evidence', 'pr-open']);

    await expect(assertPipelineCapacity(events, 3, 1)).rejects.toBeInstanceOf(PipelineCapacityError);
    await expect(assertPipelineCapacity(events, 3, 1)).rejects.toThrow('(#1) and the limit is 1');
    await expect(assertPipelineCapacity(events, 1, 1)).resolves.toBeUndefined();
    await expect(assertPipelineCapacity(events, 3, 2)).resolves.toBeUndefined();
  });
});
