import type { CommitKind, IssueSpec, IssueType } from '@agent-factory/domain';
import type { ConventionalScopes } from './pipeline-settings.ts';

export const DEFAULT_COMMIT_KIND_BY_ISSUE_TYPE: Readonly<Record<IssueType, CommitKind>> = {
  ui: 'feat',
  'skill-prompt': 'feat',
  'engine-api': 'feat',
  security: 'fix',
  'infra-ci': 'ci',
  data: 'feat',
  dependencies: 'build',
  doc: 'docs',
  release: 'chore',
  refactor: 'refactor',
};

export const DEPLOYMENT_COMMIT_KIND: CommitKind = 'feat';
export const DEPLOYMENT_ISSUE_TYPE: IssueType = 'infra-ci';
export const DEFAULT_DEPLOYMENT_PATHS: readonly string[] = ['infrastructure/**', 'environments/**'];
export const DEFAULT_SCOPE_BY_ISSUE_TYPE: Readonly<Partial<Record<IssueType, string>>> = { dependencies: 'deps' };

export const CHECKS_COMMIT_TYPE = 'test';
export const CONVENTIONAL_SUBJECT_PATTERN = /^[a-z].+[^.]$/;
const TRAILING_PERIODS = /[.\s]+$/;
export const EVIDENCE_COMMIT_TYPE = 'chore';
export const EVIDENCE_COMMIT_SCOPE = 'evidence';
const GLOB_SPECIAL = /[.+^${}()|[\]\\]/g;
const GLOBSTAR = '**';
const GLOBSTAR_PLACEHOLDER = '\u0000';

export function globPattern(glob: string): RegExp {
  const escaped = glob
    .replaceAll(GLOBSTAR, GLOBSTAR_PLACEHOLDER)
    .replace(GLOB_SPECIAL, '\\$&')
    .replaceAll('*', '[^/]*')
    .replaceAll('?', '[^/]')
    .replaceAll(GLOBSTAR_PLACEHOLDER, '.*');
  return new RegExp(`^${escaped}$`);
}

export function touchesAny(paths: readonly string[], globs: readonly string[]): boolean {
  const patterns = globs.map(globPattern);
  return paths.some((path) => patterns.some((pattern) => pattern.test(path)));
}

export function commitKindFor(spec: IssueSpec, scopes: ConventionalScopes, changedPaths: readonly string[] = []): CommitKind {
  if (spec.commitKind !== null) return spec.commitKind;
  const configured = scopes.kindByType?.[spec.type];
  if (configured !== undefined) return configured;
  if (spec.type === DEPLOYMENT_ISSUE_TYPE && touchesAny(changedPaths, scopes.deploymentPaths ?? DEFAULT_DEPLOYMENT_PATHS)) return DEPLOYMENT_COMMIT_KIND;
  return DEFAULT_COMMIT_KIND_BY_ISSUE_TYPE[spec.type];
}

export function scopeFor(type: IssueType, scopes: ConventionalScopes): string {
  return scopes.byType[type] ?? DEFAULT_SCOPE_BY_ISSUE_TYPE[type] ?? scopes.defaultScope;
}

export function conventionalHeader(type: string, scope: string, subject: string): string {
  return `${type}(${scope}): ${subject}`;
}

export function conventionalSubject(title: string): string {
  const subject = title.trim().replace(TRAILING_PERIODS, '');
  return `${subject.charAt(0).toLowerCase()}${subject.slice(1)}`;
}

export function pullRequestTitle(spec: IssueSpec, scopes: ConventionalScopes, changedPaths: readonly string[] = []): string {
  return conventionalHeader(commitKindFor(spec, scopes, changedPaths), scopeFor(spec.type, scopes), conventionalSubject(spec.title));
}

export function checksCommitMessage(spec: IssueSpec, scopes: ConventionalScopes): string {
  return conventionalHeader(CHECKS_COMMIT_TYPE, scopeFor(spec.type, scopes), `add acceptance checks for #${spec.number}`);
}

export function checkRewriteCommitMessage(spec: IssueSpec, scopes: ConventionalScopes, path: string): string {
  return conventionalHeader(CHECKS_COMMIT_TYPE, scopeFor(spec.type, scopes), `rewrite the acceptance check ${path} for #${spec.number}`);
}

export function implementationCommitMessage(spec: IssueSpec, scopes: ConventionalScopes, changedPaths: readonly string[] = []): string {
  return `${pullRequestTitle(spec, scopes, changedPaths)}\n\nRefs #${spec.number}`;
}

export function evidenceCommitMessage(spec: IssueSpec): string {
  return conventionalHeader(EVIDENCE_COMMIT_TYPE, EVIDENCE_COMMIT_SCOPE, `add proof for #${spec.number}`);
}

export function evidenceRemovalCommitMessage(issueNumber: number): string {
  return conventionalHeader(EVIDENCE_COMMIT_TYPE, EVIDENCE_COMMIT_SCOPE, `remove proof of #${issueNumber} before merge`);
}
