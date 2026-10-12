import { describe, expect, it } from 'vitest';
import { InMemoryEventStore } from '../audit/testing/fakes.ts';
import {
  REQUEST_CHALLENGED_EVENT,
  REQUEST_CHALLENGE_FAILED_EVENT,
  REQUEST_CHALLENGE_STARTED_EVENT,
  REQUEST_DECLINED_EVENT,
  REQUEST_ISSUE_CREATED_EVENT,
  REQUEST_RECEIVED_EVENT,
  REQUEST_SPEC_UPDATED_EVENT,
  requestSubject,
  type ProposedSpecPayload,
  type RequestChallengedPayload,
  type RequestReceivedPayload,
} from './request-events.ts';
import { foldRequestEvents, loadRequest, loadRequests } from './request-projection.ts';

const RECEIVED_AT = '1970-01-01T00:00:00.000Z';

function received(id: string): RequestReceivedPayload {
  return {
    id,
    title: 'Cost on the run page',
    requester: 'alice',
    channel: 'chat',
    body: 'Show the cost.',
    attachments: [{ name: 'screen.png', path: 'images/screen.png', mediaType: 'image/png' }],
    receivedAt: RECEIVED_AT,
  };
}

function spec(id: string, title: string): ProposedSpecPayload {
  return {
    id,
    itemIds: ['item-1'],
    title,
    type: 'ui',
    need: 'Need.',
    acceptanceCriteria: ['Done.'],
    outOfScope: ['More.'],
    expectedProof: 'Proof.',
    path: `specs/1-${id}.md`,
    problems: [],
  };
}

function challenged(runId: string): RequestChallengedPayload {
  return {
    runId,
    completedAt: RECEIVED_AT,
    summary: 'Summary.',
    items: [],
    specs: [spec('spec-1', 'First'), spec('spec-2', 'Second')],
    reply: 'Reply.',
    reportPath: 'report.md',
    replyPath: 'reply.md',
  };
}

async function givenReceived(events: InMemoryEventStore, id = 'req-1'): Promise<void> {
  await events.append(REQUEST_RECEIVED_EVENT, requestSubject(id), received(id));
}

describe('request projection', () => {
  it('starts a request in the received state with its content', async () => {
    const events = new InMemoryEventStore();
    await givenReceived(events);
    expect(await loadRequest(events, 'req-1')).toMatchObject({
      id: 'req-1',
      title: 'Cost on the run page',
      requester: 'alice',
      channel: 'chat',
      body: 'Show the cost.',
      attachments: [{ name: 'screen.png', path: 'images/screen.png', mediaType: 'image/png' }],
      receivedAt: RECEIVED_AT,
      updatedAt: RECEIVED_AT,
      state: 'received',
      challenge: null,
      challengeAttempts: 0,
      lastFailure: null,
      issueNumbers: [],
      createdIssues: {},
      declineReason: null,
    });
  });

  it('follows received, challenging, challenged, accepted', async () => {
    const events = new InMemoryEventStore();
    const subject = requestSubject('req-1');
    await givenReceived(events);
    await events.append(REQUEST_CHALLENGE_STARTED_EVENT, subject, { runId: 'run-1' });
    expect((await loadRequest(events, 'req-1'))?.state).toBe('challenging');
    await events.append(REQUEST_CHALLENGED_EVENT, subject, challenged('run-1'));
    expect((await loadRequest(events, 'req-1'))?.state).toBe('challenged');
    await events.append(REQUEST_ISSUE_CREATED_EVENT, subject, { specId: 'spec-1', issueNumber: 41 });
    await events.append(REQUEST_ISSUE_CREATED_EVENT, subject, { specId: 'spec-2', issueNumber: 42 });
    expect(await loadRequest(events, 'req-1')).toMatchObject({
      state: 'accepted',
      issueNumbers: [41, 42],
      createdIssues: { 'spec-1': 41, 'spec-2': 42 },
      challenge: { runId: 'run-1' },
    });
  });

  it('keeps a failed challenge in the challenging state and counts the attempts', async () => {
    const events = new InMemoryEventStore();
    const subject = requestSubject('req-1');
    await givenReceived(events);
    await events.append(REQUEST_CHALLENGE_STARTED_EVENT, subject, { runId: 'run-1' });
    await events.append(REQUEST_CHALLENGE_FAILED_EVENT, subject, { runId: 'run-1', reason: 'no block' });
    expect(await loadRequest(events, 'req-1')).toMatchObject({ state: 'challenging', lastFailure: 'no block', challengeAttempts: 1 });
    await events.append(REQUEST_CHALLENGE_STARTED_EVENT, subject, { runId: 'run-2' });
    await events.append(REQUEST_CHALLENGED_EVENT, subject, challenged('run-2'));
    expect(await loadRequest(events, 'req-1')).toMatchObject({ state: 'challenged', lastFailure: null, challengeAttempts: 2 });
  });

  it('records a decline with its reason', async () => {
    const events = new InMemoryEventStore();
    const subject = requestSubject('req-1');
    await givenReceived(events);
    await events.append(REQUEST_CHALLENGE_STARTED_EVENT, subject, { runId: 'run-1' });
    await events.append(REQUEST_CHALLENGED_EVENT, subject, challenged('run-1'));
    await events.append(REQUEST_DECLINED_EVENT, subject, { reason: 'out of scope' });
    expect(await loadRequest(events, 'req-1')).toMatchObject({ state: 'declined', declineReason: 'out of scope' });
  });

  it('ignores a transition the lifecycle does not declare', async () => {
    const events = new InMemoryEventStore();
    await givenReceived(events);
    await events.append(REQUEST_DECLINED_EVENT, requestSubject('req-1'), { reason: 'too early' });
    expect((await loadRequest(events, 'req-1'))?.state).toBe('received');
  });

  it('replaces a spec of the challenge when it is updated', async () => {
    const events = new InMemoryEventStore();
    const subject = requestSubject('req-1');
    await givenReceived(events);
    await events.append(REQUEST_CHALLENGE_STARTED_EVENT, subject, { runId: 'run-1' });
    await events.append(REQUEST_CHALLENGED_EVENT, subject, challenged('run-1'));
    await events.append(REQUEST_SPEC_UPDATED_EVENT, subject, { specId: 'spec-2', spec: spec('spec-2', 'Edited') });
    const titles = (await loadRequest(events, 'req-1'))?.challenge?.specs.map((entry) => entry.title);
    expect(titles).toEqual(['First', 'Edited']);
  });

  it('sets updatedAt to the time of the last event', () => {
    const later = new Date('2026-01-02T03:04:05.000Z');
    const records = foldRequestEvents([
      { sequence: 1, occurredAt: new Date(RECEIVED_AT), type: REQUEST_RECEIVED_EVENT, subject: requestSubject('req-1'), payload: received('req-1') },
      { sequence: 2, occurredAt: later, type: REQUEST_CHALLENGE_STARTED_EVENT, subject: requestSubject('req-1'), payload: { runId: 'run-1' } },
    ]);
    expect(records[0]).toMatchObject({ receivedAt: RECEIVED_AT, updatedAt: later.toISOString() });
  });

  it('loads every request and only the one asked for', async () => {
    const events = new InMemoryEventStore();
    await givenReceived(events, 'req-1');
    await givenReceived(events, 'req-10');
    expect((await loadRequests(events)).map((record) => record.id)).toEqual(['req-1', 'req-10']);
    expect((await loadRequest(events, 'req-1'))?.id).toBe('req-1');
    expect(await loadRequest(events, 'req-2')).toBeNull();
  });
});
