import { attributeCommit, type AttributionRules } from '@agent-factory/domain';
import type { CommitSummary, EventStore, GitHubGateway } from '../ports.ts';
import {
  AUDIT_CURSOR_ADVANCED_EVENT,
  AUDIT_DETECTED_EVENT,
  AUDIT_SKIPPED_EVENT,
  CursorAdvancedPayloadSchema,
  auditSubject,
  watcherSubject,
  type AuditDetectedPayload,
  type AuditSkippedPayload,
  type CursorAdvancedPayload,
} from './events.ts';

export interface MergeWatcherDependencies {
  readonly events: EventStore;
  readonly github: GitHubGateway;
}

export interface MergeWatcherSettings {
  readonly branch: string;
  readonly startSha: string | null;
  readonly rules: AttributionRules;
}

export interface FactoryMerge {
  readonly sha: string;
  readonly pullRequestNumber: number;
}

export interface MergeScanResult {
  readonly scanned: number;
  readonly detectedAuditIds: readonly string[];
  /** Changes of the repository's other automations, recorded without an audit. */
  readonly skippedShas: readonly string[];
  readonly factoryMerges: readonly FactoryMerge[];
  readonly cursor: string | null;
}

const FIRST_SEQUENCE = 0;

export async function readCursor(events: EventStore, branch: string): Promise<string | null> {
  const subject = watcherSubject(branch);
  const records = (await events.read(subject, FIRST_SEQUENCE)).filter(
    (record) => record.subject === subject && record.type === AUDIT_CURSOR_ADVANCED_EVENT,
  );
  const last = records.at(-1);
  return last === undefined ? null : CursorAdvancedPayloadSchema.parse(last.payload).sha;
}

async function advanceCursor(events: EventStore, branch: string, sha: string): Promise<void> {
  const payload: CursorAdvancedPayload = { branch, sha };
  await events.append(AUDIT_CURSOR_ADVANCED_EVENT, watcherSubject(branch), payload);
}

function detectedPayload(commit: CommitSummary, reason: AuditDetectedPayload['reason']): AuditDetectedPayload {
  return {
    commitSha: commit.sha,
    reason,
    commitMessage: commit.message,
    authorLogin: commit.authorLogin,
    pullRequestNumber: commit.pullRequestNumber,
    pullRequestBranch: commit.pullRequestBranch,
  };
}

function skippedPayload(commit: CommitSummary, automation: string): AuditSkippedPayload {
  return {
    commitSha: commit.sha,
    automation,
    commitMessage: commit.message,
    authorLogin: commit.authorLogin,
    pullRequestNumber: commit.pullRequestNumber,
    pullRequestBranch: commit.pullRequestBranch,
  };
}

async function hasAuditTrail(events: EventStore, sha: string): Promise<boolean> {
  const subject = auditSubject(sha);
  return (await events.read(subject, FIRST_SEQUENCE)).some((record) => record.subject === subject);
}

export async function scanNewMerges(
  dependencies: MergeWatcherDependencies,
  settings: MergeWatcherSettings,
): Promise<MergeScanResult> {
  const { events, github } = dependencies;
  const cursor = (await readCursor(events, settings.branch)) ?? settings.startSha;
  const commits = await github.commitsSince(settings.branch, cursor);
  const detectedAuditIds: string[] = [];
  const skippedShas: string[] = [];
  const factoryMerges: FactoryMerge[] = [];
  let latest = cursor;

  for (const commit of commits) {
    const attribution = attributeCommit(commit, settings.rules);
    if (attribution.kind === 'factory-merge' && commit.pullRequestNumber !== null) {
      factoryMerges.push({ sha: commit.sha, pullRequestNumber: commit.pullRequestNumber });
    }
    if (attribution.kind === 'audit' && !(await hasAuditTrail(events, commit.sha))) {
      await events.append(AUDIT_DETECTED_EVENT, auditSubject(commit.sha), detectedPayload(commit, attribution.reason));
      detectedAuditIds.push(commit.sha);
    }
    if (attribution.kind === 'automation' && !(await hasAuditTrail(events, commit.sha))) {
      await events.append(AUDIT_SKIPPED_EVENT, auditSubject(commit.sha), skippedPayload(commit, attribution.automation));
      skippedShas.push(commit.sha);
    }
    await advanceCursor(events, settings.branch, commit.sha);
    latest = commit.sha;
  }
  return { scanned: commits.length, detectedAuditIds, skippedShas, factoryMerges, cursor: latest };
}

export async function seedMergeCursor(dependencies: MergeWatcherDependencies, branch: string): Promise<string | null> {
  const recorded = await readCursor(dependencies.events, branch);
  if (recorded !== null) return recorded;
  const head = await dependencies.github.branchHead(branch);
  if (head !== null) await advanceCursor(dependencies.events, branch, head);
  return head;
}
