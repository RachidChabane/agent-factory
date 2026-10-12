import type { RequestView } from '@agent-factory/cockpit';
import { foldRequestEvents, REQUEST_SUBJECT_PREFIX, type RequestRecord } from '@agent-factory/application';
import type { EventIndex } from './event-index.ts';
import type { SnapshotContext } from './snapshot-context.ts';

function requestView(request: RequestRecord, context: SnapshotContext): RequestView {
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
                validated: issueNumber !== null,
                issueNumber,
              };
            }),
            reply: challenge.reply,
          },
    issueNumbers: [...request.issueNumbers],
    declineReason: request.declineReason,
  };
}

export function projectRequests(index: EventIndex, context: SnapshotContext): RequestView[] {
  const records = index.subjectsWithPrefix(REQUEST_SUBJECT_PREFIX).flatMap((subject) => index.subject(subject));
  return foldRequestEvents([...records].sort((left, right) => left.sequence - right.sequence))
    .map((request) => requestView(request, context))
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
}
