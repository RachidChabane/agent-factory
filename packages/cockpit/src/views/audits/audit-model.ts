import { OPEN_AUDIT_STATES, UNRESOLVED_VERDICT_STATES } from '@agent-factory/domain';
import type { AuditFindingLevel, AuditFindingView, AuditView, ReleaseView, SkippedChangeView } from '../../contract/index.ts';
import { AUDIT_FINDING_LEVELS } from '../../contract/index.ts';
import { toEpoch } from '../../i18n/formatters.ts';
import { canEvaluateRelease } from '../../model/actions.ts';
import { auditNeedsOperator } from '../../model/attention.ts';

/** The two lists of the audits page: the audits of the project, and the changes recorded without one. */
export const AUDIT_LISTS = ['audits', 'skipped'] as const;
export type AuditListId = (typeof AUDIT_LISTS)[number];

export const AUDIT_GROUPS = ['attention', 'inProgress', 'settled'] as const;
export type AuditGroup = (typeof AUDIT_GROUPS)[number];

export type AuditGroups = Readonly<Record<AuditGroup, readonly AuditView[]>>;

/** What an audit asks of the operator: a verdict to deal with, an audit under way, or nothing more. */
export function auditGroupOf(audit: Pick<AuditView, 'state' | 'resolved'>): AuditGroup {
  if (auditNeedsOperator(audit)) return 'attention';
  return OPEN_AUDIT_STATES.includes(audit.state) ? 'inProgress' : 'settled';
}

function byRecency(left: AuditView, right: AuditView): number {
  return toEpoch(right.detectedAt) - toEpoch(left.detectedAt);
}

export function groupAudits(audits: readonly AuditView[]): AuditGroups {
  const inGroup = (group: AuditGroup) => audits.filter((audit) => auditGroupOf(audit) === group).toSorted(byRecency);
  return { attention: inGroup('attention'), inProgress: inGroup('inProgress'), settled: inGroup('settled') };
}

export function orderedAudits(groups: AuditGroups): readonly AuditView[] {
  return AUDIT_GROUPS.flatMap((group) => groups[group]);
}

/** The audits the release gate counts as open: those under way and the verdicts nobody has resolved. */
export function holdsReleaseGate(audit: Pick<AuditView, 'state' | 'resolved'>): boolean {
  return OPEN_AUDIT_STATES.includes(audit.state) || (UNRESOLVED_VERDICT_STATES.includes(audit.state) && !audit.resolved);
}

/** Whether the audit keeps a release from being promoted: it is open and the gate of that release is still being weighed. */
export function holdsRelease(audit: Pick<AuditView, 'state' | 'resolved'>, release: Pick<ReleaseView, 'state' | 'supersededBy'> | undefined): boolean {
  return release !== undefined && holdsReleaseGate(audit) && canEvaluateRelease(release);
}

export interface FindingGroup {
  readonly level: AuditFindingLevel;
  readonly findings: readonly AuditFindingView[];
}

/** The findings under the level they judge (intent, idea, method), leaving out the levels with none. */
export function findingsByLevel(findings: readonly AuditFindingView[]): readonly FindingGroup[] {
  return AUDIT_FINDING_LEVELS.map((level) => ({ level, findings: findings.filter((finding) => finding.level === level) })).filter((group) => group.findings.length > 0);
}

/** The changes recorded without an audit, the most recently recorded first. */
export function newestSkippedFirst(changes: readonly SkippedChangeView[]): readonly SkippedChangeView[] {
  return changes.toSorted((left, right) => toEpoch(right.recordedAt) - toEpoch(left.recordedAt));
}

/** The audit that already exists for a change recorded without one, when the operator has asked for it. */
export function auditOfSkippedChange(audits: readonly Pick<AuditView, 'id' | 'commitSha' | 'state'>[], change: Pick<SkippedChangeView, 'commitSha'>) {
  return audits.find((audit) => audit.commitSha === change.commitSha);
}
