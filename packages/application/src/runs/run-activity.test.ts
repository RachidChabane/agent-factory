import { describe, expect, it } from 'vitest';
import { InMemoryEventStore } from '../audit/testing/fakes.ts';
import { RUN_FINISHED_EVENT, RUN_STARTED_EVENT, runSubject } from './run-events.ts';
import { LoggedAgentRunActivity } from './run-activity.ts';

const STARTED = {
  id: 'run-1',
  project: 'storefront',
  subject: { kind: 'issue', id: '42' },
  role: 'implementer',
  model: 'sonnet',
  startedAt: '2026-10-12T12:00:00.000Z',
};

describe('LoggedAgentRunActivity', () => {
  it('sees an open run of any project, and none once it has ended', async () => {
    const events = new InMemoryEventStore();
    const activity = new LoggedAgentRunActivity(events);
    expect(await activity.hasOpenRun()).toBe(false);
    await events.append(RUN_STARTED_EVENT, runSubject('run-1'), STARTED);
    expect(await activity.hasOpenRun()).toBe(true);
    await events.append(RUN_FINISHED_EVENT, runSubject('run-1'), {});
    expect(await activity.hasOpenRun()).toBe(false);
  });
});
