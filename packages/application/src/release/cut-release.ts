import { z } from 'zod';
import { checksBlockingMerge } from '../pipeline/merge-on-order.ts';
import type { EventStore, GitHubGateway, OpenPullRequestSummary } from '../ports.ts';
import { evaluateRelease, type EvaluateReleaseDependencies } from './evaluate-release.ts';
import { releaseSubject } from './events.ts';
import {
  isReleasePullRequest,
  RELEASE_DETECTED_EVENT,
  ReleaseDetectedPayloadSchema,
  redetectPullRequestRelease,
  ReleaseNotFoundError,
  type ReleaseDetectedPayload,
} from './release-watch.ts';

export const RELEASE_CUT_EVENT = 'release.cut';
const FIRST_SEQUENCE = 0;
const PULL_REQUEST_SOURCE = 'pull-request';

export const ReleaseCutPayloadSchema = z.object({
  releaseId: z.string().min(1),
  pullRequestNumber: z.number().int().positive(),
  headSha: z.string().min(1),
  mergeSha: z.string().min(1),
  operator: z.string().min(1),
});
export type ReleaseCutPayload = z.infer<typeof ReleaseCutPayloadSchema>;

export class ReleaseCutRefusedError extends Error {
  readonly blockingReasons: readonly string[];

  constructor(releaseId: string, reasons: readonly string[]) {
    super(`Release ${releaseId} cannot be cut: ${reasons.join('; ')}`);
    this.name = 'ReleaseCutRefusedError';
    this.blockingReasons = reasons;
  }
}

export interface CutReleaseDependencies extends EvaluateReleaseDependencies {
  readonly events: EventStore;
  readonly github: GitHubGateway;
}

export interface CutOrder {
  readonly releaseId: string;
  readonly operator: string;
}

interface ReleaseRecords {
  readonly detection: ReleaseDetectedPayload;
  readonly cut: ReleaseCutPayload | null;
}

async function releaseRecords(events: EventStore, releaseId: string): Promise<ReleaseRecords> {
  const subject = releaseSubject(releaseId);
  const records = (await events.read(subject, FIRST_SEQUENCE)).filter((record) => record.subject === subject);
  const detected = records.findLast((record) => record.type === RELEASE_DETECTED_EVENT);
  if (detected === undefined) throw new ReleaseNotFoundError(releaseId);
  const cut = records.findLast((record) => record.type === RELEASE_CUT_EVENT);
  return {
    detection: ReleaseDetectedPayloadSchema.parse(detected.payload),
    cut: cut === undefined ? null : ReleaseCutPayloadSchema.parse(cut.payload),
  };
}

export class CutRelease {
  private readonly dependencies: CutReleaseDependencies;

  constructor(dependencies: CutReleaseDependencies) {
    this.dependencies = dependencies;
  }

  async cut(order: CutOrder): Promise<ReleaseCutPayload> {
    const { events, github } = this.dependencies;
    const { releaseId } = order;
    const recorded = await releaseRecords(events, releaseId);
    if (recorded.cut !== null) throw new ReleaseCutRefusedError(releaseId, [`it was cut as ${recorded.cut.mergeSha}`]);
    const { detection } = recorded;
    if (detection.source !== PULL_REQUEST_SOURCE || detection.pullRequestNumber === null) {
      throw new ReleaseCutRefusedError(releaseId, ['it comes from a release tag, so it is already cut']);
    }
    const pullRequest = await this.openReleasePullRequest(releaseId, detection.pullRequestNumber);
    if (pullRequest.headSha !== detection.headSha) await redetectPullRequestRelease(events, detection, pullRequest.headSha);
    const evaluation = await evaluateRelease(this.dependencies, { releaseId, branch: detection.ref, baseSha: detection.baseSha });
    if (!evaluation.promotable) throw new ReleaseCutRefusedError(releaseId, evaluation.blockingReasons);
    const blocking = checksBlockingMerge(await github.checks(pullRequest.headSha), await github.baseBranchChecks());
    if (blocking !== null) throw new ReleaseCutRefusedError(releaseId, [blocking]);
    const mergeSha = await github.squashMerge(pullRequest.number, pullRequest.headSha);
    const payload: ReleaseCutPayload = { releaseId, pullRequestNumber: pullRequest.number, headSha: pullRequest.headSha, mergeSha, operator: order.operator };
    await events.append(RELEASE_CUT_EVENT, releaseSubject(releaseId), payload);
    return payload;
  }

  private async openReleasePullRequest(releaseId: string, number: number): Promise<OpenPullRequestSummary> {
    const open = (await this.dependencies.github.listOpenPullRequests()).find((pullRequest) => pullRequest.number === number);
    if (open === undefined || !isReleasePullRequest(open)) {
      throw new ReleaseCutRefusedError(releaseId, [`release pull request #${number} is not open`]);
    }
    return open;
  }
}
