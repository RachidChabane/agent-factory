import { REQUEST_INITIAL_STATE, canTransitionRequest, type RequestState } from '@agent-factory/domain';
import type { EventStore, FactoryEventRecord } from '../ports.ts';
import {
  REQUEST_CHALLENGED_EVENT,
  REQUEST_CHALLENGE_FAILED_EVENT,
  REQUEST_CHALLENGE_STARTED_EVENT,
  REQUEST_DECLINED_EVENT,
  REQUEST_ISSUE_CREATED_EVENT,
  REQUEST_RECEIVED_EVENT,
  REQUEST_SPEC_UPDATED_EVENT,
  REQUEST_SUBJECT_PREFIX,
  RequestChallengeFailedPayloadSchema,
  RequestChallengedPayloadSchema,
  RequestDeclinedPayloadSchema,
  RequestIssueCreatedPayloadSchema,
  RequestReceivedPayloadSchema,
  RequestSpecUpdatedPayloadSchema,
  requestSubject,
  type AttachmentPayload,
  type RequestChallengedPayload,
  type RequestSpecUpdatedPayload,
} from './request-events.ts';

export interface RequestRecord {
  readonly id: string;
  readonly title: string;
  readonly requester: string;
  readonly channel: string;
  readonly body: string;
  readonly attachments: readonly AttachmentPayload[];
  readonly receivedAt: string;
  readonly updatedAt: string;
  readonly state: RequestState;
  readonly challenge: RequestChallengedPayload | null;
  readonly challengeAttempts: number;
  readonly lastFailure: string | null;
  readonly issueNumbers: readonly number[];
  readonly createdIssues: Readonly<Record<string, number>>;
  readonly declineReason: string | null;
}

const FIRST_SEQUENCE = 0;

function startRecord(event: FactoryEventRecord): RequestRecord {
  const received = RequestReceivedPayloadSchema.parse(event.payload);
  return {
    id: received.id,
    title: received.title,
    requester: received.requester,
    channel: received.channel,
    body: received.body,
    attachments: received.attachments,
    receivedAt: received.receivedAt,
    updatedAt: event.occurredAt.toISOString(),
    state: REQUEST_INITIAL_STATE,
    challenge: null,
    challengeAttempts: 0,
    lastFailure: null,
    issueNumbers: [],
    createdIssues: {},
    declineReason: null,
  };
}

function moveTo(record: RequestRecord, target: RequestState): RequestState {
  return canTransitionRequest(record.state, target) ? target : record.state;
}

function applyEvent(record: RequestRecord, event: FactoryEventRecord): RequestRecord {
  switch (event.type) {
    case REQUEST_CHALLENGE_STARTED_EVENT:
      return { ...record, state: moveTo(record, 'challenging'), challengeAttempts: record.challengeAttempts + 1 };
    case REQUEST_CHALLENGE_FAILED_EVENT:
      return { ...record, lastFailure: RequestChallengeFailedPayloadSchema.parse(event.payload).reason };
    case REQUEST_CHALLENGED_EVENT:
      return {
        ...record,
        state: moveTo(record, 'challenged'),
        challenge: RequestChallengedPayloadSchema.parse(event.payload),
        lastFailure: null,
      };
    case REQUEST_SPEC_UPDATED_EVENT:
      return withUpdatedSpec(record, RequestSpecUpdatedPayloadSchema.parse(event.payload));
    case REQUEST_ISSUE_CREATED_EVENT: {
      const created = RequestIssueCreatedPayloadSchema.parse(event.payload);
      return {
        ...record,
        state: moveTo(record, 'accepted'),
        issueNumbers: [...record.issueNumbers, created.issueNumber],
        createdIssues: { ...record.createdIssues, [created.specId]: created.issueNumber },
      };
    }
    case REQUEST_DECLINED_EVENT:
      return {
        ...record,
        state: moveTo(record, 'declined'),
        declineReason: RequestDeclinedPayloadSchema.parse(event.payload).reason,
      };
    default:
      return record;
  }
}

function withUpdatedSpec(record: RequestRecord, update: RequestSpecUpdatedPayload): RequestRecord {
  if (record.challenge === null) return record;
  const specs = record.challenge.specs.map((spec) => (spec.id === update.specId ? update.spec : spec));
  return { ...record, challenge: { ...record.challenge, specs } };
}

export function foldRequestEvents(events: readonly FactoryEventRecord[]): readonly RequestRecord[] {
  const records = new Map<string, RequestRecord>();
  for (const event of events) {
    const current = records.get(event.subject);
    if (event.type === REQUEST_RECEIVED_EVENT) {
      if (current === undefined) records.set(event.subject, startRecord(event));
    } else if (current !== undefined) {
      records.set(event.subject, { ...applyEvent(current, event), updatedAt: event.occurredAt.toISOString() });
    }
  }
  return [...records.values()];
}

export async function loadRequests(events: EventStore): Promise<readonly RequestRecord[]> {
  return foldRequestEvents(await events.read(REQUEST_SUBJECT_PREFIX, FIRST_SEQUENCE));
}

export async function loadRequest(events: EventStore, requestId: string): Promise<RequestRecord | null> {
  const subject = requestSubject(requestId);
  const records = foldRequestEvents((await events.read(subject, FIRST_SEQUENCE)).filter((event) => event.subject === subject));
  return records[0] ?? null;
}
