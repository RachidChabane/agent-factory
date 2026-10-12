import { matchesAnyGlob } from './glob.ts';

export const BOT_LOGIN_SUFFIX = '[bot]';

export interface AttributableCommit {
  readonly authorLogin: string | null;
  readonly pullRequestNumber: number | null;
  readonly pullRequestBranch: string | null;
  readonly pullRequestLabels: readonly string[];
}

/** Another automation of the repository whose changes are recorded but not audited. */
export interface AutomationPattern {
  readonly name: string;
  /** Globs over the head branch of the change's pull request; empty matches any branch. */
  readonly branches: readonly string[];
  /** Globs over the login of the change's author; empty matches any author. */
  readonly authors: readonly string[];
}

/** How a project recognises the changes its factory merged and the ones of its other automations. */
export interface AttributionRules {
  readonly branchPrefix: string;
  readonly factoryLabel: string;
  readonly automations: readonly AutomationPattern[];
}

export const DETECTED_AUDIT_REASONS = ['direct-push', 'bot-author', 'branch-not-factory', 'missing-factory-label'] as const;
export type DetectedAuditReason = (typeof DETECTED_AUDIT_REASONS)[number];

export const ON_DEMAND_AUDIT_REASON = 'on-demand';
export const AUDIT_REASONS = [...DETECTED_AUDIT_REASONS, ON_DEMAND_AUDIT_REASON] as const;
export type AuditReason = (typeof AUDIT_REASONS)[number];

export type MergeAttribution =
  | { readonly kind: 'factory-merge' }
  | { readonly kind: 'automation'; readonly automation: string }
  | { readonly kind: 'audit'; readonly reason: DetectedAuditReason };
export type MergeAttributionKind = MergeAttribution['kind'];
export const MERGE_ATTRIBUTION_KINDS = ['factory-merge', 'automation', 'audit'] as const satisfies readonly MergeAttributionKind[];

function matchesAutomation(commit: AttributableCommit, pattern: AutomationPattern): boolean {
  if (pattern.branches.length === 0 && pattern.authors.length === 0) return false;
  const branch = commit.pullRequestBranch;
  const author = commit.authorLogin;
  const branchMatches = pattern.branches.length === 0 || (branch !== null && matchesAnyGlob(branch, pattern.branches));
  const authorMatches = pattern.authors.length === 0 || (author !== null && matchesAnyGlob(author, pattern.authors));
  return branchMatches && authorMatches;
}

function auditReason(commit: AttributableCommit, rules: AttributionRules): DetectedAuditReason | null {
  if (commit.pullRequestNumber === null) return 'direct-push';
  if (commit.authorLogin?.endsWith(BOT_LOGIN_SUFFIX)) return 'bot-author';
  if (!commit.pullRequestBranch?.startsWith(rules.branchPrefix)) return 'branch-not-factory';
  if (!commit.pullRequestLabels.includes(rules.factoryLabel)) return 'missing-factory-label';
  return null;
}

export function attributeCommit(commit: AttributableCommit, rules: AttributionRules): MergeAttribution {
  const reason = auditReason(commit, rules);
  if (reason === null) return { kind: 'factory-merge' };
  const automation = rules.automations.find((pattern) => matchesAutomation(commit, pattern));
  return automation === undefined ? { kind: 'audit', reason } : { kind: 'automation', automation: automation.name };
}
