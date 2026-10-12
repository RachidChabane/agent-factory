import { OPEN_AUDIT_STATES, REASON_NO_HEALTH_CHECKS, UNRESOLVED_VERDICT_STATES } from '@agent-factory/domain';
import type { AuditView, ReleaseView } from '../../contract/index.ts';
import { toEpoch } from '../../i18n/formatters.ts';
import type { Translate } from '../../i18n/create-i18n.ts';
import type { Vocabulary } from '../../i18n/vocabulary.ts';
import { releaseNeedsOperator } from '../../model/attention.ts';
import { shortSha } from '../../model/identifiers.ts';
import type { StatusMark } from '../../model/status.ts';

export const RELEASE_GROUPS = ['current', 'verified', 'superseded'] as const;
export type ReleaseGroup = (typeof RELEASE_GROUPS)[number];

export function releaseGroupOf(release: Pick<ReleaseView, 'state' | 'supersededBy'>): ReleaseGroup {
  if (release.supersededBy !== null) return 'superseded';
  return release.state === 'verified' ? 'verified' : 'current';
}

/** The last thing that happened to a release, for sorting and for the list. */
export function releaseActivityAt(release: ReleaseView): string {
  return release.verifiedAt ?? release.promotedAt ?? release.gate.evaluatedAt ?? release.cutAt ?? release.detectedAt;
}

function byUrgency(left: ReleaseView, right: ReleaseView): number {
  return Number(releaseNeedsOperator(right)) - Number(releaseNeedsOperator(left)) || toEpoch(releaseActivityAt(right)) - toEpoch(releaseActivityAt(left));
}

export function groupReleases(releases: readonly ReleaseView[]): Readonly<Record<ReleaseGroup, readonly ReleaseView[]>> {
  return {
    current: releases.filter((release) => releaseGroupOf(release) === 'current').toSorted(byUrgency),
    verified: releases.filter((release) => releaseGroupOf(release) === 'verified').toSorted(byUrgency),
    superseded: releases.filter((release) => releaseGroupOf(release) === 'superseded').toSorted(byUrgency),
  };
}

export const GATE_CONDITION_IDS = ['audits', 'evidence', 'health'] as const;
export type GateConditionId = (typeof GATE_CONDITION_IDS)[number];

export interface GateCondition {
  readonly id: GateConditionId;
  readonly mark: StatusMark;
  /** How many items the condition looked at. */
  readonly total: number;
  /** How many of them do not meet it. */
  readonly failing: number;
  /** The identifiers of the failing items, when they have any. */
  readonly failingIds: readonly string[];
}

function isOpenAudit(audit: Pick<AuditView, 'state' | 'resolved'>): boolean {
  return OPEN_AUDIT_STATES.includes(audit.state) || (UNRESOLVED_VERDICT_STATES.includes(audit.state) && !audit.resolved);
}

/** The three conditions the gate weighs, computed from what the cockpit holds about the release. */
export function gateConditions(release: ReleaseView, audits: readonly AuditView[]): readonly GateCondition[] {
  const commitShas = new Set(release.commits.map((commit) => commit.sha));
  const related = audits.filter((audit) => commitShas.has(audit.commitSha));
  const open = related.filter(isOpenAudit);
  const factoryCommits = release.commits.filter((commit) => commit.attribution === 'factory-merge');
  const incomplete = factoryCommits.filter((commit) => commit.evidenceComplete === false);
  const failedHealth = release.health.filter((check) => !check.passed);
  return [
    { id: 'audits', mark: open.length === 0 ? 'success' : 'failed', total: related.length, failing: open.length, failingIds: open.map((audit) => shortSha(audit.commitSha)) },
    { id: 'evidence', mark: incomplete.length === 0 ? 'success' : 'failed', total: factoryCommits.length, failing: incomplete.length, failingIds: [] },
    {
      id: 'health',
      mark: release.health.length === 0 ? 'idle' : failedHealth.length === 0 ? 'success' : 'failed',
      total: release.health.length,
      failing: failedHealth.length,
      failingIds: [],
    },
  ];
}

const AUDIT_OPEN_REASON = /^audit (\S+) is open on commit (\S+)$/;
const INCOMPLETE_EVIDENCE_REASON = /^pull request #(\d+) has incomplete evidence$/;
const HEALTH_FAILED_REASON = /^health check (.+) of (.+) failed$/;

/** Words a blocking reason of the gate in the active language; a reason the cockpit does not know is shown as the factory wrote it. */
export function describeGateReason(reason: string, t: Translate, vocabulary: Vocabulary): string {
  if (reason === REASON_NO_HEALTH_CHECKS) return t('releases.reason.noHealthChecks');
  const audit = AUDIT_OPEN_REASON.exec(reason);
  if (audit !== null) {
    const state = OPEN_AUDIT_STATES.concat(UNRESOLVED_VERDICT_STATES).find((candidate) => candidate === audit[1]);
    return t('releases.reason.auditOpen', { state: state === undefined ? (audit[1] ?? '') : vocabulary.auditState(state).toLowerCase(), commit: shortSha(audit[2] ?? '') });
  }
  const evidence = INCOMPLETE_EVIDENCE_REASON.exec(reason);
  if (evidence !== null) return t('releases.reason.incompleteEvidence', { number: evidence[1] ?? '' });
  const health = HEALTH_FAILED_REASON.exec(reason);
  if (health !== null) return t('releases.reason.healthFailed', { name: health[1] ?? '', environment: health[2] ?? '' });
  return reason;
}
