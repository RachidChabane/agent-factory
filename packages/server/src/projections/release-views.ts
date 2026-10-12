import type { ReleaseView } from '@agent-factory/cockpit';
import { assertReleaseTransition } from '@agent-factory/domain';
import type { ReleaseState } from '@agent-factory/domain';
import {
  AUDIT_SUBJECT_PREFIX,
  RELEASE_CUT_EVENT,
  RELEASE_DETECTED_EVENT,
  RELEASE_EVALUATED_EVENT,
  RELEASE_SUBJECT_PREFIX,
  RELEASE_WATCH_SUBJECT,
  ReleaseDetectedPayloadSchema,
  ReleaseEvaluatedPayloadSchema,
  type PipelineJournal,
  type ReleaseEvaluatedPayload,
} from '@agent-factory/application';
import { firstOf, iso, lastOf, type EventIndex } from './event-index.ts';
import type { ProjectSnapshotContext } from './snapshot-context.ts';

const TAG_SOURCE = 'tag';

function gateState(from: ReleaseState, evaluation: ReleaseEvaluatedPayload | null): ReleaseState {
  if (evaluation === null || from === 'open') return from;
  assertReleaseTransition('cut', 'auditing');
  const verdict: ReleaseState = evaluation.promotable ? 'promotable' : 'blocked';
  assertReleaseTransition('auditing', verdict);
  return verdict;
}

export function evaluations(index: EventIndex): ReadonlyMap<string, ReleaseEvaluatedPayload> {
  const latest = new Map<string, ReleaseEvaluatedPayload>();
  for (const subject of index.subjectsWithPrefix(RELEASE_SUBJECT_PREFIX)) {
    const record = lastOf(index.subject(subject), RELEASE_EVALUATED_EVENT);
    if (record === null) continue;
    const payload = ReleaseEvaluatedPayloadSchema.parse(record.payload);
    latest.set(payload.releaseId, payload);
  }
  return latest;
}

export function releaseOfCommits(index: EventIndex): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  for (const evaluation of evaluations(index).values()) {
    for (const sha of evaluation.commitShas) {
      if (!owners.has(sha)) owners.set(sha, evaluation.releaseId);
    }
  }
  return owners;
}

export function projectReleases(index: EventIndex, journals: ReadonlyMap<number, PipelineJournal>, context: ProjectSnapshotContext): ReleaseView[] {
  const issueOfPullRequest = new Map<number, PipelineJournal>();
  for (const journal of journals.values()) {
    if (journal.pullRequest !== null) issueOfPullRequest.set(journal.pullRequest.number, journal);
  }
  const audited = new Set(index.subjectsWithPrefix(AUDIT_SUBJECT_PREFIX).map((subject) => subject.slice(AUDIT_SUBJECT_PREFIX.length)));
  const views: ReleaseView[] = [];
  for (const subject of index.subjectsWithPrefix(RELEASE_SUBJECT_PREFIX)) {
    if (subject === RELEASE_WATCH_SUBJECT) continue;
    const records = index.subject(subject);
    const firstDetection = firstOf(records, RELEASE_DETECTED_EVENT);
    const lastDetection = lastOf(records, RELEASE_DETECTED_EVENT);
    if (firstDetection === null || lastDetection === null) continue;
    const detection = ReleaseDetectedPayloadSchema.parse(lastDetection.payload);
    const evaluatedRecord = lastOf(records, RELEASE_EVALUATED_EVENT);
    const evaluation = evaluatedRecord === null ? null : ReleaseEvaluatedPayloadSchema.parse(evaluatedRecord.payload);
    const cutRecord = lastOf(records, RELEASE_CUT_EVENT);
    const cutAt = detection.source === TAG_SOURCE ? firstDetection.occurredAt : (cutRecord?.occurredAt ?? null);
    const initial: ReleaseState = cutAt === null ? 'open' : 'cut';
    views.push({
      id: detection.releaseId,
      state: gateState(initial, evaluation),
      source: detection.source,
      ref: detection.ref,
      title: detection.title,
      pullRequestNumber: detection.pullRequestNumber,
      createdAt: detection.createdAt,
      detectedAt: iso(firstDetection.occurredAt),
      cutAt: cutAt === null ? null : iso(cutAt),
      promotedAt: null,
      verifiedAt: null,
      supersededBy: detection.supersededBy,
      commits: (evaluation?.commits ?? []).map((commit) => {
        const journal = commit.pullRequestNumber === null ? undefined : issueOfPullRequest.get(commit.pullRequestNumber);
        const evidenceComplete = journal?.evidence === null || journal === undefined ? null : journal.evidence.bundle.missing.length === 0;
        return {
          sha: commit.sha,
          message: commit.message,
          author: commit.author,
          pullRequestNumber: commit.pullRequestNumber,
          issueNumber: journal?.issueNumber ?? null,
          attribution: commit.attribution,
          automation: commit.automation,
          auditId: audited.has(commit.sha) ? commit.sha : null,
          evidenceComplete,
        };
      }),
      gate: {
        promotable: evaluation?.promotable ?? false,
        blockingReasons: evaluation?.blockingReasons ?? [],
        evaluatedAt: evaluatedRecord === null ? null : iso(evaluatedRecord.occurredAt),
      },
      health: evaluation?.health ?? [],
      productionWorkflowUrl: context.productionWorkflowUrl,
      report: evaluation?.report ?? '',
    });
  }
  return views.sort((left, right) => right.detectedAt.localeCompare(left.detectedAt));
}
