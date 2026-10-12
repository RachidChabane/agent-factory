import { z } from 'zod';
import { matchesAnyGlob, SEMANTIC_VERSION, supersedingTag } from '@agent-factory/domain';
import type { EventStore, GitHubGateway, OpenPullRequestSummary, TagRef } from '../ports.ts';
import type { ReleaseDescriptor } from './evaluate-release.ts';
import { RELEASE_SUBJECT_PREFIX, releaseSubject } from './events.ts';

export const RELEASE_PLEASE_BRANCH_PREFIX = 'release-please--';
export const RELEASE_DETECTED_EVENT = 'release.detected';
export const RELEASE_TAGS_SEEDED_EVENT = 'release.tags-seeded';
export const RELEASE_WATCH_SUBJECT = `${RELEASE_SUBJECT_PREFIX}watch`;
export const PULL_REQUEST_RELEASE_PREFIX = 'pr-';
export const RELEASE_SOURCES = ['pull-request', 'tag'] as const;

/** How a project marks its releases: release pull requests and their tags, plain tags, or not at all. */
export type ReleaseModel =
  | { readonly kind: 'release-please'; readonly tagPattern: string }
  | { readonly kind: 'tags'; readonly tagPattern: string }
  | { readonly kind: 'none' };

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
  /** When the forge created the release pull request, or the time of the tagged commit. */
  createdAt: z.iso.datetime({ offset: true }).nullable(),
  /** The published tag of the version a release pull request announces; such a pull request is never pending. */
  supersededBy: z.string().nullable(),
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

export function isReleaseTag(name: string, model: ReleaseModel): boolean {
  return model.kind !== 'none' && matchesAnyGlob(name, [model.tagPattern]);
}

/** The name of a tag without its version, so that tags of one component are compared together. */
export function releaseComponent(tag: string): string {
  const match = SEMANTIC_VERSION.exec(tag);
  return match === null ? tag : tag.slice(0, match.index);
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

async function taggedAt(github: GitHubGateway, tag: TagRef): Promise<string | null> {
  try {
    return (await github.commit(tag.sha)).committedAt.toISOString();
  } catch {
    return null;
  }
}

async function detectTags(github: GitHubGateway, events: EventStore, newTags: readonly TagRef[], known: TagRef[]): Promise<readonly DetectedRelease[]> {
  const detected: DetectedRelease[] = [];
  for (const tag of newTags) {
    const base = previousTag(known, tag.name);
    detected.push(
      await record(events, {
        releaseId: tag.name,
        source: 'tag',
        ref: tag.name,
        baseSha: base?.sha ?? null,
        headSha: tag.sha,
        pullRequestNumber: null,
        title: tag.name,
        createdAt: await taggedAt(github, tag),
        supersededBy: null,
      }),
    );
    known.push(tag);
  }
  return detected;
}

/**
 * Notices new releases of a project. The first look only remembers the existing release tags.
 * After that, every new release tag is detected once, and so is every open release pull
 * request each time its head moves; a release pull request whose version is already tagged is
 * recorded as superseded by that tag.
 */
export async function watchReleases(dependencies: ReleaseWatchDependencies, baseBranch: string, model: ReleaseModel): Promise<readonly DetectedRelease[]> {
  if (model.kind === 'none') return [];
  const { events, github } = dependencies;
  const memory = await remember(events);
  const tags = (await github.listTags()).filter((tag) => isReleaseTag(tag.name, model));
  if (!memory.seeded) {
    await events.append(RELEASE_TAGS_SEEDED_EVENT, RELEASE_WATCH_SUBJECT, { tags: tags.map(({ name, sha }) => ({ name, sha })) });
    return [];
  }
  const known = [...memory.tags];
  const newTags = tags
    .filter((tag) => !known.some((seen) => seen.name === tag.name))
    .sort((left, right) => NAME_COLLATION.compare(left.name, right.name));
  const detected = [...(await detectTags(github, events, newTags, known))];
  if (model.kind !== 'release-please') return detected;
  const tagNames = known.map((tag) => tag.name);
  for (const pullRequest of (await github.listOpenPullRequests()).filter(isReleasePullRequest)) {
    const supersededBy = supersedingTag(pullRequest.title, tagNames);
    const seen = memory.detections.some(
      (detection) => detection.pullRequestNumber === pullRequest.number && detection.headSha === pullRequest.headSha && detection.supersededBy === supersededBy,
    );
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
        createdAt: pullRequest.createdAt === null ? null : pullRequest.createdAt.toISOString(),
        supersededBy,
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
