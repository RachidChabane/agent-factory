import { canTransitionRequest } from '@agent-factory/domain';
import type { EventStore } from '../ports.ts';
import { REQUEST_CHALLENGE_STARTED_EVENT, REQUEST_SUBJECT_PREFIX, requestSubject } from './request-events.ts';
import { loadRequest, loadRequests } from './request-projection.ts';
import { RequestChallengeRefusedError, RequestNotFoundError } from './errors.ts';

export const REQUEST_CHALLENGE_REQUESTED_EVENT = 'request.challenge-requested';
export const MAX_CHALLENGE_ATTEMPTS = 3;
const CHALLENGING = 'challenging';
const FIRST_SEQUENCE = 0;

export async function requestChallenge(events: EventStore, requestId: string, requestedBy: string): Promise<number> {
  const request = await loadRequest(events, requestId);
  if (request === null) throw new RequestNotFoundError(requestId);
  if (request.state !== CHALLENGING && !canTransitionRequest(request.state, CHALLENGING)) {
    throw new RequestChallengeRefusedError(requestId, request.state);
  }
  return (await events.append(REQUEST_CHALLENGE_REQUESTED_EVENT, requestSubject(requestId), { requestedBy })).sequence;
}

export async function pendingChallenges(events: EventStore): Promise<readonly string[]> {
  const records = await events.read(REQUEST_SUBJECT_PREFIX, FIRST_SEQUENCE);
  const pending: string[] = [];
  for (const request of await loadRequests(events)) {
    const own = records.filter((record) => record.subject === requestSubject(request.id));
    const requested = own.findLastIndex((record) => record.type === REQUEST_CHALLENGE_REQUESTED_EVENT);
    const started = own.findLastIndex((record) => record.type === REQUEST_CHALLENGE_STARTED_EVENT);
    const allowed = request.state === CHALLENGING || canTransitionRequest(request.state, CHALLENGING);
    if (requested > started && allowed && request.challengeAttempts < MAX_CHALLENGE_ATTEMPTS) pending.push(request.id);
  }
  return pending;
}
