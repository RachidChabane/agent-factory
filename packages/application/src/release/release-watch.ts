import { z } from 'zod';
import type { EventStore, GitHubGateway, OpenPullRequestSummary, TagRef } from '../ports.ts';
import type { ReleaseDescriptor } from './evaluate-release.ts';
import { RELEASE_SUBJECT_PREFIX, releaseSubject } from './events.ts';

export const RELEASE_PLEASE_BRANCH_PREFIX = 'release-please--';
export const RELEASE_TAG_MARKER = '-v';
export const RELEASE_DETECTED_EVENT = 'release.detected';
export const RELEASE_TAGS_SEEDED_EVENT = 'release.tags-seeded';
export const RELEASE_WATCH_SUBJECT = `${RELEASE_SUBJECT_PREFIX}watch`;
export const PULL_REQUEST_RELEASE_PREFIX = 'pr-';
export const RELEASE_SOURCES = ['pull-request', 'tag'] as const;

const FIRST_SEQUENCE = 0;
const NAME_COLLATION = new Intl.Collator('en', { numeric: true });

const TagPayloadSchema = z.object({ name: z.string().min(1), sha: z.string().min(1) });

export const ReleaseTagsSeededPayloadSchema = z.object({ tags: z.array(TagPayloadSchema) });

export const ReleaseDetectedPayloadSchema = z.object({
  releaseId: z.string().min(1),
  source: z.enum(RELEASE_SOURCES),
  ref: z.string().min(1),
  baseSha: z.string().nullable(),
  headSha: z.string().min(1),
  pullRequestNumber: z.number().int().positive().nullable(),
  title: z.string(),
});
export type ReleaseDetectedPayload = z.infer<typeof ReleaseDetectedPayloadSchema>;

export interface ReleaseWatchDependencies {
  readonly events: EventStore;
  readonly github: GitHubGateway;
}

export interface DetectedRelease {
  readonly descriptor: ReleaseDescriptor;
  readonly detection: ReleaseDetectedPayload;
}

export function isReleaseTag(name: string): boolean {
  return name.includes(RELEASE_TAG_MARKER);
}

export function releaseComponent(tag: string): string {
  return tag.slice(0, tag.lastIndexOf(RELEASE_TAG_MARKER));
}

export function isReleasePullRequest(pullRequest: OpenPullRequestSummary): boolean {
  return pullRequest.branch.startsWith(RELEASE_PLEASE_BRANCH_PREFIX);
}

interface WatchMemory {
  readonly seeded: boolean;
  readonly tags: readonly TagRef[];
  readonly detections: readonly ReleaseDetectedPayload[];
}

async function remember(events: EventStore): Promise<WatchMemory> {
  const records = await events.read(RELEASE_SUBJECT_PREFIX, FIRST_SEQUENCE);
  let seeded = false;
  const tags: TagRef[] = [];
  const detections: ReleaseDetectedPayload[] = [];
  for (const record of records) {
    if (record.type === RELEASE_TAGS_SEEDED_EVENT) {
      seeded = true;
      tags.push(...ReleaseTagsSeededPayloadSchema.parse(record.payload).tags);
    } else if (record.type === RELEASE_DETECTED_EVENT) {
      const detection = ReleaseDetectedPayloadSchema.parse(record.payload);
      detections.push(detection);
      if (detection.source === 'tag') tags.push({ name: detection.ref, sha: detection.headSha });
    }
  }
  return { seeded, tags, detections };
}

function previousTag(known: readonly TagRef[], tag: string | null): TagRef | null {
  const candidates = known
    .filter((candidate) => tag === null || (releaseComponent(candidate.name) === releaseComponent(tag) && NAME_COLLATION.compare(candidate.name, tag) < 0))
    .sort((left, right) => NAME_COLLATION.compare(left.name, right.name));
  return candidates.at(-1) ?? null;
}

async function record(events: EventStore, detection: ReleaseDetectedPayload): Promise<DetectedRelease> {
  await events.append(RELEASE_DETECTED_EVENT, releaseSubject(detection.releaseId), detection);
  return { detection, descriptor: { releaseId: detection.releaseId, branch: detection.ref, baseSha: detection.baseSha } };
}

export async function redetectPullRequestRelease(events: EventStore, detection: ReleaseDetectedPayload, headSha: string): Promise<DetectedRelease> {
  return record(events, { ...detection, headSha });
}

export async function watchReleases(dependencies: ReleaseWatchDependencies, baseBranch: string): Promise<readonly DetectedRelease[]> {
  const { events, github } = dependencies;
  const memory = await remember(events);
  const tags = (await github.listTags()).filter((tag) => isReleaseTag(tag.name));
  if (!memory.seeded) {
    await events.append(RELEASE_TAGS_SEEDED_EVENT, RELEASE_WATCH_SUBJECT, { tags });
    return [];
  }
  const detected: DetectedRelease[] = [];
  const known = [...memory.tags];
  const newTags = tags
    .filter((tag) => !known.some((seen) => seen.name === tag.name))
    .sort((left, right) => NAME_COLLATION.compare(left.name, right.name));
  for (const tag of newTags) {
    const base = previousTag(known, tag.name);
    detected.push(
      await record(events, { releaseId: tag.name, source: 'tag', ref: tag.name, baseSha: base?.sha ?? null, headSha: tag.sha, pullRequestNumber: null, title: tag.name }),
    );
    known.push(tag);
  }
  for (const pullRequest of (await github.listOpenPullRequests()).filter(isReleasePullRequest)) {
    const seen = memory.detections.some((detection) => detection.pullRequestNumber === pullRequest.number && detection.headSha === pullRequest.headSha);
    if (seen) continue;
    detected.push(
      await record(events, {
        releaseId: `${PULL_REQUEST_RELEASE_PREFIX}${pullRequest.number}`,
        source: 'pull-request',
        ref: baseBranch,
        baseSha: previousTag(known, null)?.sha ?? null,
        headSha: pullRequest.headSha,
        pullRequestNumber: pullRequest.number,
        title: pullRequest.title,
      }),
    );
  }
  return detected;
}

export class ReleaseNotFoundError extends Error {
  constructor(releaseId: string) {
    super(`release ${releaseId} was never detected`);
    this.name = 'ReleaseNotFoundError';
  }
}

export async function detectedRelease(events: EventStore, releaseId: string): Promise<ReleaseDescriptor> {
  const subject = releaseSubject(releaseId);
  const last = (await events.read(subject, FIRST_SEQUENCE)).findLast((record) => record.subject === subject && record.type === RELEASE_DETECTED_EVENT);
  if (last === undefined) throw new ReleaseNotFoundError(releaseId);
  const detection = ReleaseDetectedPayloadSchema.parse(last.payload);
  return { releaseId: detection.releaseId, branch: detection.ref, baseSha: detection.baseSha };
}
