export const FACTORY_BRANCH_PREFIX = 'factory/';
export const FACTORY_LABEL = 'factory';
export const BOT_LOGIN_SUFFIX = '[bot]';

export interface AttributableCommit {
  readonly authorLogin: string | null;
  readonly pullRequestNumber: number | null;
  readonly pullRequestBranch: string | null;
  readonly pullRequestLabels: readonly string[];
}

export const DETECTED_AUDIT_REASONS = ['direct-push', 'bot-author', 'branch-not-factory', 'missing-factory-label'] as const;
export type DetectedAuditReason = (typeof DETECTED_AUDIT_REASONS)[number];

export const ON_DEMAND_AUDIT_REASON = 'on-demand';
export const AUDIT_REASONS = [...DETECTED_AUDIT_REASONS, ON_DEMAND_AUDIT_REASON] as const;
export type AuditReason = (typeof AUDIT_REASONS)[number];

export type MergeAttribution =
  | { readonly kind: 'factory-merge' }
  | { readonly kind: 'audit'; readonly reason: DetectedAuditReason };

export function attributeCommit(commit: AttributableCommit): MergeAttribution {
  if (commit.pullRequestNumber === null) return { kind: 'audit', reason: 'direct-push' };
  if (commit.authorLogin?.endsWith(BOT_LOGIN_SUFFIX)) return { kind: 'audit', reason: 'bot-author' };
  if (!commit.pullRequestBranch?.startsWith(FACTORY_BRANCH_PREFIX)) {
    return { kind: 'audit', reason: 'branch-not-factory' };
  }
  if (!commit.pullRequestLabels.includes(FACTORY_LABEL)) return { kind: 'audit', reason: 'missing-factory-label' };
  return { kind: 'factory-merge' };
}
