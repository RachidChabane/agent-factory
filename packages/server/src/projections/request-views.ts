import type { RequestView } from '@agent-factory/cockpit';
import { foldRequestEvents, REQUEST_CHALLENGE_FAILED_EVENT, REQUEST_SUBJECT_PREFIX, requestSubject, type RequestRecord } from '@agent-factory/application';
import { iso, lastOf, type EventIndex } from './event-index.ts';
import type { ProjectSnapshotContext } from './snapshot-context.ts';

function requestView(request: RequestRecord, index: EventIndex, context: ProjectSnapshotContext): RequestView {
  const failed = lastOf(index.subject(requestSubject(request.id)), REQUEST_CHALLENGE_FAILED_EVENT);
  const challenge = request.challenge;
  return {
    id: request.id,
    title: request.title,
    requester: request.requester,
    channel: request.channel,
    receivedAt: request.receivedAt,
    updatedAt: request.updatedAt,
    state: request.state,
    body: request.body,
    attachments: request.attachments.map((attachment) => ({
      name: attachment.name,
      url: context.links.requestAttachment(request.id, attachment.path),
      mediaType: attachment.mediaType,
    })),
    challenge:
      challenge === null
        ? null
        : {
            runId: challenge.runId,
            completedAt: challenge.completedAt,
            summary: challenge.summary,
            items: challenge.items.map((item) => ({ ...item, sources: [...item.sources] })),
            specs: challenge.specs.map((spec) => {
              const issueNumber = request.createdIssues[spec.id] ?? null;
              return {
                id: spec.id,
                itemIds: [...spec.itemIds],
                title: spec.title,
                type: spec.type,
                need: spec.need,
                acceptanceCriteria: [...spec.acceptanceCriteria],
                outOfScope: [...spec.outOfScope],
                expectedProof: spec.expectedProof,
                problems: [...spec.problems],
                issueNumber,
              };
            }),
            reply: challenge.reply,
          },
    lastChallengeFailure: request.lastFailure === null || failed === null ? null : { at: iso(failed.occurredAt), reason: request.lastFailure },
    issueNumbers: [...request.issueNumbers],
    declineReason: request.declineReason,
  };
}

export function projectRequests(index: EventIndex, context: ProjectSnapshotContext): RequestView[] {
  const records = index.subjectsWithPrefix(REQUEST_SUBJECT_PREFIX).flatMap((subject) => index.subject(subject));
  return foldRequestEvents([...records].sort((left, right) => left.sequence - right.sequence))
    .map((request) => requestView(request, index, context))
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
}
